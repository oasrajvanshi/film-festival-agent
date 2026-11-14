// Changes don't propagate → the agent pushes each grid change to every
// affected channel in one step. Staff edit the schedule grid; the agent diffs
// the old and new grid, works out exactly who is affected, and drafts one
// bundle of updates for one approval.

import type { Channel, Festival, FestivalEvent, Person } from '../core/types';
import { clock, overlaps } from '../core/time';
import type { Action, OutboundMessage } from './approvals';
import { recommendFor, recommendationText, type Recommendation } from './recommend';

export type ChangeField = 'start' | 'end' | 'venueId' | 'status' | 'guestIds' | 'title';

export interface ScheduleChange {
  eventId: string;
  before: FestivalEvent | null;
  after: FestivalEvent | null;
  fields: ChangeField[];
}

const FIELDS: ChangeField[] = ['start', 'end', 'venueId', 'status', 'guestIds', 'title'];

/** Compare two versions of the grid. */
export function diffSchedules(before: FestivalEvent[], after: FestivalEvent[]): ScheduleChange[] {
  const out: ScheduleChange[] = [];
  const byId = new Map(before.map(e => [e.id, e]));
  for (const a of after) {
    const b = byId.get(a.id);
    if (!b) { out.push({ eventId: a.id, before: null, after: a, fields: [...FIELDS] }); continue; }
    const fields = FIELDS.filter(k => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
    if (fields.length) out.push({ eventId: a.id, before: b, after: a, fields });
  }
  const afterIds = new Set(after.map(e => e.id));
  for (const b of before) if (!afterIds.has(b.id)) out.push({ eventId: b.id, before: b, after: null, fields: ['status'] });
  return out;
}

export type AffectedReason = 'ticket' | 'itinerary' | 'guest' | 'guest_removed' | 'volunteer_shift' | 'staff';

export interface Affected {
  person: Person;
  reasons: AffectedReason[];
}

/** Who must hear about this change, and why. Nobody else. */
export function affectedBy(f: Festival, change: ScheduleChange): Affected[] {
  const ev = change.after ?? change.before!;
  const old = change.before ?? ev;
  const map = new Map<string, Set<AffectedReason>>();
  const add = (pid: string, r: AffectedReason) => {
    if (!map.has(pid)) map.set(pid, new Set());
    map.get(pid)!.add(r);
  };

  // Audience who hold a ticket or saved it. A screening ticket covers its Q&A,
  // so a change to the Q&A reaches the screening's ticket holders too.
  const linked = f.events.filter(e => e.filmId && e.filmId === ev.filmId && e.id !== ev.id
    && ((ev.kind === 'qa' && e.kind === 'screening' && e.end === old.start)));
  const eventIds = new Set([ev.id, ...linked.map(e => e.id)]);
  for (const t of f.tickets) if (eventIds.has(t.eventId)) add(t.personId, 'ticket');
  for (const b of f.bookings) if (b.eventId === ev.id) add(b.personId, 'itinerary');

  // Guests on the event, before or after.
  const beforeGuests = new Set(change.before?.guestIds ?? []);
  const afterGuests = new Set(change.after?.guestIds ?? []);
  for (const g of afterGuests) add(g, 'guest');
  for (const g of beforeGuests) if (!afterGuests.has(g)) add(g, 'guest_removed');

  // Volunteers whose shift covers the old or new slot at the old or new venue.
  // Only time, place or status changes touch the floor.
  const floorChange = change.fields.some(k => k === 'start' || k === 'end' || k === 'venueId' || k === 'status');
  if (floorChange) {
    const windows = [change.before, change.after].filter(Boolean) as FestivalEvent[];
    for (const s of f.shifts) {
      if (windows.some(w => s.venueId === w.venueId && overlaps(s.start, s.end, w.start, w.end))) add(s.personId, 'volunteer_shift');
    }
  }

  // Staff: house managers and operations always; guest relations when guests are involved.
  const guestTouched = afterGuests.size > 0 || beforeGuests.size > 0;
  for (const p of f.people) {
    if (p.role !== 'festival_staff') continue;
    if (p.staffRole === 'house_manager' || p.staffRole === 'operations') add(p.id, 'staff');
    if (guestTouched && p.staffRole === 'guest_relations') add(p.id, 'staff');
  }

  return [...map.entries()].map(([pid, rs]) => ({
    person: f.people.find(p => p.id === pid)!,
    reasons: [...rs],
  }));
}

function preferredChannel(p: Person): Channel {
  for (const c of ['app_push', 'sms', 'email'] as Channel[]) if (p.channels.includes(c)) return c;
  return p.channels[0] ?? 'email';
}

export function describeChange(f: Festival, change: ScheduleChange): string {
  const venue = (id: string) => f.venues.find(v => v.id === id)?.name ?? id;
  const b = change.before, a = change.after;
  const ev = a ?? b!;
  if (!a || a.status === 'cancelled') return `${ev.title} (${clock(ev.start)}, ${venue(ev.venueId)}) is cancelled.`;
  if (!b) return `New: ${a.title}, ${clock(a.start)} at ${venue(a.venueId)}.`;
  const parts: string[] = [];
  if (change.fields.includes('start')) parts.push(`now starts at ${clock(a.start)} (was ${clock(b.start)})`);
  if (change.fields.includes('venueId')) parts.push(`moves to ${venue(a.venueId)} (was ${venue(b.venueId)})`);
  if (change.fields.includes('guestIds')) {
    const name = (id: string) => f.people.find(p => p.id === id)?.name ?? id;
    const added = a.guestIds.filter(g => !b.guestIds.includes(g)).map(name);
    const removed = b.guestIds.filter(g => !a.guestIds.includes(g)).map(name);
    if (added.length) parts.push(`adds ${added.join(', ')}`);
    if (removed.length) parts.push(`${removed.join(', ')} can no longer attend`);
  }
  if (change.fields.includes('title')) parts.push(`is now titled "${a.title}"`);
  return `${b.title}: ${parts.join('; ')}.`;
}

let actionSeq = 0;
const aid = (p: string) => `${p}-${++actionSeq}`;

/** Draft the actions for one change. Message text comes from the grid, never invented. */
export function planPropagation(f: Festival, change: ScheduleChange): Action[] {
  const affected = affectedBy(f, change);
  const what = describeChange(f, change);
  const ev = change.after ?? change.before!;
  const actions: Action[] = [];

  const audience = affected.filter(x => x.reasons.some(r => r === 'ticket' || r === 'itinerary' || r === 'guest' || r === 'guest_removed'));
  if (audience.length) {
    const messages: (OutboundMessage & { recommendation: Recommendation })[] = audience.map(({ person, reasons }) => {
      const recommendation = recommendFor(f, change, person, reasons);
      return {
        personId: person.id,
        channel: preferredChannel(person),
        subject: `Schedule change: ${ev.title}`,
        body: `${what} ${recommendationText(recommendation)}`,
        recommendation,
      };
    });
    actions.push({
      id: aid('notify'), kind: 'notify_people', title: `Notify ${messages.length} affected people`,
      rationale: `${what} Reached via tickets, saved itineraries and guest bookings for ${ev.id}.`, messages,
    });
  }

  if (!ev.restriction) {
    actions.push({
      id: aid('web'), kind: 'update_website', title: `Update public listing for ${ev.title}`,
      rationale: what, payload: { eventId: ev.id, after: change.after },
    });
  }

  const vols = affected.filter(x => x.reasons.includes('volunteer_shift'));
  if (vols.length) {
    actions.push({
      id: aid('brief'), kind: 'update_brief', title: `Update live brief for ${vols.length} volunteers on shift`,
      rationale: what,
      messages: vols.map(({ person }) => ({ personId: person.id, channel: 'volunteer_brief', subject: 'Brief updated', body: `${what} ${floorAdvice(f, change, person)}` })),
    });
  }

  const staff = affected.filter(x => x.reasons.includes('staff'));
  if (staff.length) {
    actions.push({
      id: aid('staff'), kind: 'notify_staff', title: `Heads-up to ${staff.length} staff`, rationale: what,
      messages: staff.map(({ person }) => ({ personId: person.id, channel: preferredChannel(person), subject: 'Grid change', body: what })),
    });
  }
  return actions;
}

/** What a volunteer on the floor should do about this change. */
function floorAdvice(f: Festival, change: ScheduleChange, person: Person): string {
  const venue = (id: string) => f.venues.find(v => v.id === id)?.name ?? id;
  const a = change.after, b = change.before;
  const shift = f.shifts.find(s => s.personId === person.id && [a, b].some(w => w && w.venueId === s.venueId && overlaps(s.start, s.end, w.start, w.end)));
  if (!shift) return '';
  if (!a || a.status === 'cancelled') return `If people arrive for it, tell them it is cancelled and send ticket holders to the info desk.`;
  if (b && a.venueId !== b.venueId) {
    return shift.venueId === b.venueId
      ? `Redirect arrivals to ${venue(a.venueId)}; the free shuttle runs every 20 minutes.`
      : `Expect this audience at your venue from ${clock(a.start)}; scan as usual.`;
  }
  if (b && a.start !== b.start) return `Doors now open for it around ${clock(a.start)}; late entry closes 15 minutes after start.`;
  return 'No change to door procedure.';
}
