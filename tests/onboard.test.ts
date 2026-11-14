import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { buildTables, dayFrom, guessKind, matchColumns, normPass, type Upload } from '../src/onboard/mapping';
import { parseCsv, tablesToFestival } from '../src/data/sheet';
import { buildFestival } from '../src/data/seed';

const files = readdirSync('public/samples').filter(n => n.endsWith('.csv'));
const uploads: Upload[] = files.map(name => {
  const table = parseCsv(readFileSync(`public/samples/${name}`, 'utf8'));
  const { kind } = guessKind(name, table[0]);
  return { name, table, kind, columns: matchColumns(kind, table[0]) };
});

describe('onboarding from a festival’s own exports', () => {
  it('recognises what each file is', () => {
    const kinds = Object.fromEntries(uploads.map(u => [u.name, u.kind]));
    expect(kinds).toEqual({
      'faq-and-policies.csv': 'docs', 'film-catalog.csv': 'films', 'my-schedule-saves.csv': 'saved', 'program.csv': 'schedule',
      'registrations.csv': 'people', 'theatres.csv': 'venues', 'ticket-orders.csv': 'tickets', 'volunteer-rota.csv': 'shifts', 'walking-times.csv': 'travel',
    });
  });
  it('matches the columns', () => {
    const prog = uploads.find(u => u.name === 'program.csv')!;
    const m = Object.fromEntries(prog.columns.map(c => [c.field, c.header]));
    expect(m).toMatchObject({ title: 'Event', date: 'Date', start: 'Showtime', end: 'Ends', venue: 'Theatre', type: 'Category', guests: 'In-Person Guests', id: 'Session Code' });
  });
  it('rebuilds the same festival', () => {
    const r = buildTables({ name: 'Harbor Lights Film Festival', startDate: '2027-04-15', days: 3 }, uploads);
    expect(r.unresolved).toEqual([]);
    const res = tablesToFestival(r.tables);
    expect(res.errors).toEqual([]);
    const a = res.festival!, b = buildFestival();
    expect([a.events.length, a.films.length, a.venues.length, a.people.length, a.tickets.length, a.bookings.length, a.shifts.length])
      .toEqual([b.events.length, b.films.length, b.venues.length, b.people.length, b.tickets.length, b.bookings.length, b.shifts.length]);
    expect(a.passes.map(p => p.type).sort()).toEqual(b.passes.map(p => p.type).sort());
    expect(a.events.filter(e => e.guestIds.length).length).toBe(b.events.filter(e => e.guestIds.length).length);
  });
  it('reads dates and pass names', () => {
    expect(dayFrom('Fri, Apr 16', ['2027-04-15', '2027-04-16', '2027-04-17'])).toBe(2);
    expect(dayFrom('4/17/2027', ['2027-04-15', '2027-04-16', '2027-04-17'])).toBe(3);
    expect(dayFrom('Day 1', ['2027-04-15'])).toBe(1);
    expect(normPass('3-Day Festival Pass')).toBe('three_day');
    expect(normPass('Press badge')).toBe('press');
  });
});
