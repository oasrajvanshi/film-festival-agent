// The mock festival from the proposal: 40 films, 4 venues, 3 days,
// 10 pass types, 15 guests, 10 panels, 60 volunteers.
// Deterministic: the same seed always produces the same festival.
// Every person here is made up.

import type {
  Channel, DayNumber, Festival, FestivalEvent, Film, OfficialDoc, Pass, PassType,
  Person, PersonRole, Shift, Ticket, TravelMatrix, Venue,
} from '../core/types';
import { addMinutes, overlaps, toMinutes } from '../core/time';
import { OFFICIAL_DOCS } from './docs';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Ada', 'Bram', 'Cleo', 'Dev', 'Elif', 'Femi', 'Greta', 'Hiro', 'Ines', 'Jonah', 'Kaia', 'Luca',
  'Mira', 'Nico', 'Oona', 'Pavel', 'Quinn', 'Rosa', 'Sami', 'Tova', 'Uri', 'Vera', 'Wren', 'Xavi', 'Yara', 'Zane'];
const LAST = ['Abara', 'Brennick', 'Castell', 'Dunmore', 'Eskew', 'Farrow', 'Galloway', 'Hollis', 'Ivers', 'Jessop',
  'Kettering', 'Lowry', 'Marchetti', 'Nakamura', 'Okafor', 'Pell', 'Quarles', 'Rourke', 'Sandoval', 'Thibault',
  'Ulloa', 'Vance', 'Whitlock', 'Yoon'];
const TITLE_A = ['Quiet', 'Salt', 'Paper', 'Northern', 'Borrowed', 'Glass', 'Low', 'Last', 'Hollow', 'Bright',
  'Second', 'Iron', 'Small', 'Late', 'Wild', 'Far', 'Open', 'Silver', 'Night', 'Lost'];
const TITLE_B = ['Harbor', 'Hours', 'Kingdom', 'Signal', 'Water', 'Season', 'Light', 'Houses', 'Rooms', 'Country',
  'Weather', 'Machines', 'Gods', 'Shore', 'Letters', 'Fields', 'Bridges', 'Orchard', 'Tide', 'Animals'];
const SECTIONS = ['Narrative Competition', 'Documentary Competition', 'Spotlight', 'Shorts', 'Midnight'];
const PANEL_TOPICS = ['Financing the Independent Feature', 'Documentary Ethics Now', 'Selling at Markets',
  'Writing for Small Budgets', 'Distribution After Streaming', 'Festival Strategy 101', 'Sound on a Shoestring',
  'The Producer\'s Toolkit', 'Archival Rights Explained', 'First Features, First Mistakes'];

export const FESTIVAL_DATES: Record<DayNumber, string> = {
  1: '2027-04-15', 2: '2027-04-16', 3: '2027-04-17',
};
export const DAYS: DayNumber[] = [1, 2, 3];

export const VENUES: Venue[] = [
  { id: 'v-harbor', name: 'Harbor Theater', capacity: 400, address: '12 Pier Road' },
  { id: 'v-canal', name: 'Canal Street Cinema', capacity: 180, address: '88 Canal Street' },
  { id: 'v-pier9', name: 'Pier 9 Hall', capacity: 250, address: 'Pier 9' },
  { id: 'v-river', name: 'Riverside Studio', capacity: 120, address: '3 Riverside Walk' },
];

export const TRAVEL: TravelMatrix = {
  'v-harbor': { 'v-harbor': 0, 'v-canal': 20, 'v-pier9': 10, 'v-river': 30 },
  'v-canal': { 'v-harbor': 20, 'v-canal': 0, 'v-pier9': 25, 'v-river': 15 },
  'v-pier9': { 'v-harbor': 10, 'v-canal': 25, 'v-pier9': 0, 'v-river': 35 },
  'v-river': { 'v-harbor': 30, 'v-canal': 15, 'v-pier9': 35, 'v-river': 0 },
};

const SCREEN_VENUES = ['v-harbor', 'v-canal', 'v-river'];
const SLOTS = ['10:00', '12:30', '15:00', '17:30', '20:00'];
const PANEL_SLOTS = ['11:00', '13:30', '16:00', '18:30'];

