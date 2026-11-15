// The festival as a Google Sheet. Staff edit the sheet; the app reads it.
// One tab per table. The tab IDs (gids) are fixed so the app can export each
// tab as CSV without signing in (the sheet must be shared "anyone with the
// link can view"). This module converts both ways and validates what it reads.

import type {
  Channel, DayNumber, EventKind, EventRestriction, Festival, FestivalEvent, OfficialDoc, PassType, PersonRole,
} from '../core/types';
import { ACCESS_RULES } from '../rules/access';
import { MAX_DAYS } from '../core/types';

export type Table = string[][];
export type Tables = Record<TabName, Table>;

export const TABS = {
  Festival: { gid: 0, header: ['Setting', 'Value'] },
  'Schedule grid': { gid: 1, header: ['Event ID', 'Day', 'Start', 'End', 'Type', 'Title', 'Venue ID', 'Film ID', 'Guest IDs', 'Restriction', 'Status', 'Room', 'Seats sold', 'Seats held'] },
  Venues: { gid: 2, header: ['Venue ID', 'Name', 'Capacity', 'Address', 'Rooms'] },
  'Travel times': { gid: 3, header: ['From \\ To (minutes)'] },
  Films: { gid: 4, header: ['Film ID', 'Title', 'Director', 'Runtime (min)', 'Section', 'Featured filmmaker IDs'] },
  People: { gid: 5, header: ['Person ID', 'Name', 'Role', 'Email', 'Channels', 'Staff role', 'Crowd opt-in', 'Phone', 'Arrives', 'Departs', 'Travel note', 'Skills', 'Available days'] },
  Passes: { gid: 6, header: ['Person ID', 'Pass type', 'Valid days'] },
  Tickets: { gid: 7, header: ['Ticket ID', 'Person ID', 'Event ID', 'Ticket type', 'Price'] },
  'Saved events': { gid: 8, header: ['Person ID', 'Event ID'] },
  'Volunteer shifts': { gid: 9, header: ['Shift ID', 'Person ID', 'Venue ID', 'Day', 'Start', 'End', 'Task'] },
  'Official documents': { gid: 10, header: ['Document ID', 'Document title', 'Section', 'Text'] },
} as const;
export type TabName = keyof typeof TABS;
export const TAB_NAMES = Object.keys(TABS) as TabName[];

const list = (s: string) => s.split(/[,;]\s*|\s+/).map(x => x.trim()).filter(Boolean);
const hhmm = (iso: string) => iso.slice(11, 16);

// ------------------------------------------------------------ Festival → tables
export function festivalToTables(f: Festival): Tables {
  const venueIds = f.venues.map(v => v.id);
  return {
    Festival: [[...TABS.Festival.header], ['Name', f.name], ...Object.keys(f.dates).map(Number).sort((a, b) => a - b).map(d => [`Day ${d} date`, f.dates[d]])],
    'Schedule grid': [[...TABS['Schedule grid'].header], ...f.events.map(e => [
      e.id, String(e.day), hhmm(e.start), hhmm(e.end), e.kind, e.title, e.venueId, e.filmId ?? '', e.guestIds.join(', '), e.restriction ?? '', e.status,
      e.room ?? '', e.seatsSold === undefined ? '' : String(e.seatsSold), e.seatsHeld === undefined ? '' : String(e.seatsHeld),
    ])],
    Venues: [[...TABS.Venues.header], ...f.venues.map(v => [v.id, v.name, String(v.capacity), v.address, (v.rooms ?? []).map(r => `${r.name}: ${r.capacity}`).join('; ')])],
    'Travel times': [[TABS['Travel times'].header[0], ...venueIds], ...venueIds.map(a => [a, ...venueIds.map(b => String(f.travel[a][b]))])],
    Films: [[...TABS.Films.header], ...f.films.map(x => [x.id, x.title, x.director, String(x.runtimeMin), x.section, x.filmmakerIds.join(', ')])],
    People: [[...TABS.People.header], ...f.people.map(p => [p.id, p.name, p.role, p.email, p.channels.join(', '), p.staffRole ?? '', p.crowdOptIn ? 'TRUE' : 'FALSE', p.phone ?? '',
      p.arrives ?? '', p.departs ?? '', p.travelNote ?? '', (p.skills ?? []).join(', '), (p.availableDays ?? []).join(' ')])],
    Passes: [[...TABS.Passes.header], ...f.passes.map(p => [p.personId, p.type, p.validDays.join(' ')])],
    Tickets: [[...TABS.Tickets.header], ...f.tickets.map(t => [t.id, t.personId, t.eventId, t.type ?? '', t.price === undefined ? '' : String(t.price)])],
    'Saved events': [[...TABS['Saved events'].header], ...f.bookings.map(b => [b.personId, b.eventId])],
    'Volunteer shifts': [[...TABS['Volunteer shifts'].header], ...f.shifts.map(s => [s.id, s.personId, s.venueId, String(s.day), hhmm(s.start), hhmm(s.end), s.task])],
    'Official documents': [[...TABS['Official documents'].header], ...f.docs.flatMap(d => d.sections.map(s => [d.id, d.title, s.heading, s.body]))],
  };
}

