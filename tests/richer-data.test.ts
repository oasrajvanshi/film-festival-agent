import { describe, expect, it } from 'vitest';
import { buildFestival } from '../src/data/seed';
import { festivalToTables, tablesToFestival } from '../src/data/sheet';
import { eventCapacity, findArrivalClashes, findOversold, findShiftGaps, findVenueClashes, seatsLeft } from '../src/agent/conflicts';
import { recommendFor } from '../src/agent/recommend';
import { buildTables, daysFrom, guessKind, isoDateTime, matchColumns, type Upload } from '../src/onboard/mapping';
import type { Festival } from '../src/core/types';

const up = (name: string, table: string[][]): Upload => {
  const { kind } = guessKind(name, table[0]);
  return { name, table, kind, columns: matchColumns(kind, table[0]) };
};

describe('rooms and seats', () => {
  it('lets two screens in one building run at once, and uses the room’s seats', () => {
    const f = buildFestival();
    const v = f.venues[0];
    v.rooms = [{ name: 'Screen 1', capacity: 300 }, { name: 'Screen 2', capacity: 100 }];
    const [a, b] = f.events.filter(e => e.venueId === v.id && e.status === 'scheduled');
    b.day = a.day; b.start = a.start; b.end = a.end;
    a.room = 'Screen 1'; b.room = 'Screen 2';
    expect(findVenueClashes(f).some(k => [k.a.id, k.b.id].includes(a.id) && [k.a.id, k.b.id].includes(b.id))).toBe(false);
    expect(eventCapacity(f, b)).toBe(100);
    b.seatsSold = 95; b.seatsHeld = 10;
    expect(seatsLeft(f, b)).toBe(-5);
    expect(findOversold(f).map(o => o.event.id)).toContain(b.id);
  });
  it('round-trips rooms, seats, arrivals, skills and ticket prices through the sheet', () => {
    const f = buildFestival();
    f.venues[0].rooms = [{ name: 'Screen 1', capacity: 250 }, { name: 'Screen 2', capacity: 150 }];
    const e = f.events.find(x => x.venueId === f.venues[0].id)!;
    e.room = 'Screen 2'; e.seatsSold = 120; e.seatsHeld = 8;
    const g = f.people.find(p => p.role === 'guest')!;
    g.arrives = `${f.dates[1]}T14:30`; g.travelNote = 'UA 512';
    const v = f.people.find(p => p.role === 'volunteer')!;
    v.skills = ['projection', 'Spanish']; v.availableDays = [1, 3];
    f.tickets[0].type = 'Student'; f.tickets[0].price = 12;
    const back = tablesToFestival(festivalToTables(f));
    expect(back.errors).toEqual([]);
    const b = back.festival!;
    expect(b.venues[0].rooms).toEqual(f.venues[0].rooms);
    expect(b.events.find(x => x.id === e.id)).toMatchObject({ room: 'Screen 2', seatsSold: 120, seatsHeld: 8 });
    expect(b.people.find(p => p.id === g.id)).toMatchObject({ arrives: g.arrives, travelNote: 'UA 512' });
    expect(b.people.find(p => p.id === v.id)).toMatchObject({ skills: ['projection', 'Spanish'], availableDays: [1, 3] });
    expect(b.tickets[0]).toMatchObject({ type: 'Student', price: 12 });
  });
});

describe('guest arrivals and volunteer availability', () => {
  it('flags a guest booked before they land', () => {
    const f = buildFestival();
    const e = f.events.find(x => x.guestIds.length && x.status === 'scheduled')!;
    const g = f.people.find(p => p.id === e.guestIds[0])!;
    g.arrives = e.start;
    expect(findArrivalClashes(f).some(k => k.guestId === g.id && k.event.id === e.id && k.reason === 'before_arrival')).toBe(true);
  });
  it('flags a shift on a day the volunteer is away and suggests who is free', () => {
    const f: Festival = buildFestival();
    const s = f.shifts[0];
    const p = f.people.find(x => x.id === s.personId)!;
    p.availableDays = [s.day === 1 ? 2 : 1];
    const other = f.people.find(x => x.role === 'volunteer' && x.id !== p.id
      && !f.shifts.some(y => y.personId === x.id && y.day === s.day && y.start < s.end && s.start < y.end))!;
    other.availableDays = [s.day];
    const gaps = findShiftGaps(f);
    expect(gaps.map(x => x.shiftId)).toContain(s.id);
    expect(gaps.find(x => x.shiftId === s.id)!.cover).toContain(other.name);
  });
});

