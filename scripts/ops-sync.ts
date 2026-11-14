// Snapshot the team's Google Sheet into data/harbor-lights/ (one CSV per tab),
// so tests and demos run offline on exactly the data in the sheet.
//
//   npm run ops:sync                       # default sheet
//   npm run ops:sync -- <sheetId>          # another sheet
//
// Scenario tabs are saved only if the sheet has them; otherwise the backend
// keeps using data/scenario-extras/.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsv } from '../src/backend/data/csv';
import { gvizUrl, hasColumns, TAB_KEYS, TABS } from '../src/backend/data/sheets';
import { buildFestivalData } from '../src/backend/data/load';
import { tablesFromDir } from '../src/backend/data/sheets';

const DEFAULT_SHEET = '18Pp1GAMQz__QzyvKYlddcR-agiG1p7rH5QJq8NV9lNM';
const sheetId = process.argv[2] ?? process.env.OPS_SHEET_ID ?? DEFAULT_SHEET;
const outDir = process.env.OPS_DATA_DIR ?? 'data/harbor-lights';

await mkdir(outDir, { recursive: true });
for (const tab of TAB_KEYS) {
  const res = await fetch(gvizUrl(sheetId, TABS[tab].title), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${TABS[tab].title}: HTTP ${res.status}`);
  const text = await res.text();
  if (!hasColumns(tab, parseCsv(text))) {
    console.log(`  -  ${TABS[tab].title}: not in the sheet${TABS[tab].optional ? ' (optional)' : ''}`);
    continue;
  }
  await writeFile(join(outDir, `${TABS[tab].slug}.csv`), text.endsWith('\n') ? text : text + '\n');
  console.log(`  ok ${TABS[tab].title} -> ${TABS[tab].slug}.csv (${parseCsv(text).length} rows)`);
}
const { data, warnings } = buildFestivalData(await tablesFromDir(outDir, 'data/scenario-extras'));
console.log(`\nLoaded ${data.info.name}: ${data.sessions.length} events, ${data.guests.length} guests, ${data.staff.length} staff and volunteers, ${data.audience.length} attendees.`);
for (const w of warnings) console.log(`  warning: ${w}`);
