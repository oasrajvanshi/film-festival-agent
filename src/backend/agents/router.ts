// The router decides which agent handles a trigger. Typed feed events are
// routed by rules; free-text messages go through the inbound reader (model
// classification, then server checks). One trigger can fan out: a snow
// forecast goes to the weather desk and also re-checks every guest who is
// still travelling, because snow slows their trips too.

import type { Fact, Iso, Trigger } from '../domain/types';
import type { FestivalView } from '../domain/view';
import type { Audit } from '../engine/audit';
import type { Llm } from '../llm/ollama';
import { summarizeSnow } from '../model/snow';
import { readInbound, type InboundReading } from './inbound';

export type Route =
  | { to: 'weather'; reason: string }
  | { to: 'guest'; guestId: string; sessionId?: string; reason: string }
  | { to: 'guest_sweep'; reason: string }
  | { to: 'review'; reason: string }
  | { to: 'none'; reason: string };

export interface Routing { routes: Route[]; via: 'rules' | 'llm'; inbound?: InboundReading; facts: { guestId: string; fact: Fact }[] }

export async function route(t: Trigger, v: FestivalView, now: Iso, llm: Llm | Llm[] | null, audit: Audit): Promise<Routing> {
  const r = (routes: Route[], via: Routing['via'] = 'rules', extra: Partial<Routing> = {}): Routing => ({ routes, via, facts: [], ...extra });
  switch (t.type) {
    case 'weather_update':
    case 'weather_poll': {
      const snow = summarizeSnow(v.state.conditions.forecast, v.info, now);
      if (!snow.crossed) return r([{ to: 'weather', reason: snow.level === 'none' ? 'Forecast update: no snow' : `Snow under the ${snow.threshold} in line: watch only` }]);
      return r([
        { to: 'weather', reason: `Snow ${snow.totalIn} in, over the ${snow.threshold} in line` },
        { to: 'guest_sweep', reason: 'Snow slows travel: re-check guests still on the way' },
      ]);
    }
    case 'shuttle_update': {
      const snow = summarizeSnow(v.state.conditions.forecast, v.info, now);
      return r([snow.crossed ? { to: 'weather', reason: `Shuttle ${t.routeId} is ${t.delayMin} min late during snow` } : { to: 'none', reason: 'Shuttle delay outside snow: logged' }]);
    }
    case 'flight_update': {
      const norm = (f?: string) => f?.replace(/\s+/g, '').toUpperCase();
      const g = v.data.guests.find(x => x.trips.some(tr => norm(tr.flight) === norm(t.flight.flight)));
      return r([g ? { to: 'guest', guestId: g.id, reason: `Flight ${t.flight.flight} ${t.flight.status}` } : { to: 'none', reason: `No guest on flight ${t.flight.flight}` }]);
    }
    case 'guest_checkin': {
      // A backup arriving changes the options for the guest they cover.
      const covered = v.callsFor(t.guestId).filter(c => c.role === 'backup')
        .flatMap(c => v.callsForSession(c.sessionId).filter(x => x.role === 'speaker' && x.guestId !== t.guestId).map(x => ({ guestId: x.guestId, sessionId: c.sessionId })))
        .filter(x => v.state.decisions.some(d => d.status === 'open' && d.key === `guest:${x.guestId}:${x.sessionId}`));
      const own = v.state.decisions.some(d => d.status === 'open' && d.key.startsWith(`guest:${t.guestId}:`));
      const routes: Route[] = [
        ...covered.map(x => ({ to: 'guest' as const, guestId: x.guestId, sessionId: x.sessionId, reason: `Backup ${v.name(t.guestId)} checked in` })),
        ...(own ? [{ to: 'guest' as const, guestId: t.guestId, reason: `${v.name(t.guestId)} checked in` }] : []),
      ];
      return r(routes.length ? routes : [{ to: 'none', reason: `${v.name(t.guestId)} checked in` }]);
    }
    case 'inbound_message': {
      const reading = await readInbound(llm, v, t, now, audit);
      if (reading.fact && reading.guestId) {
        return r([{ to: 'guest', guestId: reading.guestId, reason: reading.reason }], reading.via, { inbound: reading, facts: [{ guestId: reading.guestId, fact: reading.fact }] });
      }
      return r([{ to: 'review', reason: reading.reason }], reading.via, { inbound: reading });
    }
    case 'recheck':
      if (t.scope === 'guest' && t.ref) return r([{ to: 'guest', guestId: t.ref, reason: 'Scheduled re-check' }]);
      return r([{ to: 'weather', reason: 'Scheduled re-check' }]);
  }
}