export function buildFestival(seed = 2027): Festival {
  const r = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const usedNames = new Set<string>();
  const name = () => {
    for (;;) {
      const n = `${pick(FIRST)} ${pick(LAST)}`;
      if (!usedNames.has(n)) { usedNames.add(n); return n; }
    }
  };
  const email = (n: string, i: number) => `${n.toLowerCase().replace(/[^a-z]/g, '.')}.${i}@example.test`;

  const people: Person[] = [];
  const passes: Pass[] = [];
  const addPerson = (role: PersonRole, passType: PassType, opts: {
    channels?: Channel[]; staffRole?: string; validDays?: DayNumber[];
  } = {}) => {
    const i = people.length + 1;
    const n = name();
    const p: Person = {
      id: `p-${String(i).padStart(3, '0')}`,
      name: n,
      role,
      email: email(n, i),
      channels: opts.channels ?? ['app_push', 'email'],
      staffRole: opts.staffRole,
      crowdOptIn: r() < 0.7,
    };
    people.push(p);
    passes.push({
      id: `pass-${p.id}`,
      personId: p.id,
      type: passType,
      validDays: opts.validDays ?? [...DAYS],
    });
    return p;
  };

  // --- Staff and volunteers
  const staffRoles = ['director', 'operations', 'programmer', 'programmer', 'guest_relations', 'guest_relations',
    'awards', 'comms', 'house_manager', 'house_manager'];
  for (const sr of staffRoles) addPerson('festival_staff', 'festival_staff', { staffRole: sr, channels: ['app_push', 'email', 'sms'] });

  const volunteerJobs = ['door', 'door', 'usher', 'usher', 'info_desk', 'projection', 'security', 'runner'];
  const volunteers: Person[] = [];
  for (let i = 0; i < 60; i++) {
    volunteers.push(addPerson('volunteer', 'volunteer', {
      staffRole: volunteerJobs[i % volunteerJobs.length], channels: ['volunteer_brief', 'app_push', 'sms'],
    }));
  }

  // --- Guests: 10 featured filmmakers + 5 panelists/speakers = 15
  const filmmakers: Person[] = [];
  for (let i = 0; i < 10; i++) filmmakers.push(addPerson('guest', 'featured_filmmaker', { channels: ['email', 'sms', 'app_push'] }));
  const panelists: Person[] = [];
  for (let i = 0; i < 5; i++) panelists.push(addPerson('guest', 'panelist', { channels: ['email', 'sms'] }));
  const guests = [...filmmakers, ...panelists];

  // --- Audience, industry, press
  const audiencePlan: [PassType, number, PersonRole][] = [
    ['three_day', 20, 'attendee'], ['day_pass', 18, 'attendee'], ['single_ticket', 15, 'attendee'],
    ['vip', 6, 'attendee'], ['industry', 10, 'industry'], ['press', 8, 'press'],
  ];
  const audience: Person[] = [];
  for (const [type, count, role] of audiencePlan) {
    for (let i = 0; i < count; i++) {
      const validDays: DayNumber[] = type === 'day_pass' ? [DAYS[i % 3]] : [...DAYS];
      audience.push(addPerson(role, type, { validDays, channels: r() < 0.3 ? ['email'] : ['app_push', 'email'] }));
    }
  }

  // --- Films
  const films: Film[] = [];
  const usedTitles = new Set<string>();
  for (let i = 0; i < 40; i++) {
    let title: string;
    do { title = `${pick(TITLE_A)} ${pick(TITLE_B)}`; } while (usedTitles.has(title));
    usedTitles.add(title);
    const fm = i < 10 ? filmmakers[i] : undefined;
    films.push({
      id: `f-${String(i + 1).padStart(2, '0')}`,
      title,
      director: fm ? fm.name : name(),
      runtimeMin: 75 + Math.floor(r() * 36),
      section: SECTIONS[i % SECTIONS.length],
      filmmakerIds: fm ? [fm.id] : [],
    });
  }

  // --- Screenings (+ Q&A after films with a featured filmmaker)
  const events: FestivalEvent[] = [];
  let ev = 0;
  const eid = () => `e-${String(++ev).padStart(3, '0')}`;
  const slots: { day: DayNumber; venueId: string; time: string }[] = [];
  for (const day of DAYS) for (const time of SLOTS) for (const venueId of SCREEN_VENUES) slots.push({ day, venueId, time });
  // 45 slots for 40 films: interleave so the filmmaker films land on different days and times.
  const order = slots.map((s, i) => ({ s, k: (i * 17) % slots.length })).sort((a, b) => a.k - b.k).map(x => x.s);
  films.forEach((film, i) => {
    const { day, venueId, time } = order[i];
    const start = `${FESTIVAL_DATES[day]}T${time}`;
    const end = addMinutes(start, film.runtimeMin);
    events.push({
      id: eid(), kind: 'screening', title: film.title, venueId, day, start, end,
      filmId: film.id, guestIds: [...film.filmmakerIds], status: 'scheduled',
    });
    if (film.filmmakerIds.length) {
      events.push({
        id: eid(), kind: 'qa', title: `Q&A: ${film.title}`, venueId, day, start: end, end: addMinutes(end, 20),
        filmId: film.id, guestIds: [...film.filmmakerIds], status: 'scheduled',
      });
    }
  });

  // --- Press screenings: one per day, press only, at Riverside 9:00 (repeat of a competition film)
  for (const day of DAYS) {
    const film = films[day * 3];
    const start = `${FESTIVAL_DATES[day]}T08:00`;
    events.push({
      id: eid(), kind: 'screening', title: `Press screening: ${film.title}`, venueId: 'v-river', day, start,
      end: addMinutes(start, film.runtimeMin), filmId: film.id, guestIds: [], restriction: 'press_only', status: 'scheduled',
    });
  }

  // --- 10 panels at Pier 9, guests assigned without clashes (counting travel)
  const busy = (guestId: string) => events.filter(e => e.guestIds.includes(guestId) && e.status === 'scheduled');
  const fits = (guestId: string, venueId: string, start: string, end: string) =>
    busy(guestId).every(e => {
      const gap = TRAVEL[e.venueId][venueId];
      return !overlaps(addMinutes(e.start, -gap), addMinutes(e.end, gap), start, end);
    });
  let panelIdx = 0;
  const panelSlots: { day: DayNumber; time: string }[] = [];
  for (const day of DAYS) for (const time of PANEL_SLOTS) panelSlots.push({ day, time });
  for (const { day, time } of panelSlots) {
    if (panelIdx >= 10) break;
    const start = `${FESTIVAL_DATES[day]}T${time}`;
    const end = addMinutes(start, 60);
    const pool = [...panelists, ...filmmakers];
    const chosen: string[] = [];
    // Rotate the starting point so load spreads across guests.
    for (let k = 0; k < pool.length && chosen.length < 3; k++) {
      const g = pool[(panelIdx * 2 + k) % pool.length];
      if (fits(g.id, 'v-pier9', start, end)) chosen.push(g.id);
    }
    events.push({
      id: eid(), kind: 'panel', title: PANEL_TOPICS[panelIdx], venueId: 'v-pier9', day, start, end,
      guestIds: chosen, status: 'scheduled',
    });
    panelIdx++;
  }

  // --- Markets (industry only) and VIP receptions
  for (const day of DAYS) {
    events.push({
      id: eid(), kind: 'market', title: `Industry Market, Day ${day}`, venueId: 'v-pier9', day,
      start: `${FESTIVAL_DATES[day]}T09:00`, end: `${FESTIVAL_DATES[day]}T10:45`, guestIds: [],
      restriction: 'industry_only', status: 'scheduled',
    });
    events.push({
      id: eid(), kind: 'activity', title: `Filmmaker Reception, Day ${day}`, venueId: 'v-pier9', day,
      start: `${FESTIVAL_DATES[day]}T20:00`, end: `${FESTIVAL_DATES[day]}T22:00`, guestIds: [],
      restriction: 'vip_only', status: 'scheduled',
    });
  }
  events.sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || a.id.localeCompare(b.id));

  // --- Extra tickets: single-ticket holders get one screening; some pass holders buy an extra
  const tickets: Ticket[] = [];
  const screenings = events.filter(e => e.kind === 'screening' && !e.restriction);
  let t = 0;
  for (const p of audience) {
    const pass = passes.find(x => x.personId === p.id)!;
    if (pass.type === 'single_ticket' || (pass.type === 'day_pass' && r() < 0.4)) {
      const candidates = pass.type === 'day_pass'
        ? screenings.filter(e => !pass.validDays.includes(e.day))
        : screenings;
      tickets.push({ id: `t-${String(++t).padStart(3, '0')}`, personId: p.id, eventId: pick(candidates).id });
    }
  }

  // --- Itineraries: audience members save events their pass or tickets cover
  const bookings: { personId: string; eventId: string }[] = [];
  for (const p of audience) {
    for (const tk of tickets.filter(x => x.personId === p.id)) bookings.push({ personId: p.id, eventId: tk.eventId });
    const pass = passes.find(x => x.personId === p.id)!;
    if (pass.type === 'single_ticket') continue;
    const n = 3 + Math.floor(r() * 4);
    const pool = events.filter(e => pass.validDays.includes(e.day) && (e.kind === 'screening' || e.kind === 'panel') && !e.restriction
      && (e.kind !== 'panel' || pass.type !== 'day_pass'));
    for (let k = 0; k < n; k++) {
      const e = pick(pool);
      if (!bookings.some(b => b.personId === p.id && b.eventId === e.id)) bookings.push({ personId: p.id, eventId: e.id });
    }
  }

  // --- Volunteer shifts: each volunteer works one shift per day at a venue
  const shifts: Shift[] = [];
  let sh = 0;
  volunteers.forEach((v, i) => {
    for (const day of DAYS) {
      const venue = VENUES[(i + day) % VENUES.length];
      const early = Math.floor(i / VENUES.length) % 2 === (day % 2);
      const start = `${FESTIVAL_DATES[day]}T${early ? '08:30' : '15:30'}`;
      shifts.push({
        id: `s-${String(++sh).padStart(3, '0')}`, personId: v.id, venueId: venue.id, day,
        start, end: addMinutes(start, 7 * 60), task: v.staffRole ?? 'general',
      });
    }
  });

  return {
    name: 'Harbor Lights Film Festival',
    dates: FESTIVAL_DATES,
    venues: VENUES,
    travel: TRAVEL,
    films,
    events,
    people,
    passes,
    tickets,
    shifts,
    bookings,
    checkIns: [],
    docs: OFFICIAL_DOCS as OfficialDoc[],
  };
}
