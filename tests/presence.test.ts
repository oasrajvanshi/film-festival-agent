import { describe, expect, it } from 'vitest';
import { FestivalAgent } from '../src/agent/agent';
import { buildFestival } from '../src/data/seed';
import { mergeSnapshots, sliceFor } from '../src/server/festivals';
import { qrFor } from '../src/rules/access';
import { directory } from '../src/access/profiles';
import { expectedOn, roster, rosterCsv } from '../src/agent/presence';

const setupDay = () => {
  const f = buildFestival();
  let now = `${f.dates[1]}T09:00`;
  const a = new FestivalAgent(f, null, () => now);
  a.sweepClashes();
  return { a, f: a.f, at: (t: string) => { now = `${f.dates[1]}T${t}`; return now; } };
};

describe('day check-in by QR', () => {
  it('builds each day\'s expected list from the schedule, passes, shifts and deliveries', () => {
    const { f } = setupDay();
    const rows = expectedOn(f, 1);
    for (const k of ['guest', 'vendor', 'staff', 'attendee'] as const) expect(rows.some(r => r.kind === k)).toBe(true);
    const guest = rows.find(r => r.kind === 'guest')!;
    expect(f.events.some(e => e.day === 1 && e.guestIds.includes(guest.id))).toBe(true);
  });

  it('records the first scan of the day as an arrival and welcomes a guest once', () => {
    const { a, f, at } = setupDay();
    const g = expectedOn(f, 1).find(r => r.kind === 'guest')!;
    const r1 = a.onArrival(qrFor(g.id), f.venues[0].id, at('09:30'), 'Tova');
    expect(r1.allowed).toBe(true);
    expect(r1.reentry).toBe(false);
    expect(f.arrivals!.filter(x => x.personId === g.id)).toHaveLength(1);
    expect(a.outbox.filter(d => d.personId === g.id && d.actionId.startsWith('arrive-'))).toHaveLength(1);
    const r2 = a.onArrival(qrFor(g.id), f.venues[1].id, at('12:00'), 'Tova');
    expect(r2.allowed && r2.reentry).toBe(true);
    expect(a.outbox.filter(d => d.personId === g.id && d.actionId.startsWith('arrive-'))).toHaveLength(1);
    expect(roster(f, 1).find(r => r.id === g.id)!.arrival!.at).toBe(`${f.dates[1]}T09:30`);
  });

  it('checks vendors in with their own QR', () => {
    const { a, f, at } = setupDay();
    const v = directory(f).find(w => w.kind === 'vendor')!;
    const r = a.onArrival(qrFor(v.id), f.venues[0].id, at('10:00'));
    expect(r.allowed).toBe(true);
    expect(r.kind).toBe('vendor');
    expect(a.outbox.some(d => d.personId === v.id)).toBe(true);
  });

  it('stops an attendee whose pass is for another day, and an unknown code', () => {
    const { a, f, at } = setupDay();
    const p = f.passes.find(x => !x.validDays.includes(1) && !f.tickets.some(t => t.personId === x.personId && f.events.find(e => e.id === t.eventId)?.day === 1))!;
    expect(p).toBeTruthy();
    expect(a.onArrival(qrFor(p.personId), f.venues[0].id, at('10:00')).allowed).toBe(false);
    expect(a.onArrival('USH1.nobody.XYZ', f.venues[0].id, at('10:00')).allowed).toBe(false);
    expect(f.arrivals ?? []).toHaveLength(0);
  });

  it('flags a guest who is on soon but not here, and clears it when they arrive', () => {
    const { a, f, at } = setupDay();
    const e = f.events.filter(x => x.day === 1 && x.status === 'scheduled' && x.guestIds.length).sort((x, y) => x.start.localeCompare(y.start))[0];
    const g = e.guestIds[0];
    // Someone else arrives early, so the doors are scanning today.
    const other = expectedOn(f, 1).find(r => r.kind === 'staff')!;
    a.onArrival(qrFor(other.id), f.venues[0].id, at('08:00'));
    expect(a.flags.some(x => x.id.startsWith(`noshow-${g}-`))).toBe(false);
    const before = e.start.slice(11, 16);
    const [h, m] = before.split(':').map(Number);
    const t = `${String(h - (m >= 30 ? 0 : 1)).padStart(2, '0')}:${String((m + 30) % 60).padStart(2, '0')}`;
    at(t);
    a.sweepPresence();
    expect(a.flags.some(x => x.id === `noshow-${g}-${e.id}`)).toBe(true);
    a.onArrival(qrFor(g), e.venueId, at(t));
    expect(a.flags.some(x => x.id === `noshow-${g}-${e.id}`)).toBe(false);
    expect(a.sorted.find(x => x.id === `noshow-${g}-${e.id}`)?.how).toMatch(/Arrived/);
  });

  it('keeps everyone else\'s arrivals off a person\'s phone, and merges arrivals from two devices', () => {
    const { a, f, at } = setupDay();
    const [g1, g2] = expectedOn(f, 1).filter(r => r.kind === 'guest');
    const base = structuredClone(a.snapshot());
    a.onArrival(qrFor(g1.id), f.venues[0].id, at('09:00'));
    const one = a.snapshot();
    const b = FestivalAgent.restore(structuredClone(base), null, () => at('09:05'));
    b.onArrival(qrFor(g2.id), f.venues[0].id, at('09:05'));
    const merged = mergeSnapshots(one, b.snapshot());
    expect(merged.f.arrivals!.map(x => x.personId).sort()).toEqual([g1.id, g2.id].sort());
    const who = directory(f).find(w => w.id === g1.id)!;
    expect(sliceFor(merged, who).f.arrivals!.map(x => x.personId)).toEqual([g1.id]);
    expect(rosterCsv(merged.f, 1).split('\n')[0]).toMatch(/^Name,Profile/);
  });
});
