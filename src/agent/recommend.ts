// Every affected person gets a recommendation, not just a notice.
// Recommendations are computed from the grid, travel times, the person's pass
// and their own itinerary. The language model may rephrase them; it never
// decides them.

import type { Festival, FestivalEvent, Person } from '../core/types';
import { addMinutes, clock, toMinutes } from '../core/time';
import { ACCESS_RULES } from '../rules/access';
import type { AffectedReason, ScheduleChange } from './propagate';
import { seatsLeft } from './conflicts';

export interface Recommendation {
  /** One line: what this person should do. */
  action: string;
  /** Up to three concrete alternatives, best first. */
  options: string[];
  /** The facts the recommendation used, for the audit log. */
  basis: string[];
}

const venueName = (f: Festival, id: string) => f.venues.find(v => v.id === id)?.name ?? id;

function canAttend(f: Festival, person: Person, e: FestivalEvent): boolean {
  if (e.status !== 'scheduled') return false;
  if (f.tickets.some(t => t.personId === person.id && t.eventId === e.id)) return true;
  const pass = f.passes.find(p => p.personId === person.id);
  if (!pass) return false;
  const rule = ACCESS_RULES[pass.type];
  return rule.kinds.includes(e.kind) && (!e.restriction || rule.restrictions.includes(e.restriction)) && pass.validDays.includes(e.day);
}


