// Onboarding: a festival brings its own files (CSV exports, a Google Sheet)
// with its own column names. The agent works out what each file is, matches
// each column to a field it understands, resolves names to records, and
// produces the canonical tables that tablesToFestival validates.
//
// Matching is deterministic (synonyms + token overlap), so it is explainable:
// every match carries a confidence and the header it came from, and the user
// confirms or fixes the uncertain ones.

import type { PassType, PersonRole } from '../core/types';
import { parseTime, TABS, type Table, type Tables } from '../data/sheet';

// ------------------------------------------------------------ what the agent understands
export type Kind = 'schedule' | 'venues' | 'rooms' | 'films' | 'people' | 'arrivals' | 'availability' | 'passes' | 'tickets' | 'saved' | 'shifts' | 'docs' | 'travel';

export interface FieldSpec { key: string; label: string; required?: boolean; synonyms: string[] }

export const KINDS: Record<Kind, { label: string; describe: string; fields: FieldSpec[] }> = {
  schedule: {
    label: 'Schedule', describe: 'screenings, Q&As, panels and other events',
    fields: [
      { key: 'title', label: 'Event title', required: true, synonyms: ['title', 'event', 'event title', 'event name', 'name', 'program', 'session', 'film title', 'film'] },
      { key: 'date', label: 'Date or day', required: true, synonyms: ['date', 'day', 'screening date', 'event date', 'show date', 'festival day'] },
      { key: 'start', label: 'Start time', required: true, synonyms: ['start', 'start time', 'time', 'showtime', 'show time', 'begins', 'from', 'screening time', 'starts'] },
      { key: 'end', label: 'End time', synonyms: ['end', 'end time', 'ends', 'until', 'to', 'finish'] },
      { key: 'duration', label: 'Length (minutes)', synonyms: ['duration', 'length', 'runtime', 'running time', 'minutes', 'mins', 'run time'] },
      { key: 'venue', label: 'Venue', required: true, synonyms: ['venue', 'theatre', 'theater', 'location', 'cinema', 'hall', 'venue id', 'space', 'building'] },
      { key: 'room', label: 'Screen or room', synonyms: ['room', 'screen', 'auditorium', 'house', 'cinema number', 'screen number', 'room name'] },
      { key: 'sold', label: 'Seats sold', synonyms: ['seats sold', 'sold', 'tickets sold', 'sales', 'sold seats'] },
      { key: 'held', label: 'Seats held', synonyms: ['seats held', 'held', 'holds', 'house seats', 'comps held', 'reserved'] },
      { key: 'type', label: 'Event type', synonyms: ['type', 'kind', 'category', 'format', 'event type'] },
      { key: 'film', label: 'Film', synonyms: ['film id', 'film', 'movie', 'film title', 'work'] },
      { key: 'guests', label: 'Guests', synonyms: ['guests', 'guest', 'talent', 'speakers', 'panelists', 'in person', 'filmmakers attending', 'guest ids'] },
      { key: 'restriction', label: 'Who can attend', synonyms: ['restriction', 'access', 'audience', 'admission', 'eligibility'] },
      { key: 'status', label: 'Status', synonyms: ['status', 'state', 'cancelled', 'canceled'] },
      { key: 'id', label: 'Event ID', synonyms: ['event id', 'id', 'code', 'screening id', 'session id'] },
    ],
  },
  rooms: {
    label: 'Screens and rooms', describe: 'screens or rooms inside each venue, with their seats',
    fields: [
      { key: 'venue', label: 'Venue', required: true, synonyms: ['venue', 'location', 'theatre', 'theater', 'building', 'cinema'] },
      { key: 'room', label: 'Screen or room', required: true, synonyms: ['room', 'screen', 'auditorium', 'house', 'room name', 'screen name'] },
      { key: 'capacity', label: 'Seats', required: true, synonyms: ['seats', 'capacity', 'seating', 'seat count', 'size'] },
    ],
  },
  venues: {
    label: 'Venues', describe: 'theaters and rooms with seat counts',
    fields: [
      { key: 'name', label: 'Venue name', required: true, synonyms: ['name', 'venue', 'venue name', 'theatre', 'theater', 'location'] },
      { key: 'capacity', label: 'Seats', required: true, synonyms: ['capacity', 'seats', 'seating', 'seat count', 'max', 'size'] },
      { key: 'address', label: 'Address', synonyms: ['address', 'street', 'location address', 'where'] },
      { key: 'id', label: 'Venue ID', synonyms: ['venue id', 'id', 'code'] },
    ],
  },
  films: {
    label: 'Films', describe: 'the film catalog',
    fields: [
      { key: 'title', label: 'Title', required: true, synonyms: ['title', 'film', 'film title', 'name', 'movie'] },
      { key: 'director', label: 'Director', synonyms: ['director', 'directed by', 'filmmaker', 'directors'] },
      { key: 'runtime', label: 'Runtime (min)', synonyms: ['runtime', 'running time', 'length', 'duration', 'minutes', 'runtime min'] },
      { key: 'section', label: 'Section', synonyms: ['section', 'program', 'strand', 'category', 'competition'] },
      { key: 'filmmakers', label: 'Featured filmmakers', synonyms: ['featured filmmakers', 'featured filmmaker ids', 'talent', 'attending filmmakers'] },
      { key: 'id', label: 'Film ID', synonyms: ['film id', 'id', 'code'] },
    ],
  },
  people: {
    label: 'People', describe: 'attendees, guests, volunteers and staff',
    fields: [
      { key: 'name', label: 'Name', required: true, synonyms: ['name', 'full name', 'attendee', 'person', 'contact', 'attendee name'] },
      { key: 'first', label: 'First name', synonyms: ['first name', 'first', 'given name', 'firstname'] },
      { key: 'last', label: 'Last name', synonyms: ['last name', 'last', 'surname', 'family name', 'lastname'] },
      { key: 'email', label: 'Email', synonyms: ['email', 'e mail', 'email address', 'mail'] },
      { key: 'phone', label: 'Phone', synonyms: ['phone', 'mobile', 'cell', 'phone number', 'telephone', 'sms'] },
      { key: 'role', label: 'Role', synonyms: ['role', 'type', 'category', 'attendee type', 'group'] },
      { key: 'pass', label: 'Pass or badge', synonyms: ['pass', 'pass type', 'badge', 'badge type', 'ticket type', 'credential', 'access level', 'registration type'] },
      { key: 'staffRole', label: 'Job', synonyms: ['staff role', 'job', 'position', 'team', 'department'] },
      { key: 'id', label: 'Person ID', synonyms: ['person id', 'id', 'attendee id', 'contact id', 'registration id'] },
    ],
  },
  arrivals: {
    label: 'Guest travel', describe: 'when guests arrive and leave, and how',
    fields: [
      { key: 'person', label: 'Guest', required: true, synonyms: ['guest', 'name', 'email', 'person', 'filmmaker', 'talent'] },
      { key: 'arrives', label: 'Arrives', required: true, synonyms: ['arrives', 'arrival', 'arriving', 'arrival time', 'lands', 'eta', 'in town'] },
      { key: 'departs', label: 'Leaves', synonyms: ['departs', 'departure', 'leaves', 'leaving', 'departure time', 'out'] },
      { key: 'how', label: 'Flight or train', synonyms: ['flight', 'flight number', 'train', 'transport', 'travel', 'carrier'] },
      { key: 'hotel', label: 'Hotel', synonyms: ['hotel', 'accommodation', 'staying at', 'lodging'] },
    ],
  },
  availability: {
    label: 'Volunteer availability', describe: 'which days volunteers can work and what they can do',
    fields: [
      { key: 'person', label: 'Volunteer', required: true, synonyms: ['volunteer', 'name', 'email', 'person'] },
      { key: 'days', label: 'Available days', synonyms: ['available days', 'availability', 'available', 'days available', 'can work'] },
      { key: 'skills', label: 'Skills', synonyms: ['skills', 'skill', 'languages', 'certifications', 'qualifications', 'can do', 'experience'] },
    ],
  },
  passes: {
    label: 'Passes', describe: 'who holds which pass or badge',
    fields: [
      { key: 'person', label: 'Holder', required: true, synonyms: ['person', 'holder', 'name', 'email', 'person id', 'attendee'] },
      { key: 'pass', label: 'Pass type', required: true, synonyms: ['pass', 'pass type', 'badge', 'type', 'ticket type'] },
      { key: 'days', label: 'Valid days', synonyms: ['valid days', 'days', 'valid on', 'day'] },
    ],
  },
  tickets: {
    label: 'Tickets', describe: 'single-screening tickets',
    fields: [
      { key: 'person', label: 'Holder', required: true, synonyms: ['person', 'holder', 'name', 'email', 'person id', 'buyer', 'purchaser'] },
      { key: 'event', label: 'Event', required: true, synonyms: ['event', 'screening', 'event id', 'film', 'session', 'session code', 'show'] },
      { key: 'id', label: 'Ticket ID', synonyms: ['ticket id', 'id', 'order', 'barcode'] },
      { key: 'type', label: 'Ticket type', synonyms: ['ticket type', 'type', 'price level', 'tier', 'fare'] },
      { key: 'price', label: 'Price', synonyms: ['price', 'amount', 'paid', 'total', 'cost'] },
    ],
  },
  saved: {
    label: 'Saved events', describe: 'events people added to their itinerary',
    fields: [
      { key: 'person', label: 'Person', required: true, synonyms: ['person', 'name', 'email', 'person id', 'user'] },
      { key: 'event', label: 'Event', required: true, synonyms: ['event', 'event id', 'saved', 'screening', 'favorite', 'session', 'session code'] },
    ],
  },
  shifts: {
    label: 'Volunteer shifts', describe: 'who works where and when',
    fields: [
      { key: 'person', label: 'Volunteer', required: true, synonyms: ['volunteer', 'person', 'name', 'email', 'person id', 'staff'] },
      { key: 'venue', label: 'Venue', required: true, synonyms: ['venue', 'location', 'theatre', 'theater', 'post', 'venue id'] },
      { key: 'date', label: 'Date or day', required: true, synonyms: ['date', 'day', 'shift date'] },
      { key: 'start', label: 'Start time', required: true, synonyms: ['start', 'start time', 'from', 'shift start', 'begins'] },
      { key: 'end', label: 'End time', required: true, synonyms: ['end', 'end time', 'to', 'until', 'shift end'] },
      { key: 'task', label: 'Task', synonyms: ['task', 'role', 'job', 'position', 'duty'] },
    ],
  },
  docs: {
    label: 'Official documents', describe: 'FAQ and policies the agent answers from',
    fields: [
      { key: 'title', label: 'Document', synonyms: ['document', 'document title', 'doc', 'policy', 'title'] },
      { key: 'section', label: 'Section', required: true, synonyms: ['section', 'heading', 'question', 'topic', 'q'] },
      { key: 'text', label: 'Text', required: true, synonyms: ['text', 'answer', 'body', 'content', 'a', 'details'] },
    ],
  },
  travel: { label: 'Travel times', describe: 'minutes between venues', fields: [] },
};
export const KIND_ORDER: Kind[] = ['schedule', 'venues', 'rooms', 'films', 'people', 'arrivals', 'availability', 'passes', 'tickets', 'saved', 'shifts', 'docs', 'travel'];

