// Guest conflicts → the agent flags clashes, counting travel time between
// venues. Resolving the clash stays with a person.

import type { Festival, FestivalEvent } from '../core/types';
import { clock, toMinutes } from '../core/time';

export interface GuestClash {
  guestId: string;
  guestName: string;
  a: FestivalEvent;
  b: FestivalEvent;
  /** Minutes short: negative gap after travel. */
  shortByMin: number;
  travelMin: number;
  summary: string;
}

export function findGuestClashes(f: Festival): GuestClash[] {
  const out: GuestClash[] = [];
  const venue = (id: string) => f.venues.find(v => v.id === id)?.name ?? id;
  for (const guest of f.people.filter(p => p.role === 'guest')) {
    const evs = f.events
      .filter(e => e.status === 'scheduled' && e.guestIds.includes(guest.id))
      .sort((x, y) => toMinutes(x.start) - toMinutes(y.start));
    for (let i = 0; i < evs.length; i++) {
      for (let j = i + 1; j < evs.length; j++) {
        const a = evs[i], b = evs[j];
        if (a.day !== b.day) continue;
        // A screening flowing straight into its own Q&A in the same room is not a clash.
        if (a.filmId && a.filmId === b.filmId && a.venueId === b.venueId && a.end === b.start) continue;
        const travel = f.travel[a.venueId]?.[b.venueId] ?? 0;
        const gap = toMinutes(b.start) - toMinutes(a.end) - travel;
        if (gap < 0) {
          const overlap = toMinutes(b.start) < toMinutes(a.end);
          out.push({
            guestId: guest.id, guestName: guest.name, a, b, shortByMin: -gap, travelMin: travel,
            summary: overlap
              ? `${guest.name} is booked for "${a.title}" (${clock(a.start)}–${clock(a.end)}, ${venue(a.venueId)}) and "${b.title}" (${clock(b.start)}, ${venue(b.venueId)}) at the same time.`
              : `${guest.name} cannot get from "${a.title}" (ends ${clock(a.end)}, ${venue(a.venueId)}) to "${b.title}" (${clock(b.start)}, ${venue(b.venueId)}): ${travel} min travel, ${-gap} min short.`,
          });
        }
      }
    }
  }
  return out;
}

/** Linked Q&A left behind when its screening moved. */
export function findOrphanedQas(f: Festival): FestivalEvent[] {
  return f.events.filter(q => {
    if (q.kind !== 'qa' || q.status !== 'scheduled') return false;
    const s = f.events.find(e => e.kind === 'screening' && e.filmId === q.filmId && !e.restriction);
    return !!s && s.status === 'scheduled' && (s.venueId !== q.venueId || toMinutes(q.start) < toMinutes(s.end));
  });
}
