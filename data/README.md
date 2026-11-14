# Mock festival data

Everything here is made up: the Harbor Lights Film Festival, its people, films and email addresses.

- **Live working copy:** [Google Sheet](https://docs.google.com/spreadsheets/d/18Pp1GAMQz__QzyvKYlddcR-agiG1p7rH5QJq8NV9lNM/edit). Edit this one; the dashboard's Data tab reads it.
- `harbor-lights-festival-data.xlsx`: the same workbook as a file, including the Read me tab and dropdowns. Upload it to Google Drive to make your own copy. Note that the app finds tabs by fixed tab IDs, so a fresh upload needs its tab IDs reset (see `src/data/sheet.ts`).
- `csv/`: one CSV per tab, a plain-text snapshot of the built-in mock festival. Regenerate with `npx tsx scripts/export-csv.ts`.

These snapshots match the built-in data in `src/data/seed.ts`. Edits you make in the live sheet are not copied back here automatically.
