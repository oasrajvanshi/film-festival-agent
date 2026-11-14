// When will a guest get to their call, and is that in time?
// Sources, best first: a check-in, an ETA someone reported (with its quote),
// the flight feed plus the travel model, a booked car plus the travel model.
// Output is a range and a status word, not a probability: one festival a
// year gives no data to calibrate a percentage.

import type { CallEntry, Fact, Guest, Iso, Session } from '../domain/types';
import { addMinutes, clock, isBefore, maxIso, minutesBetween, span } from '../domain/time';
import type { FestivalView } from '../domain/view';
import { travelRange, type SnowSummary } from './snow';

export type GuestStatus = 'here' | 'on_track' | 'at_risk' | 'likely_late' | 'will_miss_start' | 'unknown' | 'done';

export const STATUS_WORDS: Record<GuestStatus, string> = {
  here: 'checked in',
  on_track: 'on track',
  at_risk: 'at risk of missing the call',
  likely_late: 'likely to miss the call',
  will_miss_start: 'will miss the start',
  unknown: 'no ETA',
  done: 'finished',
};

export interface Eta { early: Iso; likely: Iso; late: Iso; source: 'reported' | 'flight' | 'car' | 'standby'; basis: string[]; fact?: Fact }

export interface Assessment {
  guestId: string;
  guestName: string;
  sessionId: string;
  sessionTitle: string;
  role: CallEntry['role'];
  venueId: string;
  callTime?: Iso;
  callSource?: CallEntry['callSource'];
  start: Iso;
  status: GuestStatus;
  eta?: Eta;
  /** Minutes between the latest ETA and the call (negative = late). */
  slackMin?: number;
  basis: string[];
  summary: string;
}

/** ETA to a venue for a guest on the way (flight or booked car), or one who leaves `from` at `leaveAt`. */
export function etaFor(v: FestivalView, g: Guest, venueId: string, day: number, now: Iso, snow: SnowSummary,
  opts: { from?: string; leaveAt?: Iso } = {}): Eta | undefined {
  const reported = v.state.conditions.reportedEtas[g.id];
  if (reported && !opts.from && reported.value.startsWith(v.dateOf(day))) {
    const t = reported.value;
    return {
      early: addMinutes(t, -5), likely: t, late: addMinutes(t, 15), source: 'reported', fact: reported,
      basis: [`${reported.source.ref} at ${clock(reported.source.at)}: "${reported.source.quote ?? clock(t)}"`],
    };
  }
  const trip = v.travelFor(g, day);
  const basis: string[] = [];
  let leave: Iso;
  let from = trip.from;
  let source: Eta['source'] = 'car';
  if (opts.from) {
    from = opts.from; leave = opts.leaveAt ?? now; source = 'standby';
    basis.push(`Can leave ${v.placeName(from)} at ${clock(leave)}`);
  } else if (trip.mode === 'flight') {
    const feed = trip.flight ? v.state.conditions.flights[trip.flight] : undefined;
    if (feed?.status === 'cancelled') return undefined;
    const landing = feed?.estimatedArrival ?? trip.arrival;
    if (!landing) return undefined;
    source = 'flight';
    basis.push(feed ? `Flight ${trip.flight} ${feed.status === 'landed' ? 'landed' : 'lands'} ${clock(landing)} (${feed.source})`
      : `Flight ${trip.flight} lands ${clock(landing)} (schedule)`);
    leave = addMinutes(landing, trip.bufferMin);
    if (trip.pickupAt && isBefore(leave, trip.pickupAt)) leave = trip.pickupAt;
    if (trip.pickupAt) basis.push(`Festival car at ${clock(trip.pickupAt)}`);
  } else if (trip.mode === 'car' && trip.pickupAt) {
    leave = trip.pickupAt;
    basis.push(`Car pickup ${clock(trip.pickupAt)} at ${v.placeName(trip.from ?? '')}`);
  } else {
    return undefined;
  }
  // A flight or car whose departure time has passed is assumed to be on the road.
  const base = v.travelMin(from, venueId);
  if (base === undefined) return undefined;
  const r = travelRange(base, leave, snow);
  basis.push(`${v.placeName(from!)} to ${v.placeName(venueId)}: ${r.early} / ${r.likely} / ${r.late} min${r.inSnow ? ' in snow' : ''}`);
  return { early: addMinutes(leave, r.early), likely: addMinutes(leave, r.likely), late: addMinutes(leave, r.late), source, basis };
}

export function assess(v: FestivalView, entry: CallEntry, now: Iso, snow: SnowSummary): Assessment {
  const g = v.guest(entry.guestId)!;
  const s = v.session(entry.sessionId) as Session;
  const target = entry.callTime ?? s.start;
  const base = {
    guestId: g.id, guestName: g.name, sessionId: s.id, sessionTitle: s.title, role: entry.role,
    venueId: s.venueId, callTime: entry.callTime, callSource: entry.callSource, start: s.start,
  };
  const checkIn = v.state.conditions.checkIns[g.id];
  if (checkIn && checkIn.at.startsWith(v.dateOf(s.day))) {
    return { ...base, status: 'here', basis: [`Checked in ${clock(checkIn.at)} at ${v.placeName(checkIn.place)}`], summary: `${g.name} is checked in.` };
  }
  if (!isBefore(now, s.end)) return { ...base, status: 'done', basis: [], summary: `"${s.title}" has finished.` };

  const trip = v.travelFor(g, s.day);
  const flight = trip.flight ? v.state.conditions.flights[trip.flight] : undefined;
  if (flight?.status === 'cancelled') {
    return { ...base, status: 'will_miss_start', basis: [`Flight ${flight.flight} cancelled (${flight.source})`], summary: `${g.name}'s flight is cancelled.` };
  }
  const eta = etaFor(v, g, s.venueId, s.day, now, snow);
  if (!eta) {
    return { ...base, status: 'unknown', basis: ['In town; no car, flight or reported ETA on file'], summary: `No ETA for ${g.name}.` };
  }
  let status: GuestStatus;
  if (!isBefore(target, eta.late)) status = 'on_track';
  else if (!isBefore(target, eta.likely)) status = 'at_risk';
  else if (!isBefore(s.start, eta.early)) status = 'likely_late';
  else status = 'will_miss_start';
  const slackMin = minutesBetween(eta.late, target);
  const callWord = entry.callTime ? `${clock(entry.callTime)} call${entry.callSource === 'default' ? ' (default)' : ''}` : `${clock(s.start)} start (no call time on the sheet)`;
  return {
    ...base, status, eta, slackMin, basis: eta.basis,
    summary: `${g.name} ${STATUS_WORDS[status]} for "${s.title}": ETA ${span(eta.early, eta.late)}, ${callWord}.`,
  };
}

