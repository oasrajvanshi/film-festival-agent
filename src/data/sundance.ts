// The live demo festival: the Sundance Film Festival 2027, its first edition in
// Boulder, Colorado (11 days). Dates, venues, addresses, seats, the shuttle,
// programme sections and screening rhythm follow the public plans collected in
// src/data/sundance2027.ts (sources in data/sundance-2027/README.md).
//
// Everything about people is made up: attendees, guests, volunteers, staff,
// film titles and directors (the 2027 line-up is not public yet). Deterministic:
// the same seed always builds the same festival.

import { roster } from '../agent/presence';
import type {
  Arrival, Channel, DayNumber, Festival, FestivalEvent, Film, OfficialDoc, Pass, PassType,
  Person, PersonRole, Shift, Ticket, TravelMatrix,
} from '../core/types';
import { addMinutes, overlaps, toMinutes } from '../core/time';
import {
  DATES, DAY_SHAPE, FESTIVAL_NAME, SECTIONS, SUNDANCE_DOCS, SCENARIOS, TALKS, VENUES, travelMatrix, type SundanceVenue,
} from './sundance2027';

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

// Invented names, broad on purpose. No real people.
const FIRST = ['Ada', 'Amara', 'Anouk', 'Bram', 'Callum', 'Cleo', 'Dalia', 'Dev', 'Eamon', 'Elif', 'Esme', 'Femi', 'Freya', 'Gael', 'Greta',
  'Hana', 'Hiro', 'Ines', 'Iris', 'Jonah', 'Joaquin', 'Kaia', 'Kofi', 'Lena', 'Luca', 'Maren', 'Mateo', 'Mira', 'Nadia', 'Nico', 'Noor',
  'Oona', 'Omar', 'Paloma', 'Priya', 'Quinn', 'Rafa', 'Rosa', 'Rune', 'Sami', 'Saoirse', 'Selin', 'Tariq', 'Tova', 'Uma', 'Uri', 'Vera',
  'Wren', 'Xavi', 'Yara', 'Yusuf', 'Zane', 'Zuri', 'Ayla', 'Bodhi', 'Celeste', 'Dario', 'Elan', 'Farah', 'Idris'];
const LAST = ['Abara', 'Achterberg', 'Bellweather', 'Brennick', 'Castell', 'Chaudhry', 'Delacroix', 'Dunmore', 'Eskew', 'Farrow', 'Fenwick',
  'Galloway', 'Haddad', 'Hollis', 'Ibarra', 'Ivers', 'Jessop', 'Kaplan', 'Kettering', 'Lindqvist', 'Lowry', 'Marchetti', 'Mbeki', 'Nakamura',
  'Navarro', 'Okafor', 'Oyelaran', 'Pell', 'Petrakis', 'Quarles', 'Rahimi', 'Rourke', 'Sandoval', 'Sato', 'Szabo', 'Thibault', 'Toivonen',
  'Ulloa', 'Valdez', 'Vance', 'Whitlock', 'Wojcik', 'Yamada', 'Yoon', 'Zielinski', 'Achebe', 'Brightwater', 'Coronado', 'Dahl', 'Ekwueme'];

