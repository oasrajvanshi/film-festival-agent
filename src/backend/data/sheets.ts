// Where the festival sheets come from: the team's Google Sheet ("Harbor
// Lights Film Festival – mock data", shared as anyone-with-the-link) or a
// folder of CSV files, one per tab. The backend only reads the sheets;
// changes it makes go to the store as overrides.
//
// Core tabs are the team's workbook as it is. Scenario tabs are optional
// extras the snow and late-guest scenarios use (flights, call times, places,
// shuttles). If the Google Sheet does not have them yet, they are read from a
// local folder instead (data/scenario-extras).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsv, type Row } from './csv';

export interface TabDef { title: string; slug: string; required: string[]; optional?: boolean }

/** Column names are normalized: "Event ID" -> event_id, "Runtime (min)" -> runtime_min. */
const TAB_LIST = {
  festival: { title: 'Festival', slug: 'festival', required: ['setting', 'value'] },
  schedule: { title: 'Schedule grid', slug: 'schedule-grid', required: ['event_id', 'day', 'start', 'end', 'type', 'title', 'venue_id'] },
  venues: { title: 'Venues', slug: 'venues', required: ['venue_id', 'name', 'capacity'] },
  travel: { title: 'Travel times', slug: 'travel-times', required: ['from_to_minutes'] },
  films: { title: 'Films', slug: 'films', required: ['film_id', 'title'], optional: true },
  people: { title: 'People', slug: 'people', required: ['person_id', 'name', 'role'] },
  passes: { title: 'Passes', slug: 'passes', required: ['person_id', 'pass_type'], optional: true },
  tickets: { title: 'Tickets', slug: 'tickets', required: ['person_id', 'event_id'], optional: true },
  saved: { title: 'Saved events', slug: 'saved-events', required: ['person_id', 'event_id'], optional: true },
  shifts: { title: 'Volunteer shifts', slug: 'volunteer-shifts', required: ['person_id', 'venue_id', 'day', 'start', 'end'], optional: true },
  // scenario tabs
  settings: { title: 'Scenario settings', slug: 'scenario-settings', required: ['setting', 'value'], optional: true },
  places: { title: 'Places', slug: 'places', required: ['place_id', 'name', 'kind'], optional: true },
  travelPlans: { title: 'Guest travel', slug: 'guest-travel', required: ['person_id', 'day', 'mode'], optional: true },
  callSheet: { title: 'Call sheet', slug: 'call-sheet', required: ['person_id', 'event_id', 'role'], optional: true },
  shuttles: { title: 'Shuttles', slug: 'shuttles', required: ['route_id', 'name', 'stops', 'every_min', 'seats_per_hour'], optional: true },
  demand: { title: 'Shuttle demand', slug: 'shuttle-demand', required: ['route_id', 'day', 'from', 'to', 'expected_riders'], optional: true },
} satisfies Record<string, TabDef>;

export type TabKey = keyof typeof TAB_LIST;
export const TABS: Record<TabKey, TabDef> = TAB_LIST;
export type Tables = Record<TabKey, Row[]>;
export const TAB_KEYS = Object.keys(TABS) as TabKey[];
export const SCENARIO_TABS: TabKey[] = ['settings', 'places', 'travelPlans', 'callSheet', 'shuttles', 'demand'];

/** A tab is usable if its first row has the required columns. */
export function hasColumns(tab: TabKey, rows: Row[]): boolean {
  return rows.length > 0 && TABS[tab].required.every(c => c in rows[0]);
}

async function readTab(dir: string, tab: TabKey): Promise<Row[] | undefined> {
  try {
    return parseCsv(await readFile(join(dir, `${TABS[tab].slug}.csv`), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/** Core tabs from `dir`; scenario tabs from `dir`, else from `extrasDir`. */
export async function tablesFromDir(dir: string, extrasDir?: string): Promise<Tables> {
  const out = {} as Tables;
  for (const tab of TAB_KEYS) {
    let rows = await readTab(dir, tab);
    if ((!rows || !hasColumns(tab, rows)) && extrasDir && SCENARIO_TABS.includes(tab)) rows = await readTab(extrasDir, tab);
    out[tab] = rows ?? [];
  }
  return out;
}

export function gvizUrl(sheetId: string, title: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(title)}`;
}

/**
 * Every tab as CSV. Google answers a tab name that does not exist with the
 * first tab, so a tab only counts if it has its own columns; missing scenario
 * tabs then come from `extrasDir`.
 */
export async function tablesFromGoogleSheet(sheetId: string, extrasDir?: string, fetchImpl: typeof fetch = fetch): Promise<{ tables: Tables; fromSheet: TabKey[] }> {
  const out = {} as Tables;
  const fromSheet: TabKey[] = [];
  for (const tab of TAB_KEYS) {
    const res = await fetchImpl(gvizUrl(sheetId, TABS[tab].title), { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Google Sheet tab "${TABS[tab].title}" returned ${res.status}. Is the sheet shared for viewing?`);
    const rows = parseCsv(await res.text());
    if (hasColumns(tab, rows)) { out[tab] = rows; fromSheet.push(tab); continue; }
    out[tab] = (extrasDir && SCENARIO_TABS.includes(tab) ? await readTab(extrasDir, tab) : undefined) ?? [];
  }
  return { tables: out, fromSheet };
}
