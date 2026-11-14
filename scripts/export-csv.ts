// Writes the built-in mock festival as one CSV per Google Sheet tab into data/csv/.
// The live sheet is the working copy; these files are a snapshot for the repo.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildFestival } from '../src/data/seed';
import { festivalToTables } from '../src/data/sheet';

const dir = process.argv[2] ?? 'data/csv';
mkdirSync(dir, { recursive: true });
const cell = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
for (const [tab, rows] of Object.entries(festivalToTables(buildFestival()))) {
  const file = `${dir}/${tab.toLowerCase().replace(/\s+/g, '-')}.csv`;
  writeFileSync(file, rows.map(r => r.map(cell).join(',')).join('\n') + '\n');
  console.log(file, rows.length - 1, 'rows');
}