// Invented film titles in the register of a Sundance line-up.
const TITLES = [
  'The Weight of Snow', 'Saltwater Hymns', 'Everything Under the Pines', 'A House on Arapahoe', 'Mother Tongue, Father Land', 'Low Sun',
  'The Long Quiet', 'Our Lady of the Interstate', 'Night Swimmers', 'Copper Valley', 'What the River Took', 'Small Hours',
  'The Understudies', 'Ghost Ranch Radio', 'Bright Fever', 'Every Kind of Weather', 'The Last Video Store in Laramie', 'Paper Lanterns',
  'Dogs of the Mesa', 'Holy Water, Hard Water', 'In the Year of the Locust', 'Field Notes for a Flood', 'Second Shift', 'The Glass Coast',
  'Borrowed Light', 'How to Leave Tulsa', 'Cardinal', 'The Inheritance Machine', 'Sister Moon Motel', 'Wildfire Season',
  'Kingdom of Small Things', 'The Tallest Man in Oaxaca', 'Signal Fire', 'Unmarked', 'Blue Hour Bakery', 'A Year Without Winter',
  'The Orchard Keepers', 'Dear Tomorrow', 'Ironwood', 'Here Lies Margo', 'Soft Animals', 'The Ferryman’s Daughter', 'Afterglow Drive',
  'Common Ground', 'Northbound', 'The Choir Boys of Gary', 'Seven Ways to Disappear', 'Thin Ice', 'All the Rooms We Lived In',
  'The Body Electric', 'Rust Belt Requiem', 'Lullaby for a Drone', 'Heirloom', 'Smoke and Mirrors and Smoke', 'The Cartographer',
  'Good Neighbors', 'Paradise, Nevada', 'Leaving Mesa Verde', 'The Hum', 'Night Shift at the Diner', 'Shadow Country', 'Salt Flats',
  'Undertow', 'A Map of Nowhere', 'The Bees of Brooklyn', 'Visiting Hours', 'Under the Same Moon Again', 'Desert Bloom', 'Little Fires Inside',
  'Static', 'The Return of Rosa Ruiz', 'Tidewater', 'Hollow Mountain', 'Where the Antelope Sleep', 'Two Suns', 'Vigil',
  'The Midnight Projectionist', 'Last Call at the Blue Moon', 'Teeth', 'Feral', 'Bone Orchard', 'Howl at Nothing', 'Dead Air',
];

