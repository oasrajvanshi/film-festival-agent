// Evaluation beyond our own scripted day: many random festivals, each with
// problems planted on purpose. Usher should find every planted problem
// (recall) and raise nothing new that the plant didn't cause (no false alarms).

import { FestivalAgent } from '../agent/agent';
import { buildFestival } from '../data/seed';
import { addMinutes, overlaps } from '../core/time';
import { eventCapacity } from '../agent/conflicts';
import type { Festival } from '../core/types';
import type { CaseResult, SuiteResult } from './scenarios';

type Plant = { kind: 'guest clash' | 'oversold' | 'not in town'; expect: RegExp; touches: string[] };

const flagIds = (f: Festival) => { const a = new FestivalAgent(structuredClone(f), null, () => `${f.dates[1]}T09:00`); a.sweepClashes(); return new Set(a.flags.map(x => x.id)); };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (id: string, ids: string[]) => ids.some(x => new RegExp(`(^|-)${esc(x)}(-|$)`).test(id));

/** Plant up to three problems in a festival. Returns what was planted. */
export function plant(f: Festival, seed: number): Plant[] {
  const out: Plant[] = [];
  const live = f.events.filter(e => e.status === 'scheduled');
  // 1. A guest booked at two places at once.
  for (const e1 of live.filter(e => e.guestIds.length).slice(seed % 5)) {
    const g = e1.guestIds[0];
    const e2 = live.find(e => e.id !== e1.id && e.venueId !== e1.venueId && !e.guestIds.includes(g) && overlaps(e.start, e.end, e1.start, e1.end));
    if (!e2) continue;
    e2.guestIds = [...e2.guestIds, g];
    out.push({ kind: 'guest clash', expect: new RegExp(`^clash-${esc(g)}-`), touches: [g, e1.id, e2.id] });
    break;
  }
  // 2. A screening with more seats sold and held than it has.
  const shows = live.filter(e => e.kind === 'screening');
  const show = shows[(seed * 7) % shows.length];
  if (show) {
    const cap = eventCapacity(f, show);
    show.seatsSold = cap - 3; show.seatsHeld = 8 + (seed % 5);
    out.push({ kind: 'oversold', expect: new RegExp(`^seats-${esc(show.id)}$`), touches: [show.id] });
  }
  // 3. A guest whose flight lands after their own appearance.
  const appearances = live.filter(e => e.guestIds.length && !out.some(p => p.touches.includes(e.guestIds[0])));
  const ap = appearances[(seed * 3) % Math.max(1, appearances.length)];
  if (ap) {
    const g = f.people.find(p => p.id === ap.guestIds[0])!;
    g.arrives = addMinutes(ap.start, 30);
    out.push({ kind: 'not in town', expect: new RegExp(`^arrival-${esc(g.id)}-${esc(ap.id)}$`), touches: [g.id] });
  }
  return out;
}

export function evalRandomFestivals(n = 50): SuiteResult {
  const cases: CaseResult[] = [];
  let planted = 0, found = 0, falseAlarms = 0;
  for (let i = 0; i < n; i++) {
    const seed = 1000 + i * 37;
    const f = buildFestival(seed);
    const before = flagIds(f);
    const plants = plant(f, i);
    const after = flagIds(f);
    const fresh = [...after].filter(id => !before.has(id));
    const missed = plants.filter(p => !fresh.some(id => p.expect.test(id)));
    const extra = fresh.filter(id => !plants.some(p => mentions(id, p.touches)));
    planted += plants.length; found += plants.length - missed.length; falseAlarms += extra.length;
    cases.push({
      name: `Festival #${i + 1} (seed ${seed}): ${plants.map(p => p.kind).join(', ')}`,
      passed: missed.length === 0 && extra.length === 0,
      detail: missed.length || extra.length
        ? `${missed.length ? `missed: ${missed.map(p => p.kind).join(', ')}. ` : ''}${extra.length ? `unexpected: ${extra.slice(0, 3).join(', ')}` : ''}`
        : `found all ${plants.length}, nothing else new`,
    });
  }
  return {
    suite: `${n} random festivals with planted problems`,
    passMark: `every planted problem found, no false alarms (found ${found} of ${planted}, ${falseAlarms} false alarm${falseAlarms === 1 ? '' : 's'})`,
    passed: cases.filter(c => c.passed).length, total: cases.length, cases,
  };
}
