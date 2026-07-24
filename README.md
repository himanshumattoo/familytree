# Family Tree

This project renders an interactive family tree in the browser using [Treant.js](https://fperucic.github.io/treant-js/) and data from a Google Sheet.

## How it works

1. **Data source** – Family member information is kept in a Google Sheet that is
   published as a CSV file. The published URL is stored server-side as the
   `SHEET_CSV_URL` env var on the `familytree-api` Lambda (see
   `ARCHITECTURE.md`) — it's never sent to the browser.
2. **Fetching data** – The page is gated behind a password (`POST /api/login`).
   Once authenticated, `fetch-family-data.js` calls `GET /api/family-data`,
   which the Lambda serves by fetching the sheet CSV and returning it. The
   client parses it with [Papa Parse](https://www.papaparse.com/) and builds a
   tree data structure.
3. **Rendering** – The tree is displayed with Treant.js. Nodes contain a "card"
   listing the member name and any additional columns present in the sheet.
4. **Interaction** – Clicking a node collapses or expands its children. All
   nodes start collapsed for easier navigation on large trees.

## Updating the family data

1. Open the Google Sheet referenced by `SHEET_CSV_URL` and add or edit rows.
   - A row must contain a **`Name`** column.
   - The optional **`Parent`** column specifies the parent node by name.
   - Any other columns are shown as details on the card.
2. After updating, publish the sheet to the web as a CSV. If the published URL
   changes, update `SHEET_CSV_URL` on the Lambda (see the deployment steps in
   `ARCHITECTURE.md`).
3. Reload the site and the tree will reflect your changes.

### Tips for scalability

- Keep names unique so that parent references work reliably.
- Organize the sheet by generation or group to make editing easier.
- Because the data lives in a spreadsheet, anyone with access can update the
  tree without modifying the code or redeploying the site.

## Running locally

No build step is required, but the password gate and family data now require
the AWS Lambda API (see `ARCHITECTURE.md`) — opening `index.html` directly
won't load any data. Deploy to the real stack, or point `/api/*` at a local
stand-in of `lambda/index.js`, to test end-to-end.

