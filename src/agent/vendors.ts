// Outside failures → the agent monitors vendor and partner feeds and drafts
// contingency messages. Sending them stays with a person.

import type { Festival } from '../core/types';
import { addMinutes, clock, toMinutes } from '../core/time';
import type { Action } from './approvals';

export type VendorAlert =
  | { type: 'flight_delay'; guestId: string; flight: string; newArrival: string; arrivalVenueMin: number }
  | { type: 'print_delay'; filmId: string; newEta: string }
  | { type: 'vendor_cancel'; vendor: string; service: string; day: number };

let seq = 0;

export function handleVendorAlert(f: Festival, alert: VendorAlert): Action[] {
  const actions: Action[] = [];
  if (alert.type === 'flight_delay') {
    const guest = f.people.find(p => p.id === alert.guestId);
    if (!guest) return actions;
    const reachable = addMinutes(alert.newArrival, alert.arrivalVenueMin);
    const atRisk = f.events.filter(e => e.status === 'scheduled' && e.guestIds.includes(guest.id)
      && toMinutes(e.start) < toMinutes(reachable) && toMinutes(e.end) > toMinutes(alert.newArrival) - 24 * 60);
    for (const e of atRisk) {
      actions.push({ id: `flag-${++seq}`, kind: 'flag', title: `${guest.name} may miss "${e.title}"`,
        rationale: `Flight ${alert.flight} now lands ${clock(alert.newArrival)}; earliest at venue ${clock(reachable)}; event starts ${clock(e.start)}.`,
        payload: { eventId: e.id, guestId: guest.id } });
      actions.push({ id: `vendor-${++seq}`, kind: 'vendor_contingency', title: `Draft: ask ${guest.name} to confirm arrival for "${e.title}"`,
        rationale: `Flight ${alert.flight} delayed.`,
        messages: [{ personId: guest.id, channel: guest.channels.includes('sms') ? 'sms' : 'email', subject: `Your arrival for ${e.title}`,
          body: `We see flight ${alert.flight} now lands at ${clock(alert.newArrival)}. "${e.title}" starts at ${clock(e.start)}. Please reply with your updated arrival time so guest relations can plan.` }] });
    }
  } else if (alert.type === 'print_delay') {
    const film = f.films.find(x => x.id === alert.filmId);
    const shows = f.events.filter(e => e.filmId === alert.filmId && e.kind === 'screening' && e.status === 'scheduled'
      && toMinutes(e.start) < toMinutes(addMinutes(alert.newEta, 60)));
    for (const e of shows) {
      actions.push({ id: `flag-${++seq}`, kind: 'flag', title: `Print for "${film?.title}" may miss ${clock(e.start)} screening`,
        rationale: `Delivery ETA ${clock(alert.newEta)}; tech check needs 60 minutes before start.`, payload: { eventId: e.id } });
    }
  } else {
    actions.push({ id: `vendor-${++seq}`, kind: 'vendor_contingency', title: `${alert.vendor} cancelled ${alert.service} on day ${alert.day}`,
      rationale: 'Vendor feed reported a cancellation. Operations should choose a replacement.', payload: alert });
  }
  return actions;
}
