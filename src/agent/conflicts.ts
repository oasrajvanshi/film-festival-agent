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

export interface VenueClash { venueId: string; a: FestivalEvent; b: FestivalEvent; summary: string }

/** Two scheduled events in the same room at the same time. */
export function findVenueClashes(f: Festival): VenueClash[] {
  const out: VenueClash[] = [];
  const name = (id: string) => f.venues.find(v => v.id === id)?.name ?? id;
  const evs = f.events.filter(e => e.status === 'scheduled').sort((x, y) => toMinutes(x.start) - toMinutes(y.start));
  for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) {
    const a = evs[i], b = evs[j];
    if (a.venueId !== b.venueId || toMinutes(b.start) >= toMinutes(a.end)) continue;
    // Different screens in the same building can run at once.
    if (a.room && b.room && a.room !== b.room) continue;
    if (a.day !== b.day) continue;
    out.push({ venueId: a.venueId, a, b, summary: `${name(a.venueId)}${a.room ? `, ${a.room},` : ''} is double-booked: "${a.title}" (${clock(a.start)}–${clock(a.end)}) and "${b.title}" (${clock(b.start)}).` });
  }
  return out;
}

// ------------------------------------------------------------ seats, arrivals, volunteer availability
const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const placeName = (f: Festival, e: FestivalEvent) => {
  const v = f.venues.find(x => x.id === e.venueId)?.name ?? e.venueId;
  return e.room && !v.toLowerCase().endsWith(e.room.toLowerCase()) ? `${v}, ${e.room}` : v;
};

/** Seats in the event's room if it has one, else the whole venue. */
export function eventCapacity(f: Festival, e: FestivalEvent): number {
  const v = f.venues.find(x => x.id === e.venueId);
  return v?.rooms?.find(r => r.name === e.room)?.capacity ?? v?.capacity ?? 0;
}

/** Seats still free to sell: capacity minus sold and held (or minus check-ins if the box office hasn't reported). */
export function seatsLeft(f: Festival, e: FestivalEvent): number {
  const used = e.seatsSold !== undefined || e.seatsHeld !== undefined
    ? (e.seatsSold ?? 0) + (e.seatsHeld ?? 0)
    : f.checkIns.filter(c => c.eventId === e.id && c.allowed).length;
  return eventCapacity(f, e) - used;
}

export interface Oversold { event: FestivalEvent; capacity: number; sold: number; held: number; summary: string }
/** Screenings with more seats sold and held than the room has. */
export function findOversold(f: Festival): Oversold[] {
  return f.events.filter(e => e.status === 'scheduled' && (e.seatsSold ?? 0) + (e.seatsHeld ?? 0) > eventCapacity(f, e)).map(e => {
    const capacity = eventCapacity(f, e), sold = e.seatsSold ?? 0, held = e.seatsHeld ?? 0;
    return { event: e, capacity, sold, held,
      summary: `"${e.title}" (${dayLabel(e.start)} ${clock(e.start)}, ${placeName(f, e)}) has ${sold} sold and ${held} held for ${capacity} seats: ${sold + held - capacity} too many.` };
  });
}

export interface ArrivalClash { guestId: string; guestName: string; event: FestivalEvent; reason: 'before_arrival' | 'after_departure'; summary: string }
/** Guests booked for something before they're in town (allowing an hour from arrival) or after they've left. */
export function findArrivalClashes(f: Festival, bufferMin = 60): ArrivalClash[] {
  const out: ArrivalClash[] = [];
  for (const g of f.people.filter(p => p.arrives || p.departs)) {
    for (const e of f.events.filter(x => x.status === 'scheduled' && x.guestIds.includes(g.id))) {
      if (g.arrives && toMinutes(e.start) < toMinutes(g.arrives) + bufferMin) {
        out.push({ guestId: g.id, guestName: g.name, event: e, reason: 'before_arrival',
          summary: `${g.name} arrives ${dayLabel(g.arrives)} ${clock(g.arrives)}${g.travelNote ? ` (${g.travelNote})` : ''} but is booked for "${e.title}" at ${dayLabel(e.start)} ${clock(e.start)}, ${placeName(f, e)}.` });
      } else if (g.departs && toMinutes(e.end) > toMinutes(g.departs) - bufferMin) {
        out.push({ guestId: g.id, guestName: g.name, event: e, reason: 'after_departure',
          summary: `${g.name} leaves ${dayLabel(g.departs)} ${clock(g.departs)} but is booked for "${e.title}" at ${dayLabel(e.start)} ${clock(e.start)}, ${placeName(f, e)}.` });
      }
    }
  }
  return out;
}

export interface ShiftGap { shiftId: string; personId: string; personName: string; day: number; cover: string[]; summary: string }
/** Shifts on days the volunteer said they can't work, with who could cover (free that day, same skill first). */
export function findShiftGaps(f: Festival): ShiftGap[] {
  const out: ShiftGap[] = [];
  for (const s of f.shifts) {
    const p = f.people.find(x => x.id === s.personId);
    if (!p?.availableDays?.length || p.availableDays.includes(s.day)) continue;
    const task = s.task.toLowerCase();
    const cover = f.people
      .filter(o => o.id !== p.id && o.role === 'volunteer' && (o.availableDays ?? []).includes(s.day)
        && !f.shifts.some(x => x.personId === o.id && x.day === s.day && toMinutes(x.start) < toMinutes(s.end) && toMinutes(s.start) < toMinutes(x.end)))
      .sort((a, b) => Number((b.skills ?? []).some(k => task.includes(k.toLowerCase()) || k.toLowerCase().includes(task)))
        - Number((a.skills ?? []).some(k => task.includes(k.toLowerCase()) || k.toLowerCase().includes(task))))
      .slice(0, 3).map(o => o.name);
    const v = f.venues.find(x => x.id === s.venueId)?.name ?? s.venueId;
    out.push({ shiftId: s.id, personId: p.id, personName: p.name, day: s.day, cover,
      summary: `${p.name} is rostered ${dayLabel(s.start)} ${clock(s.start)}–${clock(s.end)} at ${v} (${s.task}) but isn't available that day.${cover.length ? ` Free to cover: ${cover.join(', ')}.` : ' Nobody free is listed for that day.'}` });
  }
  return out;
}

/** Everything beyond guest clashes the agent should flag for a person, as flag actions. */
export function otherFlags(f: Festival): { id: string; title: string; rationale: string; payload: unknown }[] {
  return [
    ...findVenueClashes(f).map(k => ({ id: `room-${k.a.id}-${k.b.id}`, title: 'Venue double-booked', rationale: k.summary, payload: k })),
    ...findOversold(f).map(k => ({ id: `seats-${k.event.id}`, title: `Oversold: ${k.event.title}`, rationale: k.summary, payload: k })),
    ...findArrivalClashes(f).map(k => ({ id: `arrival-${k.guestId}-${k.event.id}`, title: k.reason === 'before_arrival' ? `Not in town yet: ${k.guestName}` : `Already gone: ${k.guestName}`, rationale: k.summary, payload: k })),
    ...findShiftGaps(f).map(k => ({ id: `shift-${k.shiftId}`, title: `Shift needs cover: ${k.personName}`, rationale: k.summary, payload: k })),
  ];
}
