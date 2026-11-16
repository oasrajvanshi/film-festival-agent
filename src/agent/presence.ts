// Who is at the festival today. One QR per person (attendees, guests, staff
// and vendors) is scanned at any venue entrance; the first scan of a day is
// their arrival. Each day's list of who to expect is worked out from the
// schedule the organizers already gave Usher, so nobody keeps it by hand.

import type { Arrival, DayNumber, Festival } from '../core/types';
import { addMinutes, toMinutes } from '../core/time';
import { deriveVendors, profileOf } from '../access/profiles';
import { PASS_LABELS, parseQr } from '../rules/access';

/** Flag a guest who hasn't been scanned in this many minutes before they're on. */
export const GUEST_LATE_MIN = 45;

export type PresenceKind = Arrival['kind'];

export interface RosterRow {
  id: string;
  name: string;
  kind: PresenceKind;
  /** Why they're expected today, e.g. "On stage: Directors panel, 4:00 pm". */
  why: string;
  /** Their first commitment today, if any (ISO local). */
  firstAt?: string;
  firstVenueId?: string;
  arrival?: Arrival;
  /** Arrived without being on today's list (a walk-in). */
  walkIn?: boolean;
}

export interface ArrivalResult {
  allowed: boolean;
  reason: string;
  personName?: string;
  kind?: PresenceKind;
  reentry?: boolean;
  /** What they have next today, for the person at the door to say. */
  next?: string;
}