describe('ticket types', () => {
  it('tells a ticket holder their refund when a screening is cancelled', () => {
    const f = buildFestival();
    const t = f.tickets[0];
    t.type = 'Student'; t.price = 12;
    const ev = f.events.find(e => e.id === t.eventId)!;
    const person = f.people.find(p => p.id === t.personId)!;
    const r = recommendFor(f, { eventId: ev.id, before: ev, after: { ...ev, status: 'cancelled' }, fields: ['status'] } as never, person, ['ticket']);
    expect(r.action).toContain('$12.00');
    t.type = 'Comp'; t.price = 0;
    expect(recommendFor(f, { eventId: ev.id, before: ev, after: { ...ev, status: 'cancelled' }, fields: ['status'] } as never, person, ['ticket']).action).toContain('nothing to refund');
  });
});

describe('reading these from a festival’s own files', () => {
  const dates = ['2027-05-20', '2027-05-21', '2027-05-22', '2027-05-23', '2027-05-24'];
  it('parses dates, times and day lists', () => {
    expect(isoDateTime('5/21/2027 2:30pm', '2027')).toBe('2027-05-21T14:30');
    expect(isoDateTime('May 19, 9:05 am', '2027')).toBe('2027-05-19T09:05');
    expect(daysFrom('Thu, Sat', dates)).toEqual([1, 3]);
    expect(daysFrom('5/21; 5/24', dates)).toEqual([2, 5]);
    expect(daysFrom('All', dates)).toEqual([1, 2, 3, 4, 5]);
  });
  it('builds rooms, seats, arrivals, availability and ticket types', () => {
    const r = buildTables({ name: 'T', startDate: '2027-05-20', days: 5 }, [
      up('venue-list.csv', [['Location', 'Capacity', 'Address'], ['The Marquee', '520', '1 Main St']]),
      up('screens-and-rooms.csv', [['Location', 'Screen', 'Seats'], ['The Marquee', 'Screen 1', '320'], ['The Marquee', 'Screen 2', '200']]),
      up('badge-holders.csv', [['Full Name', 'E-mail', 'Registration Type'], ['Ana Bell', 'ana@example.test', 'Filmmaker'], ['Vic Roe', 'vic@example.test', 'Volunteer'], ['Bo Ash', 'bo@example.test', 'Single Ticket']]),
      up('guest-arrivals.csv', [['Guest', 'Arrival', 'Departure', 'Flight', 'Hotel'], ['Ana Bell', '5/21/2027 3:10pm', '5/23/2027 9:00am', 'UA 512', 'The Drake']]),
      up('volunteer-availability.csv', [['Volunteer', 'Available Days', 'Skills'], ['vic@example.test', 'Thu, Fri', 'Projection; Spanish']]),
      up('screening-schedule.csv', [['Screening ID', 'Title', 'Screening Date', 'Start Time', 'Run Time', 'Location', 'Screen', 'Seats Sold', 'Seats Held', 'Special Guests'],
        ['S1', 'Film A', '5/21/2027', '2:00pm', '90 mins', 'The Marquee', 'Screen 2', '190', '15', 'Ana Bell']]),
      up('box-office-orders.csv', [['Barcode', 'Buyer', 'Screening ID', 'Ticket Type', 'Price'], ['TX1', 'bo@example.test', 'S1', 'Student', '$12.00']]),
    ]);
    expect(r.unresolved).toEqual([]);
    const res = tablesToFestival(r.tables);
    expect(res.errors).toEqual([]);
    const f = res.festival!;
    expect(f.venues[0].rooms).toEqual([{ name: 'Screen 1', capacity: 320 }, { name: 'Screen 2', capacity: 200 }]);
    expect(f.events[0]).toMatchObject({ room: 'Screen 2', seatsSold: 190, seatsHeld: 15 });
    expect(f.people[0]).toMatchObject({ arrives: '2027-05-21T15:10', departs: '2027-05-23T09:00', travelNote: 'UA 512, staying at The Drake' });
    expect(f.people[1]).toMatchObject({ skills: ['Projection', 'Spanish'], availableDays: [1, 2] });
    expect(f.tickets[0]).toMatchObject({ type: 'Student', price: 12 });
    expect(findOversold(f).length).toBe(1);
    expect(findArrivalClashes(f).length).toBe(1);
  });
});

