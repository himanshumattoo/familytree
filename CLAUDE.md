# Instructions for Claude

## Keep ARCHITECTURE.md current

`ARCHITECTURE.md` is the only record of how this site is actually deployed —
AWS resource IDs, the auth design, and the deployment commands live there,
not in any IaC (there isn't any; everything was provisioned by hand via the
AWS CLI).

Before every `git push` to this repo:
1. Check whether the changes being pushed affect anything `ARCHITECTURE.md`
   describes — infrastructure (new/changed/removed AWS resources), the API
   contract, the auth/session design, secrets, or the deployment process.
2. If so, update `ARCHITECTURE.md` in the same commit being pushed. Don't
   push architecture-affecting changes without it.
3. If not, no action needed — most commits (UI tweaks, copy changes, etc.)
   don't touch it.

Keep the update proportional: a one- or two-line edit to the relevant
section is normal; don't rewrite the whole file for a small change.
