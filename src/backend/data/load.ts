// Turn the team's workbook into the domain model. Errors name the tab, row
// and column so whoever edits the sheet can fix them quickly; the sheet is
// not loaded until they are fixed (the workbook's own "Read me" rule).
// Allowed data gaps (a backup with no call time, a speaker with no call
// sheet row) become warnings and sensible defaults.

import type {
  AudienceMember, CallEntry, CallRole, Channel, FestivalData, FestivalInfo, Guest, GuestTravel, Place, Session, SessionKind,
  Shift, ShuttleDemand, ShuttleRoute, StaffMember, TravelMatrix, Venue,
} from '../domain/types';
import { parseTime } from '../domain/time';
import { normalizeHeader, type Row } from './csv';
import { hasColumns, tablesFromDir, tablesFromGoogleSheet, TABS, type TabKey, type Tables } from './sheets';

export interface LoadResult { data: FestivalData; warnings: string[]; source: string }

export class SheetError extends Error {
  readonly name = 'SheetError';
  constructor(public problems: string[]) {
    super(`Festival sheets have ${problems.length} problem(s):\n- ${problems.slice(0, 30).join('\n- ')}`);
  }
}

const KINDS: SessionKind[] = ['screening', 'qa', 'panel', 'market', 'activity'];
const CALL_ROLES: CallRole[] = ['speaker', 'moderator', 'backup'];
const CHANNEL_MAP: Record<string, Channel> = { app_push: 'push', push: 'push', email: 'email', sms: 'sms', slack: 'slack', volunteer_brief: 'brief' };
const BADGES: Record<string, string> = { featured_filmmaker: 'Featured filmmaker', panelist: 'Panelist' };

const list = (v: string | undefined) => (v ?? '').split(/[,;|]/).map(s => s.trim()).filter(Boolean);
const yes = (v: string | undefined) => /^(y|yes|true|1|x)$/i.test((v ?? '').trim());
const title = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

