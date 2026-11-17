// Access rules, encoded once. Volunteers scan a QR and see green or red.
// Mirrors the "Pass and Badge Access Policy" document exactly; a test checks
// the two stay in sync.

import type { EventKind, EventRestriction, Festival, FestivalEvent, PassType } from '../core/types';
import { addMinutes, toMinutes } from '../core/time';

type Admits = { kinds: EventKind[]; restrictions: EventRestriction[] };

const PUBLIC: EventKind[] = ['screening', 'qa'];

/** What each pass type admits to, beyond tickets. */
export const ACCESS_RULES: Record<PassType, Admits> = {
  day_pass: { kinds: PUBLIC, restrictions: [] },
  single_ticket: { kinds: [], restrictions: [] },
  three_day: { kinds: [...PUBLIC, 'panel'], restrictions: [] },
  vip: { kinds: [...PUBLIC, 'panel', 'activity'], restrictions: ['vip_only'] },
  industry: { kinds: [...PUBLIC, 'panel', 'market'], restrictions: ['industry_only'] },
  press: { kinds: [...PUBLIC, 'panel'], restrictions: ['press_only'] },
  panelist: { kinds: [...PUBLIC, 'panel', 'activity'], restrictions: ['vip_only'] },
  featured_filmmaker: { kinds: [...PUBLIC, 'panel', 'market', 'activity'], restrictions: ['industry_only', 'vip_only'] },
  volunteer: { kinds: [], restrictions: [] }, // shift-based, see below
  festival_staff: { kinds: ['screening', 'qa', 'panel', 'market', 'activity'], restrictions: ['press_only', 'industry_only', 'vip_only'] },
};

export const PASS_LABELS: Record<PassType, string> = {
  day_pass: 'Day pass',
  single_ticket: 'Single-screening ticket',
  three_day: 'Festival pass',
  vip: 'VIP pass',
  industry: 'Industry badge',
  press: 'Press badge',
  panelist: 'Panelist badge',
  featured_filmmaker: 'Featured filmmaker badge',
  volunteer: 'Volunteer badge',
  festival_staff: 'Festival staff badge',
};

export const LATE_ENTRY_MIN = 15;
export const TICKET_HOLD_MIN = 10;

// --- QR codes: one per person, covering their pass and every extra ticket.
// The prototype uses a simple checksum; production would sign codes.
function checksum(s: string): string {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 104729;
  return h.toString(36).toUpperCase();
}
export function qrFor(personId: string): string {
  return `USH1.${personId}.${checksum(personId)}`;
}
export function parseQr(code: string): string | null {
  // USH1 is Usher's prefix; HLFF1 codes from the first prototype still scan.
  const m = /^(?:USH1|HLFF1)\.([A-Za-z0-9_-]+)\.([0-9A-Z]+)$/.exec(code.trim());
  if (!m || checksum(m[1]) !== m[2]) return null;
  return m[1];
}

export interface ScanResult {
  allowed: boolean;
  /** Short reason the volunteer reads aloud. */
  reason: string;
  personName?: string;
  via?: string;
}

function ticketCovers(f: Festival, personId: string, event: FestivalEvent): boolean {
  return f.tickets.some(t => {
    if (t.personId !== personId) return false;
    if (t.eventId === event.id) return true;
    // A screening ticket includes the Q&A that follows it.
    const tEvent = f.events.find(e => e.id === t.eventId);
    return event.kind === 'qa' && !!tEvent && tEvent.filmId === event.filmId && tEvent.end === event.start;
  });
}

export function checkScan(f: Festival, qr: string, eventId: string, at: string): ScanResult {
  const personId = parseQr(qr);
  if (!personId) return { allowed: false, reason: 'Code not recognised. Send to the info desk.' };
  const person = f.people.find(p => p.id === personId);
  const pass = f.passes.find(p => p.personId === personId);
  if (!person || !pass) return { allowed: false, reason: 'No pass on file. Send to the info desk.' };
  const event = f.events.find(e => e.id === eventId);
  if (!event) return { allowed: false, reason: 'Unknown event.', personName: person.name };
  const deny = (reason: string): ScanResult => ({ allowed: false, reason, personName: person.name });
  if (event.status === 'cancelled') return deny('This event is cancelled.');

  // Staff and volunteers enter to work, not as audience.
  if (pass.type === 'festival_staff') return { allowed: true, reason: 'Festival staff.', personName: person.name, via: PASS_LABELS.festival_staff };
  if (pass.type === 'volunteer') {
    const onShift = f.shifts.some(s => s.personId === personId && s.venueId === event.venueId
      && toMinutes(at) >= toMinutes(addMinutes(s.start, -30)) && toMinutes(at) <= toMinutes(s.end));
    return onShift
      ? { allowed: true, reason: 'Volunteer on shift at this venue.', personName: person.name, via: PASS_LABELS.volunteer }
      : deny('Volunteer is not on shift at this venue now.');
  }

  if (f.checkIns.some(c => c.personId === personId && c.eventId === eventId && c.allowed)) {
    return deny('Already checked in to this event.');
  }
  if (event.kind === 'screening' && toMinutes(at) > toMinutes(addMinutes(event.start, LATE_ENTRY_MIN))) {
    return deny(`Doors closed ${LATE_ENTRY_MIN} minutes after start.`);
  }

  const hasTicket = ticketCovers(f, personId, event);
  const rule = ACCESS_RULES[pass.type];
  const kindOk = rule.kinds.includes(event.kind);
  const restrictionOk = !event.restriction || rule.restrictions.includes(event.restriction);
  const dayOk = pass.validDays.includes(event.day);
  const passOk = kindOk && restrictionOk && dayOk;

  // Guests booked on the event always get in.
  if (event.guestIds.includes(personId)) return { allowed: true, reason: 'Booked guest for this event.', personName: person.name, via: PASS_LABELS[pass.type] };

  if (!hasTicket && !passOk) {
    if (!kindOk || !restrictionOk) return deny(`${PASS_LABELS[pass.type]} does not admit to this event.`);
    return deny(`${PASS_LABELS[pass.type]} is not valid on day ${event.day}.`);
  }

  // Capacity: ticket holders are guaranteed a seat until the hold time.
  const venue = f.venues.find(v => v.id === event.venueId)!;
  const inside = f.checkIns.filter(c => c.eventId === eventId && c.allowed).length;
  const ticketHeld = hasTicket && toMinutes(at) <= toMinutes(addMinutes(event.start, -TICKET_HOLD_MIN));
  if (inside >= venue.capacity && !ticketHeld) return deny('Event is full.');

  return {
    allowed: true,
    reason: hasTicket ? 'Valid ticket.' : `${PASS_LABELS[pass.type]} admits.`,
    personName: person.name,
    via: hasTicket ? 'Ticket' : PASS_LABELS[pass.type],
  };
}

/** Record a scan into the festival state (used by check-in). */
export function recordScan(f: Festival, qr: string, eventId: string, at: string): ScanResult {
  const res = checkScan(f, qr, eventId, at);
  const personId = parseQr(qr);
  if (personId) {
    f.checkIns.push({ id: `c-${f.checkIns.length + 1}`, personId, eventId, at, allowed: res.allowed });
  }
  return res;
}