export function buildSundance(seed = 2027): Festival {
  const r = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const days = Object.keys(DATES).map(Number) as DayNumber[];
  const usedNames = new Set<string>([SCENARIOS.producer.name, SCENARIOS.producer.backup, SCENARIOS.organizer, ...SCENARIOS.demoPeople]);
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
    channels?: Channel[]; staffRole?: string; validDays?: DayNumber[]; name?: string; extra?: Partial<Person>;
  } = {}) => {
    const i = people.length + 1;
    const n = opts.name ?? name();
    const p: Person = {
      id: `p-${String(i).padStart(3, '0')}`, name: n, role, email: email(n, i),
      channels: opts.channels ?? ['app_push', 'email'], staffRole: opts.staffRole, crowdOptIn: r() < 0.7, ...opts.extra,
    };
    people.push(p);
    passes.push({ id: `pass-${p.id}`, personId: p.id, type: passType, validDays: opts.validDays ?? [...days] });
    return p;
  };

  // ---------------------------------------------------------------- staff
  const staffRoles = ['director', 'operations', 'operations', 'programmer', 'programmer', 'programmer', 'transport_operations',
    'guest_relations', 'guest_relations', 'press_office', 'industry_office', 'house_manager', 'house_manager', 'house_manager', 'accessibility'];
  // The first is the manager who runs the demo's organizer view.
  staffRoles.forEach((sr, i) => addPerson('festival_staff', 'festival_staff', { name: i === 0 ? SCENARIOS.organizer : undefined, staffRole: sr, channels: ['app_push', 'email', 'sms'] }));

  // ---------------------------------------------------------------- volunteers (a sample of the real corps)
  const jobs = ['door', 'door', 'usher', 'usher', 'line_management', 'info_desk', 'shuttle_stop', 'theatre_ops', 'runner', 'box_office'];
  const skillsPool = ['Spanish', 'ASL', 'first aid', 'projection', 'wheelchair assistance', 'Mandarin', 'French', 'driving'];
  const volunteers: Person[] = [];
  for (let i = 0; i < 84; i++) {
    const first = i === 0 ? SCENARIOS.demoPeople[1] : undefined; // the demo's staff member, a door volunteer
    // Most volunteers work 6 to 8 of the 11 days.
    const start = Math.floor(r() * 4) + 1;
    const span = 6 + Math.floor(r() * 3);
    const avail = days.filter(d => d >= start && d < start + span);
    volunteers.push(addPerson('volunteer', 'volunteer', {
      name: first, staffRole: jobs[i % jobs.length], channels: ['volunteer_brief', 'app_push', 'sms'],
      extra: { skills: r() < 0.45 ? [pick(skillsPool)] : [], availableDays: i === 0 ? [...days] : avail },
    }));
  }

  // ---------------------------------------------------------------- films, with their teams as guests
  const films: Film[] = [];
  const filmmakers: Person[] = [];
  let titleIdx = 0;
  const titles = [...TITLES].sort(() => r() - 0.5);
  for (const sec of SECTIONS) {
    for (let k = 0; k < sec.count; k++) {
      const id = `f-${String(films.length + 1).padStart(2, '0')}`;
      const isDemo = sec.name === SCENARIOS.producer.section && k === 0;
      const real = sec.titles?.[k];
      const title = real ? real.title : isDemo ? SCENARIOS.producer.film : titles[titleIdx++ % titles.length];
      const director = real ? real.director : name();
      const team: Person[] = [];
      // Most premieres bring the director; the demo film also brings its two producers.
      if (isDemo) {
        team.push(addPerson('guest', 'featured_filmmaker', { name: SCENARIOS.producer.name, channels: ['email', 'sms', 'app_push'],
          extra: { staffRole: 'producer', travelNote: SCENARIOS.producer.flight, arrives: SCENARIOS.producer.arrives } }));
        team.push(addPerson('guest', 'featured_filmmaker', { name: SCENARIOS.producer.backup, channels: ['email', 'sms', 'app_push'],
          extra: { staffRole: 'producer', arrives: `${DATES[1]}T13:20`, travelNote: 'Lands DEN Thu 1:20 pm' } }));
      }
      if (!real && (r() < sec.guestShare || isDemo)) {
        const d = addPerson('guest', 'featured_filmmaker', { name: director, channels: ['email', 'sms', 'app_push'], extra: { staffRole: 'director' } });
        usedNames.add(director);
        team.push(d);
      }
      filmmakers.push(...team);
      films.push({
        id, title: title.replace(/’/g, "'"), director, section: sec.name,
        runtimeMin: real ? real.runtime : sec.runtime[0] + Math.floor(r() * (sec.runtime[1] - sec.runtime[0] + 1)),
        filmmakerIds: team.map(p => p.id),
      });
    }
  }
  const demoFilm = films.find(f => f.title === SCENARIOS.producer.film)!;
  const producer = people.find(p => p.name === SCENARIOS.producer.name)!;
  const coProducer = people.find(p => p.name === SCENARIOS.producer.backup)!;

  // Panelists and moderators for the talks.
  const speakers: Person[] = [];
  for (let i = 0; i < 14; i++) speakers.push(addPerson('guest', 'panelist', { channels: ['email', 'sms'], extra: { staffRole: i < 4 ? 'moderator' : 'panelist' } }));

  // ---------------------------------------------------------------- audience, industry, press
  const audiencePlan: [PassType, number, PersonRole][] = [
    ['three_day', 46, 'attendee'], ['day_pass', 44, 'attendee'], ['single_ticket', 30, 'attendee'],
    ['vip', 12, 'attendee'], ['industry', 32, 'industry'], ['press', 26, 'press'],
  ];
  const audience: Person[] = [];
  for (const [type, count, role] of audiencePlan) {
    for (let i = 0; i < count; i++) {
      const isMira = type === 'three_day' && i === 0;
      const validDays: DayNumber[] = type === 'day_pass' ? [days[(i * 3) % days.length]] : [...days];
      audience.push(addPerson(role, type, { name: isMira ? SCENARIOS.demoPeople[0] : undefined, validDays, channels: isMira || r() >= 0.3 ? ['app_push', 'email'] : ['email'] }));
    }
  }

  // ---------------------------------------------------------------- the programme
  const travel: TravelMatrix = travelMatrix();
  const events: FestivalEvent[] = [];
  let ev = 0;
  const eid = () => `e-${String(++ev).padStart(3, '0')}`;
  const at = (day: DayNumber, hm: string) => `${DATES[day]}T${hm}`;
  const venue = (id: string) => VENUES.find(v => v.id === id)!;
  const taken = new Map<string, [number, number][]>(); // venueId|day → busy minute ranges
  const free = (venueId: string, start: string, end: string) =>
    !(taken.get(`${venueId}|${start.slice(0, 10)}`) ?? []).some(([a, b]) => toMinutes(start) < b && a < toMinutes(end));
  const hold = (venueId: string, start: string, end: string) => {
    const k = `${venueId}|${start.slice(0, 10)}`;
    taken.set(k, [...(taken.get(k) ?? []), [toMinutes(start), toMinutes(addMinutes(end, 15))]]);
  };
  const seatsFor = (v: SundanceVenue, premiere: boolean, room?: string) => {
    const cap = room ? v.rooms?.find(x => x.name === room)?.capacity ?? v.capacity : v.capacity;
    const held = Math.round(cap * (premiere ? 0.12 : 0.05));
    const sold = Math.min(cap - held, Math.round(cap * (premiere ? 0.86 + r() * 0.13 : 0.55 + r() * 0.4)));
    return { seatsSold: sold, seatsHeld: held };
  };
  const addScreening = (film: Film, v: SundanceVenue, day: DayNumber, hm: string, premiere: boolean, opts: { title?: string; restriction?: FestivalEvent['restriction']; qa?: boolean } = {}) => {
    const start = at(day, hm);
    const end = addMinutes(start, film.runtimeMin);
    const withQa = opts.qa ?? (premiere && film.filmmakerIds.length > 0);
    const blockEnd = withQa ? addMinutes(end, 25) : end;
    if (toMinutes(blockEnd) > toMinutes(at(day, '23:55'))) return false;
    if (!free(v.id, start, blockEnd)) return false;
    hold(v.id, start, blockEnd);
    const room = v.rooms?.[0]?.name;
    events.push({
      id: eid(), kind: 'screening', title: opts.title ?? film.title, venueId: v.id, day, start, end, filmId: film.id,
      guestIds: withQa ? [...film.filmmakerIds] : [], status: 'scheduled', room, restriction: opts.restriction,
      ...(opts.restriction ? {} : seatsFor(v, premiere, room)),
    });
    if (withQa) {
      events.push({ id: eid(), kind: 'qa', title: `Q&A: ${film.title}`, venueId: v.id, day, start: end, end: blockEnd, filmId: film.id, guestIds: [...film.filmmakerIds], status: 'scheduled', room });
    }
    return true;
  };

  const screens = VENUES.filter(v => v.role === 'screen');
  const slotsOf = (v: SundanceVenue, day: DayNumber) => (v.slots ?? []).filter(hm => {
    const shape = DAY_SHAPE[day];
    return hm >= shape.first && hm <= shape.last;
  });

  // 1. The demo's anchor: the producer's film premieres on her day at the flagship house, with a Q&A.
  const flagship = venue(SCENARIOS.producer.venue);
  addScreening(demoFilm, flagship, SCENARIOS.producer.day as DayNumber, SCENARIOS.producer.premiereAt, true);

  // 2. Premieres: every film once, in its section's houses, spread over the first six days (most on the first weekend).
  const premiereDay = new Map<string, DayNumber>([[demoFilm.id, SCENARIOS.producer.day as DayNumber]]);
  // World premieres run Jan 21–26 (days 1 to 6), busiest on the first weekend.
  const dayWeights: [DayNumber, number][] = [[1, 0.1], [2, 0.21], [3, 0.22], [4, 0.2], [5, 0.15], [6, 0.12]];
  const drawDay = () => { let x = r(); for (const [d, w] of dayWeights) { if ((x -= w) <= 0) return d; } return 3 as DayNumber; };
  for (const film of films) {
    if (premiereDay.has(film.id)) continue;
    const sec = SECTIONS.find(s => s.name === film.section)!;
    let placed = false;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      const day = sec.days ? (sec.days[0] + Math.floor(r() * (sec.days[1] - sec.days[0] + 1))) as DayNumber
        : attempt < 30 ? drawDay() : ((attempt % 6) + 1) as DayNumber;
      const houses = sec.houses.map(venue).filter(v => v.role === 'screen');
      const v = pick(houses);
      const slots = slotsOf(v, day).filter(hm => !sec.slot || sec.slot.includes(hm));
      if (!slots.length) continue;
      placed = addScreening(film, v, day, pick(slots), true);
      if (placed) premiereDay.set(film.id, day);
    }
  }

  // 3. Repeat screenings: three more for each film on later days, in any house that fits.
  for (const film of films) {
    const d0 = premiereDay.get(film.id) ?? 1;
    const sec = SECTIONS.find(s => s.name === film.section)!;
    let made = 0;
    const lastDay = sec.days ? sec.days[1] : 11; // encores run Jan 22–31
    for (let attempt = 0; attempt < 80 && made < sec.repeats; attempt++) {
      const day = Math.min(lastDay, d0 + 1 + Math.floor(r() * 9)) as DayNumber;
      if (events.some(e => e.filmId === film.id && e.day === day)) continue;
      const v = pick([...sec.houses.map(venue), ...screens].filter(x => x.role === 'screen'));
      const slots = slotsOf(v, day).filter(hm => !sec.slot || sec.slot.includes(hm));
      if (!slots.length) continue;
      // The second screening keeps a Q&A when the team is still in town.
      if (sec.days && day < sec.days[0]) continue;
      if (addScreening(film, v, day, pick(slots), false, { qa: made === 0 && film.filmmakerIds.length > 0 && r() < 0.6 })) made++;
    }
  }

  // 4. Press & industry screenings, mornings, of films that premiered the day before.
  const pi = VENUES.find(v => v.role === 'screen' && v.pressIndustry);
  if (pi) {
    for (const day of days.filter(d => d >= 2 && d <= 9)) {
      const yesterday = films.filter(f => premiereDay.get(f.id) === day - 1 && f.section !== 'Legacy');
      for (const hm of pi.piSlots ?? []) {
        const film = yesterday.find(f => !events.some(e => e.filmId === f.id && e.restriction === 'press_only'));
        if (film) addScreening(film, pi, day as DayNumber, hm, false, { title: `P&I: ${film.title}`, restriction: 'press_only', qa: false });
      }
    }
  }

  // 5. Award-winner screenings, Sat Jan 30 and Sun Jan 31: four a day.
  const winners = films.filter(f => f.section.includes('Competition') || f.section === 'NEXT').filter((_, i) => i % 7 === 2).slice(0, 8);
  winners.forEach((film, i) => {
    const day = (i < 4 ? 10 : 11) as DayNumber;
    const v = venue(['v-macky', 'v-boulder-theater', 'v-roe-green', 'v-etown'][i % 4]);
    for (const hm of slotsOf(v, day)) if (addScreening(film, v, day, hm, false, { title: `Award winner: ${film.title}`, qa: false })) break;
  });

  // 6. Talks at the hub: the demo producer's talk first, then two or three a day, guests without clashes.
  const busy = (gid: string) => events.filter(e => e.guestIds.includes(gid) && e.status === 'scheduled');
  const fits = (gid: string, venueId: string, start: string, end: string) => busy(gid).every(e => {
    const gap = travel[e.venueId]?.[venueId] ?? 20;
    return !overlaps(addMinutes(e.start, -gap), addMinutes(e.end, gap), start, end);
  });
  const hub = VENUES.filter(v => v.role === 'hub');
  {
    const t = TALKS[0];
    const v = venue(SCENARIOS.producer.talkVenue);
    const start = at(SCENARIOS.producer.day as DayNumber, SCENARIOS.producer.talkAt);
    const end = addMinutes(start, 60);
    hold(v.id, start, end);
    events.push({ id: eid(), kind: 'panel', title: t, venueId: v.id, day: SCENARIOS.producer.day as DayNumber, start, end,
      guestIds: [speakers[0].id, producer.id, speakers[5].id], status: 'scheduled', room: v.rooms?.[0]?.name });
  }
  let ti = 1;
  for (const day of days.filter(d => d >= 2 && d <= 9)) {
    for (const hm of ['11:00', '14:00', '16:30']) {
      if (ti >= TALKS.length) break;
      if (day === SCENARIOS.producer.day && hm === SCENARIOS.producer.talkAt) continue;
      const v = hub[ti % hub.length];
      const start = at(day, hm);
      const end = addMinutes(start, 60);
      if (!free(v.id, start, end)) continue;
      const pool = [...speakers, ...filmmakers.filter(p => p.id !== producer.id && p.id !== coProducer.id && events.some(e => e.day === day && e.guestIds.includes(p.id)))];
      const chosen: string[] = [];
      const mod = speakers[ti % 4];
      if (fits(mod.id, v.id, start, end)) chosen.push(mod.id);
      for (let k = 0; k < pool.length && chosen.length < 3; k++) {
        const g = pool[(ti * 3 + k) % pool.length];
        if (!chosen.includes(g.id) && fits(g.id, v.id, start, end)) chosen.push(g.id);
      }
      hold(v.id, start, end);
      events.push({ id: eid(), kind: 'panel', title: TALKS[ti], venueId: v.id, day, start, end, guestIds: chosen, status: 'scheduled', room: v.rooms?.[0]?.name });
      ti++;
    }
  }

  // 7. Industry office hours (industry badges) and the invitation-only evenings.
  const industry = VENUES.find(v => v.role === 'industry') ?? hub[0];
  for (const day of days.filter(d => d >= 2 && d <= 9)) {
    events.push({ id: eid(), kind: 'market', title: 'Industry office hours', venueId: industry.id, day, start: at(day, '09:30'), end: at(day, '11:00'),
      guestIds: [], restriction: 'industry_only', status: 'scheduled' });
  }
  // Awards night, Fri Jan 29 (venue not announced; the demo holds it at Macky and clears the house).
  {
    const day = SCENARIOS.awardsDay;
    const v = venue(SCENARIOS.awardsVenue);
    const start = at(day, '18:00'), end = at(day, '20:30');
    for (const e of events.filter(e => e.venueId === v.id && e.day === day && overlaps(e.start, e.end, start, end))) e.status = 'cancelled';
    events.push({ id: eid(), kind: 'activity', title: 'Awards night', venueId: v.id, day, start, end, guestIds: [], restriction: 'vip_only', status: 'scheduled' });
  }
  // Cancelled placeholders are not part of the plan; drop them rather than show them struck through.
  for (let i = events.length - 1; i >= 0; i--) if (events[i].status === 'cancelled') events.splice(i, 1);
  events.sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || a.id.localeCompare(b.id));

  // ---------------------------------------------------------------- tickets and saved plans
  const tickets: Ticket[] = [];
  const bookings: { personId: string; eventId: string }[] = [];
  const publicScreenings = events.filter(e => e.kind === 'screening' && !e.restriction);
  let t = 0;
  const mira = people.find(p => p.name === SCENARIOS.demoPeople[0])!;
  for (const p of audience) {
    if (p.id === mira.id) continue;
    const pass = passes.find(x => x.personId === p.id)!;
    if (pass.type === 'single_ticket' || (pass.type === 'day_pass' && r() < 0.4)) {
      const pool = pass.type === 'day_pass' ? publicScreenings.filter(e => !pass.validDays.includes(e.day)) : publicScreenings;
      const e = pick(pool);
      tickets.push({ id: `t-${String(++t).padStart(3, '0')}`, personId: p.id, eventId: e.id, type: pick(['General', 'General', 'Locals', 'Student']), price: 30 });
    }
  }
  for (const p of audience) {
    if (p.id === mira.id) continue;
    for (const tk of tickets.filter(x => x.personId === p.id)) bookings.push({ personId: p.id, eventId: tk.eventId });
    const pass = passes.find(x => x.personId === p.id)!;
    if (pass.type === 'single_ticket') continue;
    const n = pass.type === 'day_pass' ? 2 + Math.floor(r() * 3) : 5 + Math.floor(r() * 7);
    const pool = events.filter(e => pass.validDays.includes(e.day) && (e.kind === 'screening' || e.kind === 'panel') && !e.restriction
      && (e.kind !== 'panel' || pass.type !== 'day_pass'));
    for (let k = 0; k < n; k++) {
      const e = pick(pool);
      if (!bookings.some(b => b.personId === p.id && b.eventId === e.id)) bookings.push({ personId: p.id, eventId: e.id });
    }
  }
  // The demo attendee: a full Day 2 (the producer's talk and premiere) and a Day 3 that crosses the snow.
  const near = (day: DayNumber, hm: string, kinds: FestivalEvent['kind'][], not: string[] = []) => events
    .filter(e => e.day === day && kinds.includes(e.kind) && !e.restriction && !not.includes(e.venueId))
    .sort((a, b) => Math.abs(toMinutes(a.start) - toMinutes(at(day, hm))) - Math.abs(toMinutes(b.start) - toMinutes(at(day, hm))))[0];
  const d2 = SCENARIOS.producer.day as DayNumber;
  const miraPlan = [
    near(d2, '11:30', ['screening']),
    events.find(e => e.kind === 'panel' && e.guestIds.includes(producer.id)),
    events.find(e => e.kind === 'screening' && e.filmId === demoFilm.id && e.day === d2),
    near(SCENARIOS.snow.day as DayNumber, '11:30', ['screening']),
  ].filter(Boolean) as FestivalEvent[];
  const morning = miraPlan[miraPlan.length - 1];
  const afterSnow = events.filter(e => e.day === SCENARIOS.snow.day && e.kind === 'screening' && !e.restriction && e.venueId !== morning?.venueId
    && toMinutes(e.start) >= toMinutes(at(SCENARIOS.snow.day as DayNumber, '14:30')) && toMinutes(e.start) <= toMinutes(at(SCENARIOS.snow.day as DayNumber, '16:00')))[0];
  if (afterSnow) miraPlan.push(afterSnow);
  const evening = afterSnow && near(SCENARIOS.snow.day as DayNumber, '18:30', ['screening'], [afterSnow.venueId]);
  if (evening) miraPlan.push(evening);
  for (const day of [4, 6, 8] as DayNumber[]) { const e = near(day, '15:00', ['screening']); if (e) miraPlan.push(e); }
  tickets.push({ id: `t-${String(++t).padStart(3, '0')}`, personId: mira.id, eventId: miraPlan[2]?.id ?? miraPlan[0].id, type: 'General', price: 30 });
  for (const e of miraPlan) if (!bookings.some(b => b.personId === mira.id && b.eventId === e.id)) bookings.push({ personId: mira.id, eventId: e.id });

  // ---------------------------------------------------------------- volunteer shifts: one a day, on their days, where the events are
  const shifts: Shift[] = [];
  let sh = 0;
  volunteers.forEach((v, i) => {
    for (const day of v.availableDays ?? days) {
      const open = VENUES.filter(x => events.some(e => e.day === day && e.venueId === x.id));
      if (!open.length) continue;
      const place = i === 0 ? flagship : open[(i + day) % open.length];
      // The demo volunteer works the premiere evening on the producer's day, and the day shift through the snow.
      const early = i === 0 ? day !== SCENARIOS.producer.day : (i + day) % 2 === 0;
      const start = `${DATES[day]}T${early ? '08:00' : '15:30'}`;
      shifts.push({ id: `s-${String(++sh).padStart(3, '0')}`, personId: v.id, venueId: place.id, day: day as DayNumber, start, end: addMinutes(start, early ? 7.5 * 60 : 8 * 60), task: v.staffRole ?? 'general' });
    }
  });

  const festival: Festival = {
    name: FESTIVAL_NAME,
    dates: { ...DATES },
    venues: VENUES.map(({ id, name: n, capacity, address, rooms, lat, lng, area, use }) => ({ id, name: n, capacity, address, rooms, lat, lng, area, use })),
    travel,
    films, events, people, passes, tickets, shifts, bookings,
    checkIns: [],
    docs: SUNDANCE_DOCS as OfficialDoc[],
  };
  festival.arrivals = seedArrivals(festival, r);
  return festival;
}

/**
 * Door scans so far, so the demo's numbers aren't empty: almost everyone expected on
 * Day 1 was scanned in, and on the demo morning those due before about 9:30 already are.
 */
function seedArrivals(f: Festival, r: () => number): Arrival[] {
  const out: Arrival[] = [];
  const clockDay = SCENARIOS.producer.day;
  for (const day of [1, clockDay] as DayNumber[]) {
    for (const row of roster(f, day)) {
      if (row.walkIn || !row.firstAt) continue;
      if (row.name === SCENARIOS.producer.name) continue; // she never makes it
      const minsBefore = 10 + Math.floor(r() * 35);
      let at = addMinutes(row.firstAt, -minsBefore);
      if (day === clockDay) {
        if (toMinutes(row.firstAt) > toMinutes(SCENARIOS.clock) + 50) continue;
        if (toMinutes(at) > toMinutes(SCENARIOS.clock)) at = addMinutes(SCENARIOS.clock, -Math.floor(r() * 12) - 1);
      } else if (r() > 0.94) continue;
      out.push({ id: `arr-${day}-${row.id}`, personId: row.id, kind: row.kind, day, venueId: row.firstVenueId ?? f.venues[0].id, at, by: 'Door scan', reentry: false });
    }
  }
  return out;
}