// ------------------------------------------------------------ matching
const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const toks = (s: string) => new Set(norm(s).split(' ').filter(Boolean));

function headerScore(header: string, f: FieldSpec): number {
  const h = norm(header);
  if (!h) return 0;
  let best = 0;
  for (const syn of f.synonyms) {
    if (h === syn) return 1;
    const a = toks(h), b = toks(syn);
    const inter = [...a].filter(x => b.has(x)).length;
    if (!inter) continue;
    const j = inter / new Set([...a, ...b]).size;
    best = Math.max(best, b.size === inter ? Math.max(0.75, j) : j * 0.9);
  }
  return Math.round(best * 100) / 100;
}

export interface ColumnMatch { field: string; header: string | null; confidence: number }

/** Best header for each field, each header used once, strongest matches first. */
export function matchColumns(kind: Kind, headers: string[]): ColumnMatch[] {
  const fields = KINDS[kind].fields;
  const pairs: { f: string; h: string; s: number }[] = [];
  for (const f of fields) for (const h of headers) {
    const s = headerScore(h, f);
    if (s >= 0.34) pairs.push({ f: f.key, h, s: s + (f.required ? 0.001 : 0) });
  }
  pairs.sort((a, b) => b.s - a.s);
  const usedH = new Set<string>(), out = new Map<string, ColumnMatch>();
  for (const p of pairs) {
    if (usedH.has(p.h) || out.has(p.f)) continue;
    usedH.add(p.h); out.set(p.f, { field: p.f, header: p.h, confidence: Math.min(1, Math.round(p.s * 100) / 100) });
  }
  return fields.map(f => out.get(f.key) ?? { field: f.key, header: null, confidence: 0 });
}