/**
 * Where a guest in town will be before `by`, and from when they are free:
 * their latest booking that day starting before `by` (if it has not ended),
 * else a check-in, else their last booking, else the hotel.
 */
export function whereIs(v: FestivalView, g: Guest, day: number, now: Iso, by: Iso): { place?: string; freeAt: Iso; basis: string; confirmed: boolean } | undefined {
  const checkIn = v.state.conditions.checkIns[g.id];
  const inToday = !!checkIn && checkIn.at.startsWith(v.dateOf(day));
  const trip = v.travelFor(g, day);
  if (!inToday && trip.mode !== 'local') return undefined; // still travelling today
  const before = v.bookings(g.id, day).filter(b => isBefore(b.start, by));
  const ongoing = before.filter(b => isBefore(now, b.end)).pop();
  if (ongoing) return { place: ongoing.venueId, freeAt: ongoing.end, confirmed: true, basis: `On "${ongoing.title}" at ${v.placeName(ongoing.venueId)} until ${clock(ongoing.end)}` };
  if (inToday) return { place: checkIn!.place, freeAt: now, confirmed: true, basis: `Checked in ${clock(checkIn!.at)} at ${v.placeName(checkIn!.place)}` };
  const last = before.pop();
  if (last) return { place: last.venueId, freeAt: now, confirmed: false, basis: `Last at "${last.title}", ${v.placeName(last.venueId)}, until ${clock(last.end)}` };
  return { place: trip.from, freeAt: now, confirmed: false, basis: trip.from ? `In town, at ${v.placeName(trip.from)}` : 'In town, location unknown' };
}

export interface BackupOption {
  guestId: string;
  name: string;
  badge: string;
  designated: boolean;
  /** On site now (checked in there, or in a session there). */
  here: boolean;
  canArrive?: Iso;
  noCallTime: boolean;
  spot?: string;
  basis: string[];
}

/** Is the guest booked for something that clashes with this session, counting travel? */
function isFree(v: FestivalView, guestId: string, s: Session): boolean {
  return v.bookings(guestId, s.day).filter(b => b.id !== s.id).every(b => {
    const there = v.travelMin(s.venueId, b.venueId) ?? 0;
    const back = v.travelMin(b.venueId, s.venueId) ?? 0;
    return !(isBefore(addMinutes(b.start, -there), s.end) && isBefore(s.start, addMinutes(b.end, back)));
  });
}

/**
 * Who could step in: backups named on the call sheet first, then other
 * guests who are in town, free for the session (counting travel) and close
 * by, panelists first for panels.
 */
export function backupsFor(v: FestivalView, sessionId: string, now: Iso, snow: SnowSummary, limit = 3): BackupOption[] {
  const s = v.session(sessionId)!;
  const onSession = new Set(v.callsForSession(s.id).filter(c => c.role !== 'backup').map(c => c.guestId));
  const designated = v.callsForSession(s.id).filter(c => c.role === 'backup' && !onSession.has(c.guestId));
  const option = (g: Guest, isDesignated: boolean, entry?: CallEntry): BackupOption | undefined => {
    const loc = whereIs(v, g, s.day, now, s.start);
    if (!loc) return undefined;
    const here = loc.confirmed && loc.place === s.venueId && !isBefore(now, loc.freeAt);
    const eta = loc.place ? etaFor(v, g, s.venueId, s.day, now, snow, { from: loc.place, leaveAt: maxIso(now, loc.freeAt) }) : undefined;
    return {
      guestId: g.id, name: g.name, badge: g.badge, designated: isDesignated, here,
      canArrive: here ? now : loc.place === s.venueId ? maxIso(now, loc.freeAt) : eta?.late, noCallTime: isDesignated && !entry?.callTime, spot: entry?.spot,
      basis: [loc.basis, ...(here ? [] : eta?.basis.slice(1) ?? [])],
    };
  };
  const named = designated.map(c => option(v.guest(c.guestId)!, true, c)).filter((x): x is BackupOption => !!x);
  const others = v.data.guests
    .filter(g => !onSession.has(g.id) && !designated.some(c => c.guestId === g.id) && isFree(v, g.id, s))
    .map(g => option(g, false))
    .filter((x): x is BackupOption => !!x && !!x.canArrive && !isBefore(s.start, x.canArrive))
    .sort((a, b) => Number(b.here) - Number(a.here)
      || Number(s.kind === 'panel' && b.badge === 'panelist') - Number(s.kind === 'panel' && a.badge === 'panelist')
      || minutesBetween(b.canArrive!, a.canArrive!));
  return [...named, ...others].slice(0, Math.max(limit, named.length));
}
