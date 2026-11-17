// Writes a built-in festival as one CSV per Google Sheet tab.
//   npx tsx scripts/export-csv.ts                         → the Sundance 2027 demo, data/sundance-2027/csv/
//   npx tsx scripts/export-csv.ts data/csv harbor-lights  → the small test festival, data/csv/
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildFestival } from '../src/data/seed';
import { buildSundance } from '../src/data/sundance';
import { festivalToTables } from '../src/data/sheet';

const which = process.argv[3] ?? 'sundance';
const dir = process.argv[2] ?? (which === 'sundance' ? 'data/sundance-2027/csv' : 'data/csv');
mkdirSync(dir, { recursive: true });
const cell = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
for (const [tab, rows] of Object.entries(festivalToTables(which === 'sundance' ? buildSundance() : buildFestival()))) {
  const file = `${dir}/${tab.toLowerCase().replace(/\s+/g, '-')}.csv`;
  writeFileSync(file, rows.map(r => r.map(cell).join(',')).join('\n') + '\n');
  console.log(file, rows.length - 1, 'rows');
}