/** What a file most likely is, from its name and headers. */
export function guessKind(fileName: string, headers: string[]): { kind: Kind; confidence: number } {
  const name = norm(fileName);
  if ((/travel|distance|walk/.test(name) && !/guest|arriv|flight/.test(name)) || /from.*to/.test(norm(headers[0] ?? ''))) return { kind: 'travel', confidence: 0.9 };
  const hints: [Kind, RegExp][] = [
    ['schedule', /schedule|program|grid|screenings|showtimes|sessions|events/], ['venues', /venue|theat|locations/], ['rooms', /rooms|screens|auditoria|auditoriums/],
    ['arrivals', /arriv|flights|hotel|itinerar.*guest|guest.*(travel|itinerar)/], ['availability', /availab|skills|sign ?ups?/],
    ['films', /film|catalog|movies|titles/], ['people', /people|attendee|guest|contacts|registr|badge holders|staff list/],
    ['passes', /pass|badge|credential/], ['tickets', /ticket|orders/], ['saved', /saved|itinerar|favorite|my schedule/],
    ['shifts', /shift|volunteer|rota|roster/], ['docs', /faq|policy|policies|documents|handbook|guide/],
  ];
  let best: { kind: Kind; confidence: number } = { kind: 'schedule', confidence: 0 };
  for (const kind of KIND_ORDER) {
    if (kind === 'travel') continue;
    const m = matchColumns(kind, headers);
    const conf = (k: string) => m.find(x => x.field === k)?.confidence ?? 0;
    const req = KINDS[kind].fields.filter(f => f.required);
    // A first name column stands in for a full name.
    const reqHit = req.filter(f => conf(f.key) >= 0.5 || (f.key === 'name' && conf('first') >= 0.5)).length / Math.max(1, req.length);
    const coverage = m.filter(x => x.header).reduce((a, x) => a + x.confidence, 0) / Math.max(1, headers.length);
    let score = reqHit * 0.5 + coverage * 0.5;
    if (hints.find(([k]) => k === kind)?.[1].test(name)) score += 0.2;
    if (score > best.confidence) best = { kind, confidence: Math.min(1, Math.round(score * 100) / 100) };
  }
  return best;
}

