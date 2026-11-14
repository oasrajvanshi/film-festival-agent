// Shuttle load: expected riders against seats the route can carry in a
// window, given how late the buses are running. Riders come from the
// Shuttle demand tab if it has a row, otherwise from saved plans: people
// whose next event is at another venue on the route.

import type { Iso, ShuttleDemand, ShuttleRoute } from '../domain/types';
import { addMinutes, isBefore, minutesBetween, toMinutes } from '../domain/time';
import type { FestivalView } from '../domain/view';

export interface ShuttleLoad { riders: number; capacity: number; load: number }

export function shuttleLoad(route: ShuttleRoute, demand: ShuttleDemand, delayMin: number, extraBuses = 0): ShuttleLoad {
  const hours = minutesBetween(demand.from, demand.to) / 60;
  const perHour = route.capacityPerHour + extraBuses * route.extraBusCapacityPerHour;
  const capacity = Math.round(perHour * hours * route.everyMin / (route.everyMin + Math.max(0, delayMin)));
  return { riders: demand.expectedRiders, capacity, load: capacity ? demand.expectedRiders / capacity : Infinity };
}

/** Trips between venues on the route that start in [from, to), from tickets and saved events. */
export function ridersFromPlans(v: FestivalView, route: ShuttleRoute, from: Iso, to: Iso): number {
  const day = v.dayOf(from);
  const stops = new Set(route.stops);
  const byId = new Map(v.sessions().map(s => [s.id, s]));
  let trips = 0;
  for (const a of v.data.audience) {
    const evs = a.eventIds.map(id => byId.get(id)!).filter(s => s && s.day === day && s.status === 'scheduled')
      .sort((x, y) => toMinutes(x.start) - toMinutes(y.start));
    for (let i = 0; i + 1 < evs.length; i++) {
      const [x, y] = [evs[i], evs[i + 1]];
      if (x.venueId !== y.venueId && stops.has(x.venueId) && stops.has(y.venueId) && !isBefore(x.end, from) && isBefore(x.end, to)) trips++;
    }
  }
  return trips;
}

/** Demand windows for a route over a span: sheet rows if any, else 2-hour windows from saved plans. */
export function demandWindows(v: FestivalView, route: ShuttleRoute, from: Iso, to: Iso): (ShuttleDemand & { source: 'sheet' | 'plans' })[] {
  const day = v.dayOf(from);
  const sheet = v.data.demand.filter(d => d.routeId === route.id && v.dayOf(d.from) === day && isBefore(d.from, to) && isBefore(from, d.to));
  if (sheet.length) return sheet.map(d => ({ ...d, source: 'sheet' as const }));
  const out: (ShuttleDemand & { source: 'plans' })[] = [];
  for (let t = from; isBefore(t, to); t = addMinutes(t, 120)) {
    const end = isBefore(addMinutes(t, 120), to) ? addMinutes(t, 120) : to;
    out.push({ routeId: route.id, from: t, to: end, expectedRiders: ridersFromPlans(v, route, t, end), source: 'plans' });
  }
  return out;
}