// ------------------------------------------------------------ tables → Festival
const ISO_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
function optionalPersonFields(r: Record<string, string>, i: number, dayCount: number, err: (tab: string, i: number, msg: string) => void) {
  const out: { arrives?: string; departs?: string; travelNote?: string; skills?: string[]; availableDays?: DayNumber[] } = {};
  for (const [col, key] of [['Arrives', 'arrives'], ['Departs', 'departs']] as const) {
    const v = (r[col] ?? '').trim();
    if (!v) continue;
    if (ISO_DT.test(v)) out[key] = v; else err('People', i, `${col} must look like 2027-05-21T14:30 (got "${v}")`);
  }
  if (r['Travel note']) out.travelNote = r['Travel note'];
  const skills = (r.Skills ?? '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
  if (skills.length) out.skills = skills;
  const days = (r['Available days'] ?? '').match(/\d+/g)?.map(Number).filter(n => n >= 1 && n <= dayCount);
  if (days?.length) out.availableDays = [...new Set(days)].sort((a, b) => a - b);
  return out;
}

export interface LoadResult { festival: Festival | null; errors: string[]; warnings: string[] }

/** Accepts 10:00, 10:00:00, 9:5, 10:00 AM, 2:30 pm. */
export function parseTime(raw: string): string | null {
  const m = /^\s*(\d{1,2})[:.](\d{1,2})(?::\d{1,2})?\s*(am|pm)?\s*$/i.exec(raw);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function rows(t: Table | undefined): Record<string, string>[] {
  if (!t || t.length < 1) return [];
  const [head, ...body] = t;
  return body
    .filter(r => r.some(c => (c ?? '').trim() !== ''))
    .map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const KINDS: EventKind[] = ['screening', 'qa', 'panel', 'market', 'activity'];
const RESTRICTIONS: EventRestriction[] = ['press_only', 'industry_only', 'vip_only'];
const ROLES: PersonRole[] = ['festival_staff', 'volunteer', 'guest', 'attendee', 'industry', 'press'];
const CHANNELS: Channel[] = ['app_push', 'email', 'sms', 'website', 'volunteer_brief'];
const PASS_TYPES = Object.keys(ACCESS_RULES) as PassType[];

export function tablesToFestival(t: Partial<Tables>): LoadResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (tab: string, i: number, msg: string) => errors.push(`${tab}, row ${i + 2}: ${msg}`);

  const settings = Object.fromEntries(rows(t.Festival).map(r => [r.Setting.toLowerCase(), r.Value]));
  const dates: Record<DayNumber, string> = {};
  for (let d = 1; d <= MAX_DAYS && (d === 1 || settings[`day ${d} date`]); d++) dates[d] = settings[`day ${d} date`];
  const dayCount = Object.keys(dates).length;
  const allDays = Object.keys(dates).map(Number) as DayNumber[];
  for (const d of allDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dates[d] ?? '')) errors.push(`Festival: "Day ${d} date" must look like 2027-04-15 (got "${dates[d] ?? ''}")`);
  }
  const day = (raw: string, tab: string, i: number): DayNumber | null => {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= dayCount) return n;
    err(tab, i, `Day must be a number from 1 to ${dayCount} (got "${raw}")`);
    return null;
  };
  const time = (raw: string, tab: string, i: number, col: string): string | null => {
    const v = parseTime(raw);
    if (!v) err(tab, i, `${col} must be a time like 14:30 (got "${raw}")`);
    return v;
  };

  const venues = rows(t.Venues).map((r, i) => {
    const capacity = Number(r.Capacity);
    if (!r['Venue ID']) err('Venues', i, 'missing Venue ID');
    if (!(capacity > 0)) err('Venues', i, `Capacity must be a number (got "${r.Capacity}")`);
    // "Screen 1: 320; Screen 2: 200"
    const rooms = (r.Rooms ?? '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
      const m = /^(.*?)[:=]\s*(\d+)\s*$/.exec(x);
      if (!m) { err('Venues', i, `Rooms must look like "Screen 1: 200; Screen 2: 120" (got "${x}")`); return null; }
      return { name: m[1].trim(), capacity: Number(m[2]) };
    }).filter((x): x is { name: string; capacity: number } => !!x);
    return { id: r['Venue ID'], name: r.Name || r['Venue ID'], capacity, address: r.Address, ...(rooms.length ? { rooms } : {}) };
  });
  const venueIds = new Set(venues.map(v => v.id));

  const travel: Festival['travel'] = {};
  const tt = t['Travel times'];
  if (tt && tt.length > 1) {
    const cols = tt[0].slice(1).map(c => c.trim());
    for (const r of tt.slice(1)) {
      const from = (r[0] ?? '').trim();
      if (!from) continue;
      travel[from] = {};
      cols.forEach((to, j) => { travel[from][to] = Number(r[j + 1] ?? NaN); });
    }
  }
  for (const a of venueIds) for (const b of venueIds) {
    const v = travel[a]?.[b];
    if (v === undefined || Number.isNaN(v)) {
      if (a === b) { (travel[a] ??= {})[b] = 0; continue; }
      const back = travel[b]?.[a];
      if (back !== undefined && !Number.isNaN(back)) { (travel[a] ??= {})[b] = back; warnings.push(`Travel times: ${a} → ${b} missing, using ${b} → ${a} (${back} min)`); }
      else errors.push(`Travel times: no time from ${a} to ${b}`);
    }
  }

  const people = rows(t.People).map((r, i) => {
    const role = r.Role as PersonRole;
    if (!ROLES.includes(role)) err('People', i, `Role must be one of ${ROLES.join(', ')} (got "${r.Role}")`);
    const channels = list(r.Channels).filter((c): c is Channel => CHANNELS.includes(c as Channel));
    return {
      id: r['Person ID'], name: r.Name, role, email: r.Email, phone: r.Phone || undefined, channels: channels.length ? channels : ['email' as Channel],
      staffRole: r['Staff role'] || undefined, crowdOptIn: /^(true|yes|y|1)$/i.test(r['Crowd opt-in']),
      ...optionalPersonFields(r, i, dayCount, err),
    };
  });
  const personIds = new Set(people.map(p => p.id));
  const dupes = people.map(p => p.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dupes.length) errors.push(`People: duplicate Person IDs ${[...new Set(dupes)].join(', ')}`);

  const films = rows(t.Films).map((r, i) => {
    const runtimeMin = Number(r['Runtime (min)']);
    if (!(runtimeMin > 0)) err('Films', i, `Runtime must be a number of minutes (got "${r['Runtime (min)']}")`);
    const filmmakerIds = list(r['Featured filmmaker IDs']);
    for (const id of filmmakerIds) if (!personIds.has(id)) err('Films', i, `unknown person ${id}`);
    return { id: r['Film ID'], title: r.Title, director: r.Director, runtimeMin, section: r.Section, filmmakerIds };
  });
  const filmIds = new Set(films.map(x => x.id));

  const events: FestivalEvent[] = [];
  rows(t['Schedule grid']).forEach((r, i) => {
    const tab = 'Schedule grid';
    const d = day(r.Day, tab, i);
    const s = time(r.Start, tab, i, 'Start');
    const e = time(r.End, tab, i, 'End');
    const kind = r.Type.toLowerCase() as EventKind;
    if (!KINDS.includes(kind)) err(tab, i, `Type must be one of ${KINDS.join(', ')} (got "${r.Type}")`);
    if (!venueIds.has(r['Venue ID'])) err(tab, i, `unknown venue "${r['Venue ID']}"`);
    if (r['Film ID'] && !filmIds.has(r['Film ID'])) err(tab, i, `unknown film "${r['Film ID']}"`);
    const guestIds = list(r['Guest IDs']);
    for (const g of guestIds) if (!personIds.has(g)) err(tab, i, `unknown guest "${g}"`);
    const restriction = (r.Restriction || '').toLowerCase() as EventRestriction | '';
    if (restriction && !RESTRICTIONS.includes(restriction)) err(tab, i, `Restriction must be blank or one of ${RESTRICTIONS.join(', ')}`);
    const status = /^cancel/i.test(r.Status) ? 'cancelled' : 'scheduled';
    if (!d || !s || !e || !dates[d]) return;
    if (e <= s) err(tab, i, 'End must be after Start (events past midnight are not supported)');
    const num = (col: string) => {
      const raw = (r[col] ?? '').trim();
      if (!raw) return undefined;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) { err(tab, i, `${col} must be a whole number (got "${raw}")`); return undefined; }
      return n;
    };
    const room = (r.Room ?? '').trim();
    const v = venues.find(x => x.id === r['Venue ID']);
    if (room && v?.rooms && !v.rooms.some(x => x.name.toLowerCase() === room.toLowerCase())) err(tab, i, `"${room}" is not a room at ${v.name}`);
    const seatsSold = num('Seats sold'), seatsHeld = num('Seats held');
    events.push({
      id: r['Event ID'], kind, title: r.Title, venueId: r['Venue ID'], day: d,
      start: `${dates[d]}T${s}`, end: `${dates[d]}T${e}`, filmId: r['Film ID'] || undefined,
      guestIds, restriction: restriction || undefined, status,
      ...(room ? { room: v?.rooms?.find(x => x.name.toLowerCase() === room.toLowerCase())?.name ?? room } : {}),
      ...(seatsSold !== undefined ? { seatsSold } : {}), ...(seatsHeld !== undefined ? { seatsHeld } : {}),
    });
  });
  const eventIds = new Set(events.map(e => e.id));
  const evDupes = events.map(e => e.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (evDupes.length) errors.push(`Schedule grid: duplicate Event IDs ${[...new Set(evDupes)].join(', ')}`);

  const passes = rows(t.Passes).map((r, i) => {
    const type = r['Pass type'] as PassType;
    if (!PASS_TYPES.includes(type)) err('Passes', i, `Pass type must be one of ${PASS_TYPES.join(', ')} (got "${r['Pass type']}")`);
    if (!personIds.has(r['Person ID'])) err('Passes', i, `unknown person "${r['Person ID']}"`);
    // "1 2 3", "1,2,3" or a number Sheets turned "1,2,3" into (123).
    const raw = r['Valid days'] || allDays.join(' ');
    const parts = /^\d+$/.test(raw) ? raw.split('') : list(raw);
    const validDays = parts.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= dayCount);
    return { id: `pass-${r['Person ID']}`, personId: r['Person ID'], type, validDays: validDays.length ? validDays : [...allDays] };
  });
  for (const p of people) if (!passes.some(x => x.personId === p.id)) warnings.push(`People: ${p.id} (${p.name}) has no pass, so every scan will be denied`);

  const tickets = rows(t.Tickets).map((r, i) => {
    if (!personIds.has(r['Person ID'])) err('Tickets', i, `unknown person "${r['Person ID']}"`);
    if (!eventIds.has(r['Event ID'])) err('Tickets', i, `unknown event "${r['Event ID']}"`);
    const price = (r.Price ?? '').replace(/[$,\s]/g, '');
    if (price && !(Number(price) >= 0)) err('Tickets', i, `Price must be an amount like 16 or $16.00 (got "${r.Price}")`);
    return {
      id: r['Ticket ID'] || `t-${i + 1}`, personId: r['Person ID'], eventId: r['Event ID'],
      ...(r['Ticket type'] ? { type: r['Ticket type'] } : {}), ...(price && Number(price) >= 0 ? { price: Number(price) } : {}),
    };
  });
  const bookings = rows(t['Saved events']).map((r, i) => {
    if (!personIds.has(r['Person ID'])) err('Saved events', i, `unknown person "${r['Person ID']}"`);
    if (!eventIds.has(r['Event ID'])) err('Saved events', i, `unknown event "${r['Event ID']}"`);
    return { personId: r['Person ID'], eventId: r['Event ID'] };
  });
  const shifts = rows(t['Volunteer shifts']).flatMap((r, i) => {
    const tab = 'Volunteer shifts';
    const d = day(r.Day, tab, i);
    const s = time(r.Start, tab, i, 'Start');
    const e = time(r.End, tab, i, 'End');
    if (!personIds.has(r['Person ID'])) err(tab, i, `unknown person "${r['Person ID']}"`);
    if (!venueIds.has(r['Venue ID'])) err(tab, i, `unknown venue "${r['Venue ID']}"`);
    if (!d || !s || !e || !dates[d]) return [];
    return [{ id: r['Shift ID'] || `s-${i + 1}`, personId: r['Person ID'], venueId: r['Venue ID'], day: d, start: `${dates[d]}T${s}`, end: `${dates[d]}T${e}`, task: r.Task }];
  });

  const docMap = new Map<string, OfficialDoc>();
  for (const r of rows(t['Official documents'])) {
    if (!r['Document ID'] || !r.Text) continue;
    if (!docMap.has(r['Document ID'])) docMap.set(r['Document ID'], { id: r['Document ID'], title: r['Document title'], sections: [] });
    docMap.get(r['Document ID'])!.sections.push({ heading: r.Section, body: r.Text });
  }

  if (errors.length) return { festival: null, errors, warnings };
  return {
    festival: {
      name: settings.name || 'Festival', dates, venues, travel, films,
      events: events.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)),
      people, passes, tickets, shifts, bookings, checkIns: [], docs: [...docMap.values()],
    },
    errors, warnings,
  };
}

// ------------------------------------------------------------ CSV and fetching
export function parseCsv(text: string): Table {
  const out: Table = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out;
}

export function sheetIdFrom(input: string): string | null {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/.exec(input) ?? /^([a-zA-Z0-9-_]{20,})$/.exec(input.trim());
  return m ? m[1] : null;
}

/** Read every tab as CSV. The sheet must be shared "anyone with the link can view". */
export async function fetchSheetTables(sheetId: string, fetchFn: typeof fetch = fetch): Promise<Partial<Tables>> {
  const out: Partial<Tables> = {};
  await Promise.all(TAB_NAMES.map(async name => {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${TABS[name].gid}`;
    let res: Response;
    try { res = await fetchFn(url, { redirect: 'follow' }); }
    catch { throw new Error('Could not reach Google Sheets from the server. Check the network and try again.'); }
    const text = await res.text();
    if (!res.ok || text.trimStart().startsWith('<')) {
      throw new Error(`Could not read tab "${name}" (HTTP ${res.status}). Check the sheet is shared "anyone with the link can view" and the tab still exists.`);
    }
    out[name] = parseCsv(text);
  }));
  return out;
}
