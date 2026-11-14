// Writes the mock festival as a festival's *own* exports (their column names,
// names instead of IDs, 12-hour times), for the onboarding demo:
//   npx tsx scripts/make-samples.ts            → public/samples/*.csv
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildFestival } from '../src/data/seed';
import { PASS_LABELS } from '../src/rules/access';

const f = buildFestival();
const out = 'public/samples';
mkdirSync(out, { recursive: true });

const q = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const write = (name: string, rows: (string | number)[][]) => writeFileSync(`${out}/${name}`, rows.map(r => r.map(q).join(',')).join('\n') + '\n');

const t12 = (iso: string) => {
  const h = Number(iso.slice(11, 13)), m = iso.slice(14, 16);
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};
const dateLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const venue = (id: string) => f.venues.find(v => v.id === id)!.name;
const person = (id: string) => f.people.find(p => p.id === id)!;
const phone = (i: number) => `+1 212 555 ${String(1000 + i).slice(-4)}`;

write('program.csv', [
  ['Session Code', 'Event', 'Date', 'Showtime', 'Ends', 'Theatre', 'Category', 'In-Person Guests', 'Admission', 'Status'],
  ...f.events.map(e => [e.id.replace('e-', 'S'), e.title, dateLabel(e.start), t12(e.start), t12(e.end), venue(e.venueId),
    e.kind === 'qa' ? 'Q&A' : e.kind[0].toUpperCase() + e.kind.slice(1), e.guestIds.map(g => person(g).name).join('; '),
    e.restriction ? e.restriction.replace('_only', ' only').replace(/^./, c => c.toUpperCase()) : 'Public', e.status === 'cancelled' ? 'Cancelled' : 'Confirmed']),
]);
write('theatres.csv', [['Theatre', 'Seats', 'Street Address'], ...f.venues.map(v => [v.name, v.capacity, v.address])]);
write('walking-times.csv', [['From / To', ...f.venues.map(v => v.name)], ...f.venues.map(a => [a.name, ...f.venues.map(b => f.travel[a.id][b.id])])]);
write('film-catalog.csv', [['Film Title', 'Directed By', 'Running Time', 'Program Section'], ...f.films.map(x => [x.title, x.director, `${x.runtimeMin} min`, x.section])]);
write('registrations.csv', [
  ['First Name', 'Last Name', 'Email Address', 'Mobile', 'Badge Type', 'Department'],
  ...f.people.map((p, i) => {
    const pass = f.passes.find(x => x.personId === p.id)!;
    const [first, ...rest] = p.name.split(' ');
    return [first, rest.join(' '), p.email, p.channels.includes('sms') ? phone(i) : '', PASS_LABELS[pass.type], p.staffRole ?? ''];
  }),
]);
write('ticket-orders.csv', [['Order #', 'Purchaser Email', 'Session Code'], ...f.tickets.map((t, i) => [`ORD-${5000 + i}`, person(t.personId).email, t.eventId.replace('e-', 'S')])]);
write('my-schedule-saves.csv', [['User Email', 'Session Code'], ...f.bookings.map(b => [person(b.personId).email, b.eventId.replace('e-', 'S')])]);
write('volunteer-rota.csv', [['Volunteer', 'Post', 'Shift Date', 'From', 'To', 'Duty'],
  ...f.shifts.map(s => [person(s.personId).email, venue(s.venueId), dateLabel(s.start), t12(s.start), t12(s.end), s.task])]);
write('faq-and-policies.csv', [['Document', 'Question', 'Answer'], ...f.docs.flatMap(d => d.sections.map(s => [d.title, s.heading, s.body]))]);
console.log(`Wrote samples to ${out}/`);
