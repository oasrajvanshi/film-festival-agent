// Fixes from the new-organizer walkthrough (Nov 15): dates from the schedule,
// flags people can sort out, QR codes for any festival, and "I don't know"
// when a question only shares a common word with the handbook.
import { describe, expect, it } from 'vitest';
import { buildFestival } from '../src/data/seed';
import { FestivalAgent } from '../src/agent/agent';
import { answerQuestion, IDK } from '../src/agent/answer';
import { parseQr, qrFor } from '../src/rules/access';
import { guessKind, matchColumns, scheduleDateRange, type Upload } from '../src/onboard/mapping';

const up = (name: string, table: string[][]): Upload => {
  const { kind } = guessKind(name, table[0]);
  return { name, table, kind, columns: matchColumns(kind, table[0]) };
};

describe('festival dates from the schedule', () => {
  it('finds the first and last day in any date format', () => {
    const r = scheduleDateRange([up('screening-schedule.csv', [
      ['Title', 'Screening Date', 'Start Time', 'Location'],
      ['A', '5/21/2027', '11:00 AM', 'Hall'],
      ['B', '5/20/2027', '7:00 PM', 'Hall'],
      ['C', 'May 24, 2027', '1:00 PM', 'Hall'],
    ])]);
    expect(r).toEqual({ first: '2027-05-20', last: '2027-05-24', rows: 3 });
  });
  it('returns nothing without a schedule', () => {
    expect(scheduleDateRange([up('venues.csv', [['Venue', 'Seats'], ['Hall', '100']])])).toBeNull();
  });
});

/** The sample festival with one shift on a day its volunteer can't work, and one volunteer free to cover. */
function withGap() {
  const f = buildFestival();
  const shift = f.shifts[0];
  const v = f.people.find(p => p.id === shift.personId)!;
  v.availableDays = [((shift.day % 3) + 1) as 1 | 2 | 3];
  const free = f.people.find(p => p.role === 'volunteer' && p.id !== v.id)!;
  f.shifts = f.shifts.filter(s => !(s.personId === free.id && s.day === shift.day));
  free.availableDays = [shift.day];
  const a = new FestivalAgent(f, null, () => '2027-04-15T09:00');
  a.sweepClashes();
  return { a, shift, free, flagId: `shift-${shift.id}` };
}

describe('sorting out flags', () => {
  it('a sorted flag leaves the list and is not raised again', () => {
    const { a, flagId } = withGap();
    expect(a.flags.some(x => x.id === flagId)).toBe(true);
    a.resolveFlag(flagId, 'Ops');
    expect(a.flags.some(x => x.id === flagId)).toBe(false);
    a.sweepClashes();
    expect(a.flags.some(x => x.id === flagId)).toBe(false);
    expect(a.sorted.map(x => x.id)).toContain(flagId);
  });
  it('sweeping twice does not double a flag', () => {
    const { a } = withGap();
    const n = a.flags.length;
    a.sweepClashes();
    expect(a.flags.length).toBe(n);
  });
  it('giving a shift to a free volunteer moves the shift and tells them', () => {
    const { a, shift, free, flagId } = withGap();
    const fl = a.flags.find(x => x.id === flagId)!;
    expect((fl.payload as { cover: string[] }).cover).toContain(free.name);
    a.assignCover(flagId, free.name, 'Ops');
    expect(a.f.shifts.find(s => s.id === shift.id)!.personId).toBe(free.id);
    expect(a.outbox.some(d => d.personId === free.id)).toBe(true);
    expect(a.flags.some(x => x.id === flagId)).toBe(false);
  });
  it('restores older saves without a sorted list', () => {
    const { a } = withGap();
    const snap = a.snapshot() as Partial<ReturnType<FestivalAgent['snapshot']>>;
    delete snap.sorted;
    const b = FestivalAgent.restore(snap as ReturnType<FestivalAgent['snapshot']>, null, () => '2027-04-15T09:00');
    expect(b.sorted).toEqual([]);
  });
});

describe('QR codes', () => {
  it('work for any person id and keep scanning old codes', () => {
    expect(parseQr(qrFor('p-1204'))).toBe('p-1204');
    expect(parseQr(qrFor('badge_77'))).toBe('badge_77');
    expect(qrFor('p-001').startsWith('USH1.')).toBe(true);
    expect(parseQr(qrFor('p-001').replace('USH1', 'HLFF1'))).toBe('p-001');
  });
});

describe('Ask', () => {
  it("says I don't know when only a common word matches", async () => {
    const f = buildFestival();
    const a = await answerQuestion(f, 'Can I bring snacks into the screenings?');
    expect(a.text).toBe(IDK);
  });
});

describe('sorted flags across devices', () => {
  it('a flag sorted on one device is not brought back by a merge', async () => {
    const { mergeSnapshots } = await import('../src/server/festivals');
    const { a, flagId } = withGap();
    const stored = structuredClone(a.snapshot());
    a.resolveFlag(flagId, 'Ops');
    const merged = mergeSnapshots(stored as never, structuredClone(a.snapshot()) as never) as ReturnType<FestivalAgent['snapshot']>;
    expect(merged.flags.some(x => x.id === flagId)).toBe(false);
    expect(merged.sorted.map(x => x.id)).toContain(flagId);
  });
});
