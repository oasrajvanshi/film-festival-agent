// Writes the mock festival as sheet tables (JSON) for building the Google Sheet.
import { writeFileSync } from 'node:fs';
import { buildFestival } from '../src/data/seed';
import { festivalToTables, TABS } from '../src/data/sheet';
const out = process.argv[2] ?? 'festival-tables.json';
writeFileSync(out, JSON.stringify({ tables: festivalToTables(buildFestival()), gids: Object.fromEntries(Object.entries(TABS).map(([k, v]) => [k, v.gid])) }));
console.log('wrote', out);