export function buildFestivalData(t: Tables): { data: FestivalData; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const where = (tab: TabKey, i: number) => `${TABS[tab].title} row ${i + 2}`;

  for (const tab of Object.keys(TABS) as TabKey[]) {
    const rows = t[tab] ?? [];
    if (!rows.length) { if (!TABS[tab].optional) problems.push(`${TABS[tab].title}: the tab is empty or missing`); continue; }
    if (!hasColumns(tab, rows)) {
      const missing = TABS[tab].required.filter(c => !(c in rows[0]));
      if (TABS[tab].optional) { warnings.push(`${TABS[tab].title}: missing column(s) ${missing.join(', ')}; tab ignored`); t[tab] = []; }
      else problems.push(`${TABS[tab].title}: missing column(s) ${missing.join(', ')}`);
    }
  }
  if (problems.length) throw new SheetError(problems);

  const num = (tab: TabKey, i: number, r: Row, col: string, fallback?: number) => {
    const v = r[col];
    if ((v === undefined || v === '') && fallback !== undefined) return fallback;
    const n = Number(String(v).replace(/[$,]/g, ''));
    if (!Number.isFinite(n)) problems.push(`${where(tab, i)}: ${col} "${v ?? ''}" is not a number`);
    return n;
  };
  const channels = (tab: TabKey, i: number, v: string | undefined, fallback: Channel[]): Channel[] => {
    const out: Channel[] = [];
    for (const x of list(v).map(s => s.toLowerCase())) {
      if (CHANNEL_MAP[x]) out.push(CHANNEL_MAP[x]);
      else problems.push(`${where(tab, i)}: unknown channel "${x}"`);
    }
    return out.length ? out : fallback;
  };

  // --- Festival + Scenario settings: Setting / Value rows
  const kv: Record<string, string> = {};
  for (const r of [...t.festival, ...t.settings]) kv[normalizeHeader(r.setting)] = r.value;
  const dates: Record<number, string> = {};
  for (const [k, v] of Object.entries(kv)) {
    const m = k.match(/^day_(\d+)_date$/);
    if (!m) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) problems.push(`Festival: ${k} "${v}" must be YYYY-MM-DD`);
    dates[Number(m[1])] = v;
  }
  if (!kv.name) problems.push('Festival: missing setting "Name"');
  if (!Object.keys(dates).length) problems.push('Festival: missing "Day 1 date"');
  if (problems.length) throw new SheetError(problems);
  const info: FestivalInfo = {
    name: kv.name, dates,
    timezone: kv.timezone || 'America/New_York',
    lat: Number(kv.latitude ?? NaN), lon: Number(kv.longitude ?? NaN),
    snowThresholdIn: Number(kv.snow_threshold_in || 2),
  };
  if (!kv.timezone) warnings.push('No "Timezone" setting; using America/New_York');
  if (!Number.isFinite(info.lat) || !Number.isFinite(info.lon)) warnings.push('No "Latitude"/"Longitude" settings; live weather (OPS_WEATHER=open-meteo) is off');

  const dateOf = (tab: TabKey, i: number, day: string) => {
    const d = dates[Number(day)];
    if (!d) problems.push(`${where(tab, i)}: day "${day}" has no date on the Festival tab`);
    return d ?? dates[1];
  };
  const time = (tab: TabKey, i: number, r: Row, col: string, date: string) => {
    try { return parseTime(r[col], date); } catch (e) { problems.push(`${where(tab, i)}: ${col} ${(e as Error).message}`); return undefined; }
  };

  // --- Venues, places, travel
  const venues: Venue[] = t.venues.map((r, i) => ({
    id: r.venue_id, name: r.name, capacity: num('venues', i, r, 'capacity'), address: r.address || undefined,
    indoor: r.indoor === undefined || r.indoor === '' ? true : yes(r.indoor),
  }));
  const venueIds = new Set(venues.map(v => v.id));
  const colFor = (id: string) => normalizeHeader(id);

  const travel: TravelMatrix = {};
  const setTravel = (a: string, b: string, m: number) => { (travel[a] ??= {})[b] = m; };
  t.travel.forEach((r, i) => {
    const from = r.from_to_minutes;
    if (!venueIds.has(from)) { problems.push(`${where('travel', i)}: "${from}" is not a venue ID`); return; }
    for (const to of venueIds) if (r[colFor(to)] !== undefined && r[colFor(to)] !== '') setTravel(from, to, num('travel', i, r, colFor(to)));
  });
  const places: Place[] = t.places.map((r, i) => {
    for (const v of venueIds) if (r[colFor(v)] !== undefined && r[colFor(v)] !== '') { const m = num('places', i, r, colFor(v)); setTravel(r.place_id, v, m); setTravel(v, r.place_id, m); }
    return { id: r.place_id, name: r.name, kind: (['airport', 'hotel'].includes(r.kind) ? r.kind : 'other') as Place['kind'] };
  });
  const placeIds = new Set([...venueIds, ...places.map(p => p.id)]);
  for (const a of Object.keys(travel)) for (const b of Object.keys(travel[a])) if (travel[b]?.[a] === undefined) setTravel(b, a, travel[a][b]);
  for (const id of placeIds) setTravel(id, id, 0);
  for (const a of venueIds) for (const b of venueIds) if (travel[a]?.[b] === undefined) problems.push(`Travel times: no time from ${a} to ${b}`);

  // --- People, passes, tickets, saved events
  const people = t.people.map((r, i) => ({ r, i }));
  const byId = new Map(people.map(p => [p.r.person_id, p.r]));
  const passOf = new Map(t.passes.map(r => [r.person_id, r]));
  const eventsOf = new Map<string, Set<string>>();
  const addEvent = (pid: string, eid: string) => { if (!eventsOf.has(pid)) eventsOf.set(pid, new Set()); eventsOf.get(pid)!.add(eid); };
  t.tickets.forEach(r => addEvent(r.person_id, r.event_id));
  t.saved.forEach(r => addEvent(r.person_id, r.event_id));

  // --- Schedule grid
  const sessions: Session[] = t.schedule.map((r, i) => {
    const kind = (r.type || '').toLowerCase() as SessionKind;
    if (!KINDS.includes(kind)) problems.push(`${where('schedule', i)}: Type "${r.type}" must be one of ${KINDS.join(', ')}`);
    if (!venueIds.has(r.venue_id)) problems.push(`${where('schedule', i)}: Venue ID "${r.venue_id}" is not on the Venues tab`);
    const date = dateOf('schedule', i, r.day);
    const start = time('schedule', i, r, 'start', date), end = time('schedule', i, r, 'end', date);
    const guestIds = list(r.guest_ids);
    for (const g of guestIds) if (byId.get(g)?.role !== 'guest') problems.push(`${where('schedule', i)}: Guest ID "${g}" is not a guest on the People tab`);
    return {
      id: r.event_id, day: Number(r.day), title: r.title, kind, venueId: r.venue_id, room: r.room || undefined,
      start: start ?? '', end: end ?? '', filmId: r.film_id || undefined, guestIds, restriction: r.restriction || undefined,
      outdoor: yes(r.outdoor), expected: 0, status: /cancel/i.test(r.status ?? '') ? 'cancelled' : 'scheduled',
    };
  });
  const sessionIds = new Set(sessions.map(s => s.id));
  for (const [pid, evs] of eventsOf) {
    if (!byId.has(pid)) problems.push(`Tickets / Saved events: person "${pid}" is not on the People tab`);
    for (const e of evs) if (!sessionIds.has(e)) problems.push(`Tickets / Saved events: event "${e}" is not on the Schedule grid`);
  }

  // --- Scenario tab: guest travel (per day) and guest contact extras
  const trips = new Map<string, (GuestTravel & { day: number })[]>();
  const extras = new Map<string, Row>();
  t.travelPlans.forEach((r, i) => {
    if (byId.get(r.person_id)?.role !== 'guest') { problems.push(`${where('travelPlans', i)}: "${r.person_id}" is not a guest`); return; }
    const mode = (r.mode || 'local').toLowerCase() as GuestTravel['mode'];
    if (!['flight', 'car', 'local'].includes(mode)) problems.push(`${where('travelPlans', i)}: Mode "${r.mode}" must be flight, car or local`);
    const from = r.from || undefined;
    if (from && !placeIds.has(from)) problems.push(`${where('travelPlans', i)}: From "${from}" is not a venue or place ID`);
    const date = dateOf('travelPlans', i, r.day);
    if (mode === 'flight' && (!r.flight || !r.arrival)) problems.push(`${where('travelPlans', i)}: a flight needs Flight and Arrival`);
    const trip = {
      day: Number(r.day), mode, flight: r.flight || undefined, from,
      arrival: time('travelPlans', i, r, 'arrival', date), pickupAt: time('travelPlans', i, r, 'pickup', date),
      bufferMin: num('travelPlans', i, r, 'buffer_min', 15),
    };
    trips.set(r.person_id, [...(trips.get(r.person_id) ?? []), trip]);
    extras.set(r.person_id, { ...(extras.get(r.person_id) ?? {}), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== '')) });
  });
  const hotel = places.find(p => p.kind === 'hotel')?.id;

  const guests: Guest[] = [];
  const staff: StaffMember[] = [];
  const audience: AudienceMember[] = [];
  const shiftsOf = new Map<string, Shift[]>();
  t.shifts.forEach((r, i) => {
    if (!venueIds.has(r.venue_id)) problems.push(`${where('shifts', i)}: Venue ID "${r.venue_id}" is not on the Venues tab`);
    const date = dateOf('shifts', i, r.day);
    const s: Shift = { venueId: r.venue_id, day: Number(r.day), start: time('shifts', i, r, 'start', date) ?? '', end: time('shifts', i, r, 'end', date) ?? '', task: r.task || '' };
    shiftsOf.set(r.person_id, [...(shiftsOf.get(r.person_id) ?? []), s]);
  });

  for (const { r, i } of people) {
    const pass = passOf.get(r.person_id);
    if (r.role === 'guest') {
      const x = extras.get(r.person_id) ?? {};
      const badge = pass?.pass_type ?? 'guest';
      guests.push({
        id: r.person_id, name: r.name, badge, role: BADGES[badge] ?? 'Guest', email: r.email || undefined, phone: x.phone || r.phone || undefined,
        channels: channels('people', i, r.channels, ['email']),
        assistant: x.assistant_name ? { name: x.assistant_name, email: x.assistant_email, phone: x.assistant_phone } : undefined,
        travel: { mode: 'local', from: hotel, bufferMin: 15 },
        trips: trips.get(r.person_id) ?? [],
        remoteOk: yes(x.remote_ok), topics: [],
      });
    } else if (r.role === 'festival_staff' || r.role === 'volunteer') {
      const team = (r.staff_role || r.role).toLowerCase();
      staff.push({
        id: r.person_id, name: r.name, team, title: title(team) + (r.role === 'volunteer' ? ' volunteer' : ''), lead: r.role === 'festival_staff',
        shifts: shiftsOf.get(r.person_id) ?? [], channels: channels('people', i, r.channels, ['email']), email: r.email || undefined, phone: r.phone || undefined,
      });
    } else {
      audience.push({
        id: r.person_id, name: r.name, role: r.role, channels: channels('people', i, r.channels, ['email']),
        passType: pass?.pass_type, validDays: (pass?.valid_days ?? '').split(/\s+/).filter(Boolean).map(Number),
        eventIds: [...(eventsOf.get(r.person_id) ?? [])],
      });
    }
  }
  for (const s of sessions) s.expected = audience.filter(a => a.eventIds.includes(s.id)).length;
  if (!staff.some(s => s.lead && (s.team === 'operations' || s.team === 'director'))) problems.push('People: needs a festival_staff person with Staff role "operations" (escalations go there)');

  // --- Scenario tab: call sheet
  const guestIds = new Set(guests.map(g => g.id));
  const callSheet: CallEntry[] = t.callSheet.map((r, i) => {
    const role = (r.role || '').toLowerCase() as CallRole;
    if (!CALL_ROLES.includes(role)) problems.push(`${where('callSheet', i)}: Role "${r.role}" must be speaker, moderator or backup`);
    if (!guestIds.has(r.person_id)) problems.push(`${where('callSheet', i)}: "${r.person_id}" is not a guest`);
    const s = sessions.find(x => x.id === r.event_id);
    if (!s) problems.push(`${where('callSheet', i)}: event "${r.event_id}" is not on the Schedule grid`);
    const callTime = s ? time('callSheet', i, r, 'call_time', s.start.slice(0, 10)) : undefined;
    if (!callTime) warnings.push(`${where('callSheet', i)}: ${byId.get(r.person_id)?.name ?? r.person_id} has no call time for ${r.event_id}`);
    return { guestId: r.person_id, sessionId: r.event_id, role, callTime, spot: r.spot || undefined, callSource: callTime ? 'sheet' : undefined };
  });

  // --- Scenario tabs: shuttles and demand overrides
  const shuttles: ShuttleRoute[] = t.shuttles.map((r, i) => {
    const stops = r.stops.split(/[>,;]/).map(s => s.trim()).filter(Boolean);
    for (const s of stops) if (!venueIds.has(s)) problems.push(`${where('shuttles', i)}: stop "${s}" is not a venue ID`);
    return {
      id: r.route_id, name: r.name, stops, everyMin: num('shuttles', i, r, 'every_min'), capacityPerHour: num('shuttles', i, r, 'seats_per_hour'),
      vendor: r.vendor || 'shuttle vendor', extraBusCost: num('shuttles', i, r, 'extra_bus_cost', 0),
      extraBusLeadMin: num('shuttles', i, r, 'extra_bus_notice_min', 30), extraBusCapacityPerHour: num('shuttles', i, r, 'extra_bus_seats_per_hour', 0),
    };
  });
  const demand: ShuttleDemand[] = t.demand.map((r, i) => {
    const date = dateOf('demand', i, r.day);
    return { routeId: r.route_id, from: time('demand', i, r, 'from', date) ?? '', to: time('demand', i, r, 'to', date) ?? '', expectedRiders: num('demand', i, r, 'expected_riders') };
  });

  for (const [tab, xs] of [['venues', venues], ['schedule', sessions], ['people', [...guests, ...staff, ...audience]]] as const) {
    const seen = new Set<string>();
    for (const x of xs) { if (seen.has(x.id)) problems.push(`${TABS[tab].title}: duplicate ID "${x.id}"`); seen.add(x.id); }
  }
  if (problems.length) throw new SheetError(problems);
  return { data: { info, venues, places, travel, sessions, callSheet, guests, staff, audience, shuttles, demand }, warnings };
}

export const DEFAULT_DATA_DIR = 'data/harbor-lights';
export const DEFAULT_EXTRAS_DIR = 'data/scenario-extras';

/**
 * OPS_SHEET_ID: read the Google Sheet live. Otherwise OPS_DATA_DIR (default
 * data/harbor-lights, a snapshot made by `npm run ops:sync`). Scenario tabs
 * the sheet does not have yet come from OPS_EXTRAS_DIR (data/scenario-extras).
 */
export async function loadFestivalData(env: Record<string, string | undefined> = process.env): Promise<LoadResult> {
  const extras = env.OPS_EXTRAS_DIR ?? DEFAULT_EXTRAS_DIR;
  if (env.OPS_SHEET_ID) {
    const { tables, fromSheet } = await tablesFromGoogleSheet(env.OPS_SHEET_ID, extras);
    const r = buildFestivalData(tables);
    return { ...r, source: `Google Sheet ${env.OPS_SHEET_ID} (${fromSheet.length} tabs) + ${extras}` };
  }
  const dir = env.OPS_DATA_DIR ?? DEFAULT_DATA_DIR;
  return { ...buildFestivalData(await tablesFromDir(dir, extras)), source: `${dir} + ${extras}` };
}