/** The person's other plans that day: tickets, saved events, guest bookings. */
function planFor(f: Festival, person: Person, day: number, exceptId: string): FestivalEvent[] {
  const ids = new Set([
    ...f.tickets.filter(t => t.personId === person.id).map(t => t.eventId),
    ...f.bookings.filter(b => b.personId === person.id).map(b => b.eventId),
  ]);
  return f.events
    .filter(e => e.id !== exceptId && e.day === day && e.status === 'scheduled' && (ids.has(e.id) || e.guestIds.includes(person.id)))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

/** Alternatives in roughly the same window the person can get into and reach. */
function alternatives(f: Festival, person: Person, around: FestivalEvent, keep: FestivalEvent[], exclude: Set<string>): string[] {
  const t0 = toMinutes(around.start);
  const fits = (e: FestivalEvent) => keep.every(k =>
    toMinutes(k.end) + f.travel[k.venueId][e.venueId] <= toMinutes(e.start)
    || toMinutes(e.end) + f.travel[e.venueId][k.venueId] <= toMinutes(k.start));
  return f.events
    .filter(e => !exclude.has(e.id) && e.kind === around.kind && e.day === around.day
      && Math.abs(toMinutes(e.start) - t0) <= 90 && canAttend(f, person, e) && seatsLeft(f, e) > 0 && fits(e))
    .sort((a, b) => Math.abs(toMinutes(a.start) - t0) - Math.abs(toMinutes(b.start) - t0))
    .slice(0, 3)
    .map(e => `"${e.title}" at ${venueName(f, e.venueId)}, ${clock(e.start)}`);
}

export function recommendFor(f: Festival, change: ScheduleChange, person: Person, reasons: AffectedReason[]): Recommendation {
  const before = change.before, after = change.after;
  const ev = after ?? before!;
  const basis: string[] = [];

  if (reasons.includes('guest_removed')) {
    return { action: 'No action needed. Guest relations will confirm your updated schedule.', options: [], basis: ['removed from event guest list'] };
  }

  const plan = planFor(f, person, ev.day, ev.id);
  const prev = after ? [...plan].reverse().find(e => toMinutes(e.end) <= toMinutes(after.start) + 1) : undefined;
  const next = after ? plan.find(e => toMinutes(e.start) >= toMinutes(after.start)) : undefined;

  // Cancelled: offer the closest alternatives.
  if (!after || after.status === 'cancelled') {
    const opts = alternatives(f, person, ev, plan, new Set([ev.id]));
    basis.push(`cancelled ${ev.id}`, `pass/tickets checked for ${opts.length} alternatives`);
    const hasTicket = reasons.includes('ticket');
    const ticket = f.tickets.find(t => t.personId === person.id && t.eventId === ev.id);
    const free = ticket && (ticket.price === 0 || /comp|complimentary|free|guest|press/i.test(ticket.type ?? ''));
    const money = (n: number) => '$' + n.toFixed(2);
    const ticketLine = free
      ? 'Your complimentary ticket is released; there is nothing to refund.'
      : ticket?.price !== undefined
      ? `You'll get a full refund of ${money(ticket.price)}${ticket.type ? ` for your ${ticket.type.toLowerCase()} ticket` : ''} to your original card.`
      : 'The ticketing partner will contact you about your ticket.';
    if (ticket) basis.push(`ticket ${ticket.id}: ${ticket.type ?? 'type unknown'}, ${ticket.price !== undefined ? money(ticket.price) : 'price unknown'}`);
    return {
      action: hasTicket
        ? (opts.length ? `${ticketLine} Your pass also gets you into these instead.` : ticketLine)
        : opts.length ? 'Pick another event in the same window that fits your day.' : 'Nothing similar fits your day in that window; check the app schedule.',
      options: opts,
      basis,
    };
  }

  // Guest on the event: check their own schedule around the new slot.
  if (reasons.includes('guest')) {
    if (person.arrives && toMinutes(after.start) < toMinutes(person.arrives) + 60) {
      return {
        action: `This is now at ${clock(after.start)}, before you're due in (${clock(person.arrives)}${person.travelNote ? `, ${person.travelNote}` : ''}). Guest relations will contact you about timing; please don't change your travel until they do.`,
        options: [], basis: [`guest arrives ${person.arrives}`],
      };
    }
    const clashes = plan.filter(e => toMinutes(e.start) < toMinutes(after.end) + f.travel[after.venueId][e.venueId]
      && toMinutes(e.end) + f.travel[e.venueId][after.venueId] > toMinutes(after.start));
    if (clashes.length) {
      basis.push(...clashes.map(c => `clash with ${c.id}`));
      return {
        action: `This now overlaps with ${clashes.map(c => `"${c.title}" (${clock(c.start)}, ${venueName(f, c.venueId)})`).join(' and ')}. Guest relations will contact you to resolve it; please don't change plans until they do.`,
        options: [], basis,
      };
    }
    const leave = prev ? addMinutes(after.start, -f.travel[prev.venueId][after.venueId] - 15) : null;
    return {
      action: prev && prev.venueId === after.venueId
        ? `Stay at ${venueName(f, after.venueId)} after "${prev.title}"; you're now on at ${clock(after.start)}.`
        : leave && prev
        ? `Leave ${venueName(f, prev.venueId)} by ${clock(leave)} to arrive 15 minutes early at ${venueName(f, after.venueId)}.`
        : `Arrive at ${venueName(f, after.venueId)} by ${clock(addMinutes(after.start, -15))}.`,
      options: [], basis: [`previous commitment: ${prev?.id ?? 'none'}`],
    };
  }

  // Audience: can they still make it, and does it now clash with their next plan?
  const issues: string[] = [];
  if (prev) {
    const travel = f.travel[prev.venueId][after.venueId];
    const slack = toMinutes(after.start) - toMinutes(prev.end) - travel;
    basis.push(`previous: ${prev.id} ends ${clock(prev.end)}, travel ${travel} min, slack ${slack} min`);
    if (slack < 0) issues.push(`You can't get there from "${prev.title}" in time (${travel} min travel).`);
    else if (change.fields.includes('venueId') || change.fields.includes('start')) {
      issues.push(travel
        ? `Leave ${venueName(f, prev.venueId)} by ${clock(addMinutes(after.start, -travel - 10))} (${travel} min to ${venueName(f, after.venueId)}).`
        : `It's now in the same building as "${prev.title}", so stay at ${venueName(f, after.venueId)}.`);
    }
  }
  if (next) {
    const travel = f.travel[after.venueId][next.venueId];
    const slack = toMinutes(next.start) - toMinutes(after.end) - travel;
    basis.push(`next: ${next.id} starts ${clock(next.start)}, travel ${travel} min, slack ${slack} min`);
    if (slack < 0) issues.push(`It now runs into "${next.title}" at ${clock(next.start)}.`);
  }
  const clash = issues.some(i => i.startsWith("You can't") || i.startsWith('It now runs'));
  if (clash) {
    // Alternatives to the moved event that fit around everything else they planned.
    const opts = alternatives(f, person, after, plan, new Set([after.id, ...plan.map(e => e.id)]));
    return { action: `${issues.join(' ')} Choose which one to keep${opts.length ? ', or swap it for one that fits' : ''}.`, options: opts, basis };
  }
  if (issues.length) return { action: issues.join(' '), options: [], basis };
  if (change.fields.includes('venueId')) {
    return { action: `Head to ${venueName(f, after.venueId)} instead and arrive by ${clock(addMinutes(after.start, -10))}.`, options: [], basis };
  }
  if (change.fields.includes('start')) {
    return { action: `Plan to arrive by ${clock(addMinutes(after.start, -10))}. Doors close 15 minutes after start.`, options: [], basis };
  }
  return { action: 'No action needed.', options: [], basis };
}

export function recommendationText(r: Recommendation): string {
  return r.options.length ? `${r.action} Options: ${r.options.join('; ')}.` : r.action;
}
