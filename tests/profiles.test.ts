import { describe, expect, it } from 'vitest';
import { buildFestival } from '../src/data/seed';
import { deriveVendors, directory, signIn } from '../src/access/profiles';

describe('profiles and access codes', () => {
  const f = buildFestival();
  const dir = directory(f);
  it('gives everyone a unique code in one of five profiles', () => {
    expect(new Set(dir.map(d => d.code)).size).toBe(dir.length);
    expect(new Set(dir.map(d => d.kind))).toEqual(new Set(['organizer', 'staff', 'guest', 'attendee', 'vendor']));
    expect(dir.filter(d => d.kind === 'organizer').length).toBeGreaterThan(0);
  });
  it('accepts a code only for its own profile', () => {
    const a = dir.find(d => d.kind === 'attendee')!;
    expect(signIn(f, 'attendee', a.code.toLowerCase())?.id).toBe(a.id);
    expect(signIn(f, 'attendee', a.code.replace('-', ' '))?.id).toBe(a.id);
    expect(signIn(f, 'organizer', a.code)).toBeNull();
    expect(signIn(f, 'attendee', 'ATT-0000')).toBeNull();
  });
  it('vendor timings follow the schedule', () => {
    const before = deriveVendors(f).find(v => v.id === 'v-av')!.deliveries[0];
    const ev = f.events.find(e => e.id === before.eventId)!;
    ev.status = 'cancelled';
    const after = deriveVendors(f).find(v => v.id === 'v-av')!.deliveries.find(d => d.id === before.id)!;
    expect(after.cancelled).toBe(true);
  });
});
