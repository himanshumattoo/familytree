# Family Tree

This project renders an interactive family tree in the browser using [Treant.js](https://fperucic.github.io/treant-js/) and data from a Google Sheet.

## How it works

1. **Data source** – Family member information is kept in a Google Sheet that is
   published as a CSV file. The URL for the published sheet is defined in
   `fetch-family-data.js` as `CSV_URL`.
2. **Fetching data** – When the page loads, `fetch-family-data.js` retrieves the
   CSV, parses it with [Papa Parse](https://www.papaparse.com/) and builds a tree
   data structure.
3. **Rendering** – The tree is displayed with Treant.js. Nodes contain a "card"
   listing the member name and any additional columns present in the sheet.
4. **Interaction** – Clicking a node collapses or expands its children. All
   nodes start collapsed for easier navigation on large trees.

## Updating the family data

1. Open the Google Sheet referenced by `CSV_URL` and add or edit rows.
   - A row must contain a **`Name`** column.
   - The optional **`Parent`** column specifies the parent node by name.
   - Any other columns are shown as details on the card.
2. After updating, publish the sheet to the web as a CSV. Copy the published URL
   into `CSV_URL` if it changed.
3. Reload the site and the tree will reflect your changes.

### Tips for scalability

- Keep names unique so that parent references work reliably.
- Organize the sheet by generation or group to make editing easier.
- Because the data lives in a spreadsheet, anyone with access can update the
  tree without modifying the code or redeploying the site.

## Running locally

No build step is required. Simply open `index.html` in a browser or serve the
files with any static web server (e.g. GitHub Pages).

