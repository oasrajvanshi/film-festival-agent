// No crowd view → a live venue view from check-in scans, with suggestions for
// where to redirect people. Crowd and safety decisions stay with staff.
// Only attendees who opted in to crowd tracking are counted by name; totals
// use the anonymous count of allowed scans.

import type { Festival, FestivalEvent } from '../core/types';
import { clock, toMinutes } from '../core/time';

export interface VenueLoad {
  venueId: string;
  venueName: string;
  capacity: number;
  event: FestivalEvent | null;
  inside: number;
  fill: number; // 0..1
  status: 'empty' | 'ok' | 'busy' | 'full';
}

export function venueView(f: Festival, at: string): VenueLoad[] {
  const t = toMinutes(at);
  return f.venues.map(v => {
    const event = f.events.find(e => e.venueId === v.id && e.status === 'scheduled'
      && toMinutes(e.start) - 30 <= t && t < toMinutes(e.end)) ?? null;
    const inside = event ? f.checkIns.filter(c => c.eventId === event.id && c.allowed).length : 0;
    const fill = inside / v.capacity;
    const status = !event ? 'empty' : fill >= 1 ? 'full' : fill >= 0.85 ? 'busy' : fill < 0.2 && t >= toMinutes(event.start) ? 'empty' : 'ok';
    return { venueId: v.id, venueName: v.name, capacity: v.capacity, event, inside, fill, status };
  });
}

export interface Redirect {
  from: FestivalEvent;
  to: FestivalEvent;
  seatsFree: number;
  travelMin: number;
  summary: string;
}

/** For each full or nearly full event, suggest public events nearby with space that people can still reach. */
export function suggestRedirects(f: Festival, at: string): Redirect[] {
  const view = venueView(f, at);
  const out: Redirect[] = [];
  for (const busy of view.filter(v => v.status === 'full' || v.status === 'busy')) {
    const from = busy.event!;
    for (const other of view) {
      if (other.venueId === busy.venueId) continue;
      const candidates = f.events.filter(e => e.venueId === other.venueId && e.status === 'scheduled' && !e.restriction
        && e.kind === from.kind && toMinutes(e.start) >= toMinutes(at));
      const travel = f.travel[busy.venueId][other.venueId];
      const to = candidates.find(e => toMinutes(e.start) - toMinutes(at) >= travel && toMinutes(e.start) - toMinutes(at) <= 90);
      if (!to) continue;
      const cap = f.venues.find(v => v.id === to.venueId)!.capacity;
      const seatsFree = cap - f.checkIns.filter(c => c.eventId === to.id && c.allowed).length;
      if (seatsFree < 20) continue;
      out.push({ from, to, seatsFree, travelMin: travel,
        summary: `"${from.title}" is ${busy.status}. "${to.title}" at ${other.venueName} starts ${clock(to.start)}, ${seatsFree} seats free, ${travel} min away.` });
    }
  }
  return out;
}
