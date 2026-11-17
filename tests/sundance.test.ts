import { describe, expect, it } from 'vitest';
import { buildSundance } from '../src/data/sundance';
import { DATES, SCENARIOS, VENUES } from '../src/data/sundance2027';
import { MAP_BOX } from '../src/data/boulder-map';
import { FestivalAgent } from '../src/agent/agent';
import { assessWeather, scenarioHours } from '../src/agent/weather';
import { toMinutes } from '../src/core/time';

const f = buildSundance();

describe('the Sundance 2027 demo festival', () => {
  it('runs every festival day in Boulder', () => {
    expect(Object.keys(f.dates).length).toBe(Object.keys(DATES).length);
    for (const d of Object.keys(f.dates).map(Number)) {
      if (d === 1) continue;
      expect(f.events.some(e => e.day === d), `day ${d} has events`).toBe(true);
    }
  });

  it('puts every venue on the map', () => {
    for (const v of f.venues) {
      expect(v.lat, v.name).toBeGreaterThan(MAP_BOX.south);
      expect(v.lat, v.name).toBeLessThan(MAP_BOX.north);
      expect(v.lng, v.name).toBeGreaterThan(MAP_BOX.west);
      expect(v.lng, v.name).toBeLessThan(MAP_BOX.east);
    }
    expect(f.venues.length).toBe(VENUES.length);
  });

  it('never double-books a room', () => {
    const live = f.events.filter(e => e.status === 'scheduled');
    for (const a of live) for (const b of live) {
      if (a.id >= b.id || a.venueId !== b.venueId || (a.room ?? '') !== (b.room ?? '') || a.day !== b.day) continue;
      if (a.kind === 'qa' && b.kind === 'screening' && a.filmId === b.filmId) continue;
      if (b.kind === 'qa' && a.kind === 'screening' && a.filmId === b.filmId) continue;
      const clash = toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
      expect(clash, `${a.title} / ${b.title} at ${a.venueId} day ${a.day}`).toBe(false);
    }
  });

  it('keeps every event within its own day', () => {
    for (const e of f.events) {
      expect(e.start.slice(0, 10)).toBe(f.dates[e.day]);
      expect(e.end.slice(0, 10)).toBe(f.dates[e.day]);
    }
  });

  it('sets up the producer who cannot make it', () => {
    const prod = f.people.find(p => p.name === SCENARIOS.producer.name)!;
    const day = SCENARIOS.producer.day;
    const hers = f.events.filter(e => e.day === day && e.guestIds.includes(prod.id));
    expect(hers.some(e => e.kind === 'panel')).toBe(true);
    expect(hers.some(e => e.kind === 'qa')).toBe(true);
    const backup = f.people.find(p => p.name === SCENARIOS.producer.backup)!;
    expect(f.events.some(e => e.day === day && e.guestIds.includes(backup.id))).toBe(true);
  });

  it('has a busy afternoon for the snow', () => {
    const risk = assessWeather(scenarioHours(f.dates[SCENARIOS.snow.day], 'snow'))[0];
    const starting = f.events.filter(e => e.day === SCENARIOS.snow.day && toMinutes(e.start) >= toMinutes(risk.from) && toMinutes(e.start) < toMinutes(risk.to));
    expect(starting.length).toBeGreaterThan(8);
  });

  it('gives the demo attendee a plan on both problem days', () => {
    const mira = f.people.find(p => p.name === SCENARIOS.demoPeople[0])!;
    const mine = f.bookings.filter(b => b.personId === mira.id).map(b => f.events.find(e => e.id === b.eventId)!);
    expect(mine.filter(e => e.day === SCENARIOS.producer.day).length).toBeGreaterThanOrEqual(3);
    expect(mine.filter(e => e.day === SCENARIOS.snow.day).length).toBeGreaterThanOrEqual(2);
  });

  it('opens calm: no clashes before the problems are brought on', () => {
    const a = new FestivalAgent(buildSundance(), null, () => SCENARIOS.clock);
    a.sweepClashes();
    expect(a.flags.map(x => x.title)).toEqual([]);
  });

  it('stays small enough to share', () => {
    const a = new FestivalAgent(buildSundance(), null, () => SCENARIOS.clock);
    expect(JSON.stringify(a.snapshot()).length).toBeLessThan(900_000);
  });
});

describe('the Sundance demo after a change', () => {
  it('flags no Q&A when films screen several times and nothing moved', async () => {
    const a = new FestivalAgent(buildSundance(), null, () => SCENARIOS.clock);
    const r = await a.onGridEdit(a.f.events.map(e => ({ ...e })), 'Test');
    expect(r.actions.filter(x => x.id.startsWith('orphan-'))).toEqual([]);
  });
});
