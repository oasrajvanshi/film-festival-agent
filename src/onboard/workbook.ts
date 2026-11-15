// Any Google Sheet, in the festival's own layout: read every tab, let the
// matcher work out what each one is, and remember that mapping so the
// same sheet can be re-read later (auto-sync) without asking again.

import * as XLSX from 'xlsx';
import { tablesToFestival } from '../data/sheet';
import { buildTables, guessKind, matchColumns, type ColumnMatch, type FestivalMeta, type Kind, type Upload } from './mapping';

export interface Tab { name: string; table: string[][] }
/** What onboarding decided for each tab, saved with the festival. */
export interface SheetMapping { meta: FestivalMeta; tabs: { name: string; kind: Kind; columns: ColumnMatch[] }[] }

/** Every tab of a workbook (xlsx bytes) as rows of text. */
export function workbookTabs(data: ArrayBuffer | Uint8Array): Tab[] {
  const wb = XLSX.read(data, { type: 'array', cellDates: false });
  return wb.SheetNames.map(name => ({
    name,
    table: (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false }))
      .map(r => r.map(c => String(c ?? '').trim())),
  })).filter(t => t.table.length > 0 && t.table[0].some(Boolean));
}

/** A whole Google Sheet as tabs. It must be shared "anyone with the link can view". */
export async function fetchWorkbook(sheetId: string, fetchFn: typeof fetch = fetch): Promise<Tab[]> {
  let r: Response;
  try { r = await fetchFn(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`, { redirect: 'follow' }); }
  catch { throw new Error('Could not reach Google Sheets from the server. Try again.'); }
  const type = r.headers.get('content-type') ?? '';
  if (!r.ok || type.includes('text/html')) throw new Error(`Could not read the sheet (HTTP ${r.status}). Check it is shared "anyone with the link can view".`);
  return workbookTabs(new Uint8Array(await r.arrayBuffer()));
}

/** Tabs to uploads: use the saved mapping where a tab is known, otherwise guess. */
export function tabsToUploads(tabs: Tab[], saved?: SheetMapping['tabs']): Upload[] {
  return tabs.map(t => {
    const known = saved?.find(s => s.name === t.name);
    if (known) return { name: t.name, table: t.table, kind: known.kind, columns: known.columns };
    const { kind } = guessKind(t.name, t.table[0]);
    return { name: t.name, table: t.table, kind, columns: matchColumns(kind, t.table[0]) };
  });
}

/** Re-read a festival's sheet with the mapping it was set up with. */
export function rebuildFromTabs(mapping: SheetMapping, tabs: Tab[]) {
  const b = buildTables(mapping.meta, tabsToUploads(tabs, mapping.tabs));
  return tablesToFestival(b.tables);
}
