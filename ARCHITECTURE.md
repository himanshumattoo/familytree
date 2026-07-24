# Architecture

This file is the source of truth for how the site is deployed and wired
together. Update it whenever infrastructure, the API contract, or the
deployment process changes — see `CLAUDE.md` for when that's required.

## Overview

Static family tree UI (Treant.js) fetching data from a Google Sheet,
gated behind a password. Everything runs in AWS, account `381492313220`.

```
family.himanshumattoo.com (Route53 alias)
        |
        v
   CloudFront (E1Y26KY0VG71FM)
        |
        +-- default behavior --> S3 bucket family-himanshumattoo-com (private, OAC)
        |                        index.html, fetch-family-data.js, manifest.json,
        |                        sw.js, robots.txt
        |
        +-- /api/* behavior ---> Lambda Function URL (familytree-api, us-east-2)
                                  handles POST /api/login, GET /api/family-data
                                  fetches the published Google Sheet CSV server-side
```

## Resources

| Resource | Identifier | Notes |
|---|---|---|
| Route53 hosted zone | `Z03052381NSROPM2SBLYK` (himanshumattoo.com) | `family` A-record aliases to CloudFront |
| CloudFront distribution | `E1Y26KY0VG71FM` | Alias `family.himanshumattoo.com`, cert below |
| ACM certificate | `arn:aws:acm:us-east-1:381492313220:certificate/684859f8-4c37-491d-ac82-41074c3d89fd` | Must stay in us-east-1 (CloudFront requirement) |
| S3 bucket | `family-himanshumattoo-com` (us-east-1) | Private; bucket policy only allows the CloudFront distribution via OAC `E31DUN0UZW77YW` |
| Lambda function | `familytree-api` (us-east-2, Node.js 20.x, no dependencies) | Source: `lambda/index.js` |
| Lambda Function URL | AuthType `NONE` (public, app-level auth only) | Fronted by CloudFront `/api/*`; also directly reachable — no origin-verify secret is configured (deliberately skipped for simplicity) |
| IAM role | `familytree-lambda-role` | `AWSLambdaBasicExecutionRole` only (CloudWatch Logs) — no other permissions |

## Auth design

- `POST /api/login` — compares SHA-256(password) to the `PASSWORD_HASH` env var (constant-time compare), sets a signed session cookie.
- Session cookie: `expiry.HMAC-SHA256(expiry, SESSION_SECRET)`, httpOnly, Secure, SameSite=Strict, 12h TTL. Stateless — no server-side session store.
- `GET /api/family-data` — validates the cookie, then fetches `SHEET_CSV_URL` server-side and returns the CSV. The Google Sheet URL is never sent to the browser.
- No login rate-limiting (dropped deliberately to keep the stack simple — see chat history if reconsidering this).

## Secrets

Stored as plain Lambda environment variables (encrypted at rest by AWS by default, not SSM/Secrets Manager — deliberate simplification):
- `PASSWORD_HASH` — SHA-256 hex of the gate password
- `SESSION_SECRET` — random HMAC signing key
- `SHEET_CSV_URL` — the Google Sheet's "Publish to web → CSV" link (File → Share → Publish to web on the sheet, tab must show "Published")

## Deployment (all manual via AWS CLI — no IaC/pipeline exists)

Static files:
```
aws s3 cp <file> s3://family-himanshumattoo-com/<file>
aws cloudfront create-invalidation --distribution-id E1Y26KY0VG71FM --paths "/*"
```

Lambda code (`lambda/index.js`):
```
cd lambda && zip -q ../lambda-deploy.zip index.js && cd ..
aws lambda update-function-code --function-name familytree-api --zip-file fileb://lambda-deploy.zip
rm lambda-deploy.zip
```

Lambda env vars (secrets) — update via a temp file, never inline on the CLI (shell history / `ps` exposure):
```
aws lambda update-function-configuration --function-name familytree-api --environment file:///path/to/temp-env.json
```

## Known accepted risks

- The gate password and `SHEET_CSV_URL` currently in use predate this security work and were never rotated (git history was scrubbed instead — see commit history around the security fix).
- No rate limiting on `/api/login`.
- Lambda Function URL is directly reachable, bypassing CloudFront (no shared-secret origin check configured).

## History

- Originally a GitHub Pages static site with a client-side-only password gate and a public Google Sheets CSV URL — neither actually protected the data. GitHub Pages is now disabled.
- Briefly considered Cloudflare Pages Functions for the API layer; moved to AWS Lambda instead since the user wanted to stay AWS-only, reusing an S3+CloudFront stack that was already set up for `family.himanshumattoo.com`.