const clock = (iso: string) => {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** The festival day a time falls on, or null outside the festival. */
export function dayAt(f: Festival, at: string): DayNumber | null {
  const date = at.slice(0, 10);
  const hit = Object.entries(f.dates).find(([, d]) => d === date);
  return hit ? Number(hit[0]) : null;
}

const venueName = (f: Festival, id?: string) => f.venues.find(v => v.id === id)?.name ?? id ?? '';

/** Everyone Usher expects on site on a day, from the schedule, passes, shifts and deliveries. */
export function expectedOn(f: Festival, day: DayNumber): RosterRow[] {
  const rows: RosterRow[] = [];
  const live = f.events.filter(e => e.day === day && e.status === 'scheduled').sort((a, b) => a.start.localeCompare(b.start));
  for (const p of f.people) {
    const kind = profileOf(p);
    if (kind === 'guest') {
      const on = live.filter(e => e.guestIds.includes(p.id));
      if (on.length) rows.push({ id: p.id, name: p.name, kind, why: `On stage: ${on[0].title}, ${clock(on[0].start)}${on.length > 1 ? ` (+${on.length - 1} more)` : ''}`, firstAt: on[0].start, firstVenueId: on[0].venueId });
    } else if (kind === 'staff' || kind === 'organizer') {
      const sh = f.shifts.filter(s => s.personId === p.id && s.start.slice(0, 10) === f.dates[day]).sort((a, b) => a.start.localeCompare(b.start));
      if (sh.length) rows.push({ id: p.id, name: p.name, kind, why: `Shift: ${sh[0].task.replace(/_/g, " ")}, ${clock(sh[0].start)}`, firstAt: sh[0].start, firstVenueId: sh[0].venueId });
    } else {
      const tix = f.tickets.filter(t => t.personId === p.id).map(t => live.find(e => e.id === t.eventId)).filter(e => !!e);
      const pass = f.passes.find(x => x.personId === p.id);
      const passToday = !!pass && pass.validDays.includes(day) && pass.type !== 'single_ticket';
      const booked = f.bookings.filter(b => b.personId === p.id).map(b => live.find(e => e.id === b.eventId)).filter(e => !!e);
      const first = [...tix, ...booked].sort((a, b) => a!.start.localeCompare(b!.start))[0];
      if (tix.length || passToday) rows.push({ id: p.id, name: p.name, kind, why: tix.length ? `Ticket: ${tix[0]!.title}, ${clock(tix[0]!.start)}` : PASS_LABELS[pass!.type], firstAt: first?.start, firstVenueId: first?.venueId });
    }
  }
  for (const v of deriveVendors(f)) {
    const drops = v.deliveries.filter(d => d.day === day && !d.cancelled);
    if (drops.length) rows.push({ id: v.id, name: v.name, kind: 'vendor', why: `${drops.length} drop${drops.length === 1 ? '' : 's'}, first ${clock(drops[0].at)} at ${venueName(f, drops[0].venueId)}`, firstAt: drops[0].at, firstVenueId: drops[0].venueId });
  }
  return rows;
}

/** Today's list: who's expected, who has arrived, and walk-ins. */
export function roster(f: Festival, day: DayNumber): RosterRow[] {
  const arrivals = (f.arrivals ?? []).filter(a => a.day === day && !a.reentry);
  const rows = expectedOn(f, day).map(r => ({ ...r, arrival: arrivals.find(a => a.personId === r.id) }));
  for (const a of arrivals) {
    if (rows.some(r => r.id === a.personId)) continue;
    const w = whoIs(f, a.personId);
    rows.push({ id: a.personId, name: w?.name ?? a.personId, kind: a.kind, why: 'Not on today\'s list', arrival: a, walkIn: true });
  }
  return rows;
}

/** A person or vendor by id. */
export function whoIs(f: Festival, id: string): { name: string; kind: PresenceKind } | null {
  const p = f.people.find(x => x.id === id);
  if (p) return { name: p.name, kind: profileOf(p) };
  const v = deriveVendors(f).find(x => x.id === id);
  return v ? { name: v.name, kind: 'vendor' } : null;
}

/** What someone has next today, in a sentence. */
export function nextFor(f: Festival, id: string, day: DayNumber, at: string): string | undefined {
  const row = expectedOn(f, day).find(r => r.id === id);
  if (!row) return undefined;
  const after = (iso: string) => toMinutes(iso) >= toMinutes(at) - 15;
  if (row.kind === 'guest') {
    const on = f.events.filter(e => e.day === day && e.status === 'scheduled' && e.guestIds.includes(id) && after(e.end)).sort((a, b) => a.start.localeCompare(b.start));
    return on.length ? on.map(e => `${clock(e.start)} ${e.title} at ${venueName(f, e.venueId)}`).join('; ') : undefined;
  }
  if (row.kind === 'vendor') {
    const v = deriveVendors(f).find(x => x.id === id)!;
    const drops = v.deliveries.filter(d => d.day === day && !d.cancelled && after(d.at));
    return drops.length ? drops.slice(0, 3).map(d => `${clock(d.at)} ${d.what} at ${venueName(f, d.venueId)}`).join('; ') : undefined;
  }
  return row.firstAt && after(row.firstAt) ? `${row.why.replace(/^[^:]+: /, '')} at ${venueName(f, row.firstVenueId)}` : undefined;
}

/** Check a QR at a venue entrance. Does not change anything. */
export function checkArrival(f: Festival, qr: string, at: string): ArrivalResult {
  const id = parseQr(qr);
  if (!id) return { allowed: false, reason: 'Code not recognised. Send to the info desk.' };
  const who = whoIs(f, id);
  if (!who) return { allowed: false, reason: 'Not on the festival list. Send to the info desk.' };
  const day = dayAt(f, at);
  if (day == null) return { allowed: false, reason: 'There is no festival day today.', personName: who.name, kind: who.kind };
  const reentry = (f.arrivals ?? []).some(a => a.personId === id && a.day === day);
  const base = { personName: who.name, kind: who.kind, reentry, next: nextFor(f, id, day, at) };
  if (who.kind === 'attendee') {
    const expected = expectedOn(f, day).some(r => r.id === id);
    if (!expected) {
      const pass = f.passes.find(p => p.personId === id);
      return { ...base, allowed: false, reason: pass ? `${PASS_LABELS[pass.type]} is not valid today, and no ticket for today.` : 'No pass or ticket for today.' };
    }
  }
  const label = { attendee: 'Attendee', guest: 'Guest', vendor: 'Vendor', staff: 'Staff', organizer: 'Organizer' }[who.kind];
  return { ...base, allowed: true, reason: reentry ? `${label}, back in. Already arrived today.` : `${label}, welcome. Arrival recorded.` };
}

/** Guests on stage soon who haven't been scanned in yet today. */
export function lateGuests(f: Festival, at: string) {
  const day = dayAt(f, at);
  // Only once the doors are scanning people in that day; before that, no news is not bad news.
  if (day == null || !(f.arrivals ?? []).some(a => a.day === day)) return [];
  const here = new Set((f.arrivals ?? []).filter(a => a.day === day).map(a => a.personId));
  const now = toMinutes(at);
  const out: { id: string; title: string; rationale: string; payload: unknown }[] = [];
  for (const e of f.events) {
    if (e.day !== day || e.status !== 'scheduled') continue;
    if (now < toMinutes(addMinutes(e.start, -GUEST_LATE_MIN)) || now >= toMinutes(e.end)) continue;
    for (const g of e.guestIds) {
      if (here.has(g)) continue;
      const p = f.people.find(x => x.id === g);
      if (!p) continue;
      out.push({
        id: `noshow-${g}-${e.id}`, title: `Not here yet: ${p.name}`,
        rationale: `${p.name} is on at ${clock(e.start)} (${e.title}, ${venueName(f, e.venueId)}) and hasn't been scanned in today. Call them, or line up a stand-in.`,
        payload: { guestId: g, eventId: e.id },
      });
    }
  }
  return out;
}

/** The welcome note a guest or vendor gets on their first scan of the day. */
export function welcomeNote(f: Festival, id: string, kind: PresenceKind, venueId: string, next?: string): { subject: string; body: string } | null {
  const w = whoIs(f, id);
  if (!w || (kind !== 'guest' && kind !== 'vendor')) return null;
  const where = venueName(f, venueId);
  if (kind === 'guest') {
    const first = w.name.split(' ')[0];
    return { subject: `Welcome to ${f.name}`, body: `Welcome, ${first}. You're checked in at ${where}.${next ? ` Today you're on: ${next}.` : ''} The green room opens 30 minutes before each of your appearances. Reply here if anything changes.` };
  }
  return { subject: 'Checked in', body: `${w.name} is checked in at ${where}.${next ? ` Today's drops: ${next}.` : ''} We'll message you if a time moves.` };
}

/** Today's list as CSV, for the organizers' records. */
export function rosterCsv(f: Festival, day: DayNumber): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = roster(f, day).map(r => [r.name, r.kind, r.why, r.firstAt ? clock(r.firstAt) : '', r.arrival ? clock(r.arrival.at) : '', r.arrival ? venueName(f, r.arrival.venueId) : '', r.arrival?.by ?? ''].map(x => q(String(x))).join(','));
  return ['Name,Profile,Expected for,First commitment,Arrived,Venue,Scanned by', ...rows].join('\n');
}