describe('events past midnight', () => {
  it('a 11:30pm screening with a 100-minute run ends at 1:10am the next day, and survives the sheet', () => {
    const r = buildTables({ name: 'T', startDate: '2027-05-20', days: 2 }, [
      up('venue-list.csv', [['Location', 'Capacity', 'Address'], ['The Marquee', '520', '1 Main St']]),
      up('screening-schedule.csv', [['Screening ID', 'Title', 'Screening Date', 'Start Time', 'Run Time', 'Location'], ['S1', 'Midnight Movie', '5/20/2027', '11:30pm', '100 mins', 'The Marquee']]),
    ]);
    const f = tablesToFestival(r.tables).festival!;
    expect(f.events[0]).toMatchObject({ start: '2027-05-20T23:30', end: '2027-05-21T01:10' });
    const back = tablesToFestival(festivalToTables(f));
    expect(back.errors).toEqual([]);
    expect(back.festival!.events[0].end).toBe('2027-05-21T01:10');
  });
});

describe('any Google Sheet layout', () => {
  it('reads every tab of a workbook, matches them, and re-reads with the saved mapping', async () => {
    const XLSX = await import('xlsx');
    const { workbookTabs, tabsToUploads, rebuildFromTabs } = await import('../src/onboard/workbook');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Location', 'Capacity', 'Address'], ['The Marquee', 520, '1 Main St']]), 'Theatres');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Screening ID', 'Title', 'Screening Date', 'Start Time', 'Run Time', 'Location'], ['S1', 'Film A', '5/20/2027', '7:00pm', '90 mins', 'The Marquee']]), 'Program');
    const tabs = workbookTabs(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const ups = tabsToUploads(tabs);
    expect(ups.map(u => u.kind)).toEqual(['venues', 'schedule']);
    const mapping = { meta: { name: 'T', startDate: '2027-05-20', days: 2 }, tabs: ups.map(u => ({ name: u.name, kind: u.kind, columns: u.columns })) };
    const f = rebuildFromTabs(mapping, tabs).festival!;
    expect(f.events[0]).toMatchObject({ title: 'Film A', start: '2027-05-20T19:00' });
  });
});

describe('flight updates', () => {
  it('moves the guest’s arrival and flags an appearance they can no longer make', async () => {
    const { FestivalAgent } = await import('../src/agent/agent');
    const f = buildFestival();
    const e = f.events.find(x => x.guestIds.length && x.status === 'scheduled')!;
    const a = new FestivalAgent(f);
    const acts = a.onFlightUpdate(e.guestIds[0], 'UA512', e.start, 45);
    expect(f.people.find(p => p.id === e.guestIds[0])!.arrives).toBe(e.start);
    expect(acts.some(x => x.id === `arrival-${e.guestIds[0]}-${e.id}`)).toBe(true);
    expect(a.flags.some(x => x.id === `arrival-${e.guestIds[0]}-${e.id}`)).toBe(true);
  });
});