// ------------------------------------------------------------ values
const PASS_WORDS: [RegExp, PassType][] = [
  [/staff|crew|organi[sz]er/i, 'festival_staff'], [/volunteer/i, 'volunteer'], [/press|media|journalist/i, 'press'],
  [/industry|market|buyer|sales/i, 'industry'], [/panel|speaker|moderator/i, 'panelist'], [/filmmaker|director|talent|featured|jury|juror/i, 'featured_filmmaker'],
  [/vip|patron|premium|all access/i, 'vip'], [/3|three|full|festival pass|multi/i, 'three_day'], [/day/i, 'day_pass'], [/single|ticket/i, 'single_ticket'],
];
export function normPass(raw: string): PassType | null {
  const r = raw.trim();
  if (!r) return null;
  const exact = r.toLowerCase().replace(/[\s-]+/g, '_');
  if (['day_pass', 'single_ticket', 'three_day', 'vip', 'industry', 'press', 'panelist', 'featured_filmmaker', 'volunteer', 'festival_staff'].includes(exact)) return exact as PassType;
  return PASS_WORDS.find(([re]) => re.test(r))?.[1] ?? null;
}
const ROLE_FROM_PASS: Record<PassType, PersonRole> = {
  festival_staff: 'festival_staff', volunteer: 'volunteer', press: 'press', industry: 'industry', panelist: 'guest',
  featured_filmmaker: 'guest', vip: 'attendee', three_day: 'attendee', day_pass: 'attendee', single_ticket: 'attendee',
};
export function normRole(raw: string, pass: PassType | null): PersonRole {
  const r = raw.toLowerCase();
  if (/staff|crew|organi/.test(r)) return 'festival_staff';
  if (/volunteer/.test(r)) return 'volunteer';
  if (/press|media/.test(r)) return 'press';
  if (/industry|buyer|sales/.test(r)) return 'industry';
  if (/guest|talent|filmmaker|director|panel|speaker|jury/.test(r)) return 'guest';
  if (/attendee|public|audience|patron|member/.test(r)) return 'attendee';
  return pass ? ROLE_FROM_PASS[pass] : 'attendee';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "1", "Day 2", "2027-04-16", "4/16/2027", "Apr 16", "Friday 16 April" → festival day number. */
export function dayFrom(raw: string, dates: string[]): number | null {
  const r = raw.trim().toLowerCase();
  if (!r) return null;
  const n = /^(?:day\s*)?(\d)$/.exec(r);
  if (n) { const d = Number(n[1]); return d >= 1 && d <= dates.length ? d : null; }
  const year = dates[0]?.slice(0, 4) ?? '2027';
  let iso: string | null = null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(r);
  if (m) iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = m ? null : /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(r);
  if (m) iso = `${m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if (!iso) {
    const mon = MONTHS.findIndex(x => r.includes(x));
    const dd = /\b(\d{1,2})\b/.exec(r);
    if (mon >= 0 && dd) iso = `${year}-${String(mon + 1).padStart(2, '0')}-${dd[1].padStart(2, '0')}`;
  }
  const i = iso ? dates.indexOf(iso) : -1;
  return i >= 0 ? i + 1 : null;
}

/** A calendar date in any common format → "2027-05-21" (the year defaults to the festival's). */
export function isoDate(raw: string, year: string): string | null {
  const r = raw.trim().toLowerCase();
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(r);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(r);
  if (m) return `${m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const mon = MONTHS.findIndex(x => r.includes(x));
  const dd = /\b(\d{1,2})\b(?!:)/.exec(r.replace(/\d{1,2}[:.]\d{2}.*/, ''));
  if (mon >= 0 && dd) return `${year}-${String(mon + 1).padStart(2, '0')}-${dd[1].padStart(2, '0')}`;
  return null;
}
/** "5/21/2027 2:30pm", "May 21, 14:30", "2027-05-21T14:30" → "2027-05-21T14:30". */
export function isoDateTime(raw: string, year: string): string | null {
  const date = isoDate(raw, year);
  const t = /(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*$/i.exec(raw.trim().replace(/T(?=\d)/, ' '));
  const time = t ? parseTime(t[1]) : null;
  return date && time ? `${date}T${time}` : null;
}
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** "Thu, Fri, Sat", "5/20; 5/21", "Day 1 2", "all" → festival day numbers. */
export function daysFrom(raw: string, dates: string[]): number[] {
  const r = raw.trim().toLowerCase();
  if (!r) return [];
  if (/^(all|any|every ?day|all days|any day|whole festival)$/.test(r)) return dates.map((_, i) => i + 1);
  const out = new Set<number>();
  for (const tok of r.split(/[,;&+]|\band\b/).map(x => x.trim()).filter(Boolean)) {
    const wd = WEEKDAYS.findIndex(w => tok.startsWith(w));
    if (wd >= 0 && !/\d/.test(tok)) { dates.forEach((d, i) => { if (new Date(`${d}T12:00:00Z`).getUTCDay() === wd) out.add(i + 1); }); continue; }
    const d = dayFrom(tok, dates);
    if (d) out.add(d);
    else for (const n of tok.match(/^(?:days?\s*)?([\d\s]+)$/)?.[1].trim().split(/\s+/) ?? []) if (Number(n) >= 1 && Number(n) <= dates.length) out.add(Number(n));
  }
  return [...out].sort((a, b) => a - b);
}

const slug = (s: string) => norm(s).replace(/\s+/g, '-').slice(0, 24) || 'x';
const addMin = (hhmm: string, min: number) => {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + min;
  return `${String(Math.min(23, Math.floor(t / 60))).padStart(2, '0')}:${String(t >= 24 * 60 ? 59 : t % 60).padStart(2, '0')}`;
};

// ------------------------------------------------------------ building canonical tables
export interface Upload { name: string; table: Table; kind: Kind; columns: ColumnMatch[] }
export interface FestivalMeta { name: string; startDate: string; days: number; city?: string }
export interface BuildResult { tables: Tables; notes: string[]; unresolved: string[] }

function getter(u: Upload) {
  const idx = new Map(u.columns.filter(c => c.header).map(c => [c.field, u.table[0].indexOf(c.header!)]));
  return (row: string[], field: string) => { const i = idx.get(field); return i === undefined || i < 0 ? '' : (row[i] ?? '').trim(); };
}
const body = (t: Table) => t.slice(1).filter(r => r.some(c => (c ?? '').trim()));

export function festivalDates(meta: FestivalMeta): string[] {
  const out: string[] = [];
  const d0 = new Date(`${meta.startDate}T12:00:00Z`);
  for (let i = 0; i < Math.min(31, Math.max(1, meta.days)); i++) out.push(new Date(d0.getTime() + i * 864e5).toISOString().slice(0, 10));
  return out;
}

/** Turn the user's files into the agent's tables. Names are resolved to IDs; missing pieces get safe defaults, each noted. */
export function buildTables(meta: FestivalMeta, uploads: Upload[]): BuildResult {
  const notes: string[] = [];
  const unresolved: string[] = [];
  const dates = festivalDates(meta);
  const ALL = dates.map((_, i) => i + 1).join(' ');
  const of = (k: Kind) => uploads.filter(u => u.kind === k);

  // Venues
  const venues: { id: string; name: string; capacity: number; address: string }[] = [];
  const venueKey = new Map<string, string>();
  const addVenue = (name: string, cap = 0, address = '', id = '') => {
    const k = norm(name) || norm(id);
    if (venueKey.has(k)) return venueKey.get(k)!;
    const vid = id || `v-${slug(name)}`;
    venues.push({ id: vid, name: name || vid, capacity: cap || 150, address });
    venueKey.set(k, vid); if (id) venueKey.set(norm(id), vid);
    if (!cap) notes.push(`Venue "${name || vid}" has no seat count, so 150 is assumed. You can change it later.`);
    return vid;
  };
  for (const u of of('venues')) { const g = getter(u); for (const r of body(u.table)) addVenue(g(r, 'name') || g(r, 'id'), Number(g(r, 'capacity')) || 0, g(r, 'address'), g(r, 'id')); }
  const rooms = new Map<string, { name: string; capacity: number }[]>();
  for (const u of of('rooms')) {
    const g = getter(u);
    body(u.table).forEach((r, i) => {
      const vname = g(r, 'venue'), room = g(r, 'room'), seats = Number(g(r, 'capacity').replace(/\D/g, ''));
      if (!vname || !room) return;
      if (!seats) { unresolved.push(`Rooms row ${i + 2}: "${room}" has no seat count`); return; }
      const vid = venueKey.get(norm(vname)) ?? addVenue(vname, seats);
      const list = rooms.get(vid) ?? [];
      if (!list.some(x => norm(x.name) === norm(room))) list.push({ name: room, capacity: seats });
      rooms.set(vid, list);
    });
  }
  for (const v of venues) {
    const list = rooms.get(v.id);
    if (!list?.length) continue;
    const total = list.reduce((a, x) => a + x.capacity, 0);
    if (v.capacity !== total) notes.push(`${v.name}: seats taken from its ${list.length} rooms (${total} in all).`);
    v.capacity = total;
  }
  const venueId = (raw: string) => venueKey.get(norm(raw)) ?? addVenue(raw);
  const roomOf = (vid: string, raw: string) => rooms.get(vid)?.find(x => norm(x.name) === norm(raw))?.name;

  // People (and passes given in the people file)
  const people: string[][] = [];
  const passes: string[][] = [];
  const personKey = new Map<string, string>();
  for (const u of of('people')) {
    const g = getter(u);
    body(u.table).forEach((r, i) => {
      const name = g(r, 'name') || [g(r, 'first'), g(r, 'last')].filter(Boolean).join(' ');
      if (!name) return;
      const id = g(r, 'id') || `p-${String(people.length + 1).padStart(3, '0')}`;
      const pass = normPass(g(r, 'pass'));
      const role = normRole(g(r, 'role'), pass);
      const email = g(r, 'email'), phone = g(r, 'phone');
      const channels = ['app_push', email && 'email', phone && 'sms'].filter(Boolean).join(', ');
      people.push([id, name, role, email, channels, g(r, 'staffRole') || (role === 'volunteer' ? 'usher' : ''), 'FALSE', phone, '', '', '', '', '']);
      for (const k of [id, name, email]) if (k) personKey.set(norm(k), id);
      if (pass) passes.push([id, pass, dates.slice(0, meta.days).map((_, j) => j + 1).join(' ')]);
      else if (g(r, 'pass')) unresolved.push(`People row ${i + 2}: pass "${g(r, 'pass')}" not recognised`);
    });
  }
  const personId = (raw: string) => raw.split(/[,;]|\band\b/).map(x => personKey.get(norm(x))).filter((x): x is string => !!x);
  const year = dates[0]?.slice(0, 4) ?? '2027';
  const personRow = (pid: string) => people.find(p => p[0] === pid)!;

  for (const u of of('arrivals')) {
    const g = getter(u);
    body(u.table).forEach((r, i) => {
      const [pid] = personId(g(r, 'person'));
      if (!pid) { unresolved.push(`Guest travel row ${i + 2}: unknown guest "${g(r, 'person')}"`); return; }
      const row = personRow(pid);
      const arr = isoDateTime(g(r, 'arrives'), year), dep = g(r, 'departs') ? isoDateTime(g(r, 'departs'), year) : '';
      if (!arr) { unresolved.push(`Guest travel row ${i + 2}: arrival "${g(r, 'arrives')}" needs a date and a time`); return; }
      if (dep === null) unresolved.push(`Guest travel row ${i + 2}: departure "${g(r, 'departs')}" needs a date and a time`);
      row[8] = arr; row[9] = dep || '';
      row[10] = [g(r, 'how'), g(r, 'hotel') && `staying at ${g(r, 'hotel')}`].filter(Boolean).join(', ');
    });
  }
  for (const u of of('availability')) {
    const g = getter(u);
    body(u.table).forEach((r, i) => {
      const [pid] = personId(g(r, 'person'));
      if (!pid) { unresolved.push(`Volunteer availability row ${i + 2}: unknown volunteer "${g(r, 'person')}"`); return; }
      const row = personRow(pid);
      const days = daysFrom(g(r, 'days'), dates);
      if (g(r, 'days') && !days.length) unresolved.push(`Volunteer availability row ${i + 2}: days "${g(r, 'days')}" not understood`);
      row[11] = g(r, 'skills').split(/[,;/]/).map(x => x.trim()).filter(Boolean).join(', ');
      row[12] = days.join(' ');
    });
  }

  for (const u of of('passes')) {
    const g = getter(u);
    body(u.table).forEach((r, i) => {
      const [pid] = personId(g(r, 'person')); const pass = normPass(g(r, 'pass'));
      if (!pid || !pass) { unresolved.push(`Passes row ${i + 2}: ${!pid ? `unknown person "${g(r, 'person')}"` : `pass "${g(r, 'pass')}" not recognised`}`); return; }
      const days = (g(r, 'days').match(/\d+/g) ?? []).join(' ') || ALL;
      const at = passes.findIndex(p => p[0] === pid);
      if (at >= 0) passes[at] = [pid, pass, days]; else passes.push([pid, pass, days]);
    });
  }

  // Films
  const films: string[][] = [];
  const filmKey = new Map<string, string>();
  for (const u of of('films')) {
    const g = getter(u);
    body(u.table).forEach(r => {
      const title = g(r, 'title'); if (!title) return;
      const id = g(r, 'id') || `f-${String(films.length + 1).padStart(2, '0')}`;
      films.push([id, title, g(r, 'director'), g(r, 'runtime').replace(/\D/g, '') || '90', g(r, 'section'), personId(g(r, 'filmmakers')).join(', ')]);
      filmKey.set(norm(title), id); filmKey.set(norm(id), id);
    });
  }

  // Schedule
  const events: string[][] = [];
  const eventKey = new Map<string, string>();
  for (const u of of('schedule')) {
    const g = getter(u);
    body(u.table).forEach((r, i) => {
      const title = g(r, 'title'); if (!title) return;
      const day = dayFrom(g(r, 'date'), dates.slice(0, meta.days));
      const start = parseTime(g(r, 'start'));
      if (!day || !start) { unresolved.push(`Schedule row ${i + 2} ("${title}"): ${!day ? `date "${g(r, 'date')}" is not a festival day` : `time "${g(r, 'start')}" not understood`}`); return; }
      const rawType = (g(r, 'type') || title).toLowerCase();
      const kind = /q\s*&?\s*a|q and a|conversation/.test(rawType) ? 'qa' : /panel|talk|keynote|masterclass/.test(rawType) ? 'panel'
        : /market/.test(rawType) ? 'market' : /party|reception|workshop|activity|brunch|meetup/.test(rawType) ? 'activity' : 'screening';
      const bare = title.replace(/^[^:]{1,30}:\s*/, '');
      let filmId = filmKey.get(norm(g(r, 'film'))) ?? (kind === 'screening' || kind === 'qa' ? filmKey.get(norm(title)) ?? filmKey.get(norm(bare)) : undefined);
      const duration = Number(g(r, 'duration').replace(/\D/g, ''));
      if (!filmId && kind === 'screening') {
        filmId = `f-${String(films.length + 1).padStart(2, '0')}`;
        films.push([filmId, bare, '', String(duration || 90), '', '']);
        filmKey.set(norm(bare), filmId);
      }
      const runtime = Number(films.find(f => f[0] === filmId)?.[3]) || 0;
      const end = parseTime(g(r, 'end')) ?? addMin(start, duration || (kind === 'screening' ? runtime || 90 : kind === 'qa' ? 20 : 60));
      if (!parseTime(g(r, 'end'))) notes.push(`"${title}" (day ${day}, ${start}): no end time, so it ends at ${end} (from its length).`);
      const id = g(r, 'id') || `e-${String(events.length + 1).padStart(3, '0')}`;
      const status = /cancel/i.test(g(r, 'status')) ? 'cancelled' : 'scheduled';
      const restr = g(r, 'restriction').toLowerCase();
      const restriction = /press/.test(restr) ? 'press_only' : /industry/.test(restr) ? 'industry_only' : /vip/.test(restr) ? 'vip_only' : '';
      const guestsRaw = g(r, 'guests');
      const guests = personId(guestsRaw);
      if (guestsRaw && guests.length === 0) unresolved.push(`Schedule row ${i + 2}: guest "${guestsRaw}" is not in the people list`);
      const vid = venueId(g(r, 'venue'));
      const roomRaw = g(r, 'room');
      const room = roomRaw ? roomOf(vid, roomRaw) : '';
      if (roomRaw && !room) {
        if (rooms.has(vid)) unresolved.push(`Schedule row ${i + 2} ("${title}"): "${roomRaw}" is not a room at ${venues.find(v => v.id === vid)?.name}`);
        else { const list = rooms.get(vid) ?? []; list.push({ name: roomRaw, capacity: 0 }); }
      }
      const seats = (k: string) => g(r, k).replace(/[^\d]/g, '');
      events.push([id, String(day), start, end, kind, title, vid, filmId ?? '', guests.join(', '), restriction, status, room ?? '', seats('sold'), seats('held')]);
      eventKey.set(norm(id), id); eventKey.set(norm(title), eventKey.get(norm(title)) ?? id);
      eventKey.set(norm(`${title} ${day} ${start}`), id);
    });
  }
  const eventId = (raw: string) => eventKey.get(norm(raw));

  const tickets: string[][] = [], saved: string[][] = [], shifts: string[][] = [];
  for (const u of of('tickets')) {
    const g = getter(u);
    body(u.table).forEach((r, i) => {
      const [pid] = personId(g(r, 'person')); const eid = eventId(g(r, 'event'));
      if (!pid || !eid) { unresolved.push(`Tickets row ${i + 2}: ${!pid ? `unknown person "${g(r, 'person')}"` : `unknown event "${g(r, 'event')}"`}`); return; }
      const price = g(r, 'price').replace(/[^\d.]/g, '');
      tickets.push([g(r, 'id') || `t-${String(tickets.length + 1).padStart(3, '0')}`, pid, eid, g(r, 'type'), price]);
      if (!passes.some(p => p[0] === pid)) passes.push([pid, 'single_ticket', ALL]);
    });
  }
  for (const u of of('saved')) {
    const g = getter(u);
    body(u.table).forEach((r, i) => {
      const [pid] = personId(g(r, 'person')); const eid = eventId(g(r, 'event'));
      if (!pid || !eid) { unresolved.push(`Saved events row ${i + 2}: could not match "${!pid ? g(r, 'person') : g(r, 'event')}"`); return; }
      saved.push([pid, eid]);
    });
  }
  for (const u of of('shifts')) {
    const g = getter(u);
    body(u.table).forEach((r, i) => {
      const [pid] = personId(g(r, 'person'));
      const day = dayFrom(g(r, 'date'), dates.slice(0, meta.days));
      const s = parseTime(g(r, 'start')), e = parseTime(g(r, 'end'));
      if (!pid || !day || !s || !e) { unresolved.push(`Volunteer shifts row ${i + 2}: ${!pid ? `unknown volunteer "${g(r, 'person')}"` : 'date or time not understood'}`); return; }
      shifts.push([`s-${String(shifts.length + 1).padStart(3, '0')}`, pid, venueId(g(r, 'venue')), String(day), s, e, g(r, 'task') || 'usher']);
      if (!passes.some(p => p[0] === pid)) passes.push([pid, 'volunteer', ALL]);
    });
  }

  // Official documents
  const docs: string[][] = [];
  for (const u of of('docs')) {
    const g = getter(u);
    for (const r of body(u.table)) {
      const title = g(r, 'title') || u.name.replace(/\.\w+$/, '');
      if (g(r, 'section') && g(r, 'text')) docs.push([`doc-${slug(title)}`, title, g(r, 'section'), g(r, 'text')]);
    }
  }

  // Travel times: from a file, else a sensible default.
  const ids = venues.map(v => v.id);
  let travel: Table = [[TABS['Travel times'].header[0], ...ids], ...ids.map(a => [a, ...ids.map(b => (a === b ? '0' : '15'))])];
  const tu = of('travel')[0];
  if (tu) {
    const cols = tu.table[0].slice(1).map(c => venueKey.get(norm(c)) ?? c);
    travel = [[TABS['Travel times'].header[0], ...cols], ...body(tu.table).map(r => [venueKey.get(norm(r[0])) ?? r[0], ...r.slice(1)])];
  } else if (ids.length > 1) notes.push('No travel times between venues, so 15 minutes is assumed between any two. Add a travel file for better recommendations.');

  if (!of('docs').length) notes.push('No FAQ or policy documents yet, so the Ask feature will answer "I don\'t know" until you add some.');
  for (const p of people) if (!passes.some(x => x[0] === p[0])) {
    const role = p[2];
    passes.push([p[0], role === 'festival_staff' ? 'festival_staff' : role === 'volunteer' ? 'volunteer' : role === 'press' ? 'press' : role === 'industry' ? 'industry' : role === 'guest' ? 'featured_filmmaker' : 'day_pass', ALL]);
  }

  const T = (k: keyof typeof TABS) => [...TABS[k].header] as string[];
  return {
    tables: {
      Festival: [T('Festival'), ['Name', meta.name], ...dates.map((d, i) => [`Day ${i + 1} date`, d])],
      'Schedule grid': [T('Schedule grid'), ...events],
      Venues: [T('Venues'), ...venues.map(v => [v.id, v.name, String(v.capacity), v.address, (rooms.get(v.id) ?? []).map(x => `${x.name}: ${x.capacity}`).join('; ')])],
      'Travel times': travel,
      Films: [T('Films'), ...films],
      People: [T('People'), ...people],
      Passes: [T('Passes'), ...passes],
      Tickets: [T('Tickets'), ...tickets],
      'Saved events': [T('Saved events'), ...saved],
      'Volunteer shifts': [T('Volunteer shifts'), ...shifts],
      'Official documents': [T('Official documents'), ...docs],
    },
    notes: [...new Set(notes)],
    unresolved,
  };
}

// ------------------------------------------------------------ short summaries for the Check step
/**
 * Collapse row-by-row notes into a few lines: "People row 24: pass "Speaker"
 * not recognised" ×6 becomes one line with a count; the per-event "no end
 * time" notes become one line.
 */
export function summarizeNotes(lines: string[]): string[] {
  const groups = new Map<string, number>();
  let noEnd = 0;
  for (const l of lines) {
    if (/: no end time, so it ends at/.test(l)) { noEnd++; continue; }
    const key = l.replace(/^([A-Za-z ]+?) row \d+(?: \("[^"]*"\))?: /, '$1: ');
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const out = [...groups].map(([k, n]) => (n > 1 ? `${k} (${n} rows)` : k));
  if (noEnd) out.unshift(`${noEnd} event${noEnd === 1 ? ' has' : 's have'} no end time, so Usher worked ${noEnd === 1 ? 'it' : 'them'} out from the running time.`);
  return out;
}

/**
 * First and last date found in the schedule files, as YYYY-MM-DD, so setup can
 * fill in (or correct) the festival dates instead of silently dropping events.
 */
export function scheduleDateRange(uploads: Upload[], yearHint = String(new Date().getFullYear() + 1)): { first: string; last: string; rows: number } | null {
  const found: string[] = [];
  for (const u of uploads.filter(x => x.kind === 'schedule')) {
    const g = getter(u);
    for (const r of body(u.table)) {
      const iso = isoDate(g(r, 'date'), yearHint);
      if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(`${iso}T12:00:00Z`))) found.push(iso);
    }
  }
  if (!found.length) return null;
  found.sort();
  return { first: found[0], last: found[found.length - 1], rows: found.length };
}
