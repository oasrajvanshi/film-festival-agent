// Snow playbook. Reads the forecast, sessions and shuttles and proposes:
//   - the weather notice to pass holders (Comms decides)
//   - an extra bus on any route that is late or loaded (Transport decides)
//   - moving outdoor sessions indoors (Operations decides)
// and runs the internal steps on its own: dashboard flag, door and shuttle
// briefs, heads-up to Transport.

import type { DecisionCandidate, Fact, Iso, PlannedAction, Trigger } from '../domain/types';
import { addMinutes, clock, isBefore, maxIso, minIso, minutesBetween, span } from '../domain/time';
import type { FestivalView } from '../domain/view';
import { estimatedShuttleDelay, summarizeSnow, TRAVEL_FACTORS, type SnowSummary } from '../model/snow';
import { demandWindows, shuttleLoad } from '../model/shuttle';
import { clampDeadline, emptyPlan, keyed, propose, type Plan } from './plan';

export interface WeatherPlan extends Plan { snow: SnowSummary; tag: string }

const overlaps = (a0: Iso, a1: Iso, b0: Iso, b1: Iso) => isBefore(a0, b1) && isBefore(b0, a1);

export function snowTag(s: SnowSummary): string {
  return `${s.level}:${s.totalIn}:${s.start ?? ''}:${s.end ?? ''}`;
}

export function shuttleDelays(v: FestivalView, snow: SnowSummary) {
  return v.data.shuttles.map(r => {
    const reported = v.state.conditions.shuttleDelays[r.id];
    const delay = reported ?? (snow.level === 'none' ? 0 : estimatedShuttleDelay(r.everyMin, snow));
    return { route: r, delay, reported: reported !== undefined, basis: reported !== undefined ? `Shuttle feed: ${r.name} ${reported} min late` : `Snow model: ${r.name} about ${delay} min late` };
  });
}

export function planWeather(v: FestivalView, now: Iso): WeatherPlan {
  const snow = summarizeSnow(v.state.conditions.forecast, v.info, now);
  const tag = snowTag(snow);
  const plan: WeatherPlan = { ...emptyPlan(), snow, tag };
  if (snow.level === 'none' || !snow.start || !snow.end) {
    plan.notes.push('No snow in the forecast for the rest of the day.');
    return plan;
  }
  const snowSpan = span(snow.start, snow.end);
  const issued = snow.issuedAt ? `, issued ${clock(snow.issuedAt)}` : '';
  const forecastFact: Fact = { key: 'snow', value: `${snowSpan}, ${snow.totalIn} in`, source: { kind: 'feed', ref: snow.source ?? 'forecast', at: snow.issuedAt ?? now } };
  if (!snow.crossed) {
    plan.later.push({ key: 'weather:watch', level: 'grey', text: `Snow possible ${snowSpan}, about ${snow.totalIn} in. Under the ${snow.threshold} in line; watching the forecast.` });
    plan.notes.push('Under the snow threshold: watch only.');
    return plan;
  }

  const recheck: Trigger = { type: 'recheck', at: now, scope: 'weather' };
  const delays = shuttleDelays(v, snow);
  const late = delays.filter(d => d.reported && d.delay > 0);
  const shuttleNote = late.length ? `; ${late.map(d => `${d.route.name} is running about ${d.delay} min late`).join(', ')}` : '';

  // --- automatic, internal steps
  plan.autoActions.push({
    kind: 'flag', level: 'amber', key: `flag:snow:${tag}`,
    summary: `Snow ${snowSpan}, about ${snow.totalIn} in (${snow.source ?? 'forecast'}${issued}). Travel is slower: likely x${TRAVEL_FACTORS[snow.level].likely}, worst x${TRAVEL_FACTORS[snow.level].worst}.`,
  });
  const active = v.sessions().filter(s => s.status === 'scheduled' && isBefore(now, s.end) && overlaps(s.start, s.end, snow.start!, snow.end!));
  for (const venueId of [...new Set(active.map(s => s.venueId))]) {
    plan.autoActions.push({
      kind: 'update_brief', key: `brief:snow:door:${venueId}:${tag}`, to: [{ kind: 'team', id: 'door', venueId }],
      template: 'brief_snow_door', vars: { snowSpan, shuttleNote }, summary: `Snow brief for the door team at ${v.placeName(venueId)}`,
    });
  }
  if (v.data.shuttles.length) {
    plan.autoActions.push({
      kind: 'update_brief', key: `brief:snow:shuttle:${tag}`, to: [{ kind: 'team', id: 'operations' }],
      template: 'brief_snow_shuttle', vars: { snowSpan }, summary: 'Snow brief for shuttle drivers (through Operations)',
    });
  }

  // --- decision: weather notice to everyone with a pass or ticket today
  const day = v.dayOf(now);
  const segment = `day:${day}`;
  const holders = v.segment(segment)!;
  const noticeSent = v.state.outbox.some(o => o.template === 'weather_notice' && o.address === `segment:${segment}`);
  if (!noticeSent && isBefore(now, snow.end)) {
    const started = !isBefore(now, snow.start);
    const deadline = clampDeadline(started ? addMinutes(now, 15) : addMinutes(snow.start, -30), now);
    const minsToSnow = Math.max(0, minutesBetween(now, snow.start));
    const c: DecisionCandidate = {
      ref: 'weather_notice', key: `weather:notice:day${day}`, scenario: 'weather', owner: 'comms',
      title: 'Send the weather notice to pass and ticket holders',
      why: `Snow ${snowSpan}, about ${snow.totalIn} in: over the ${snow.threshold} in line. Only Comms can send it.`,
      options: keyed([
        {
          title: 'Send now as drafted',
          pros: started ? 'People still on the move hear about it now.' : `Reaches people before the snow starts at ${clock(snow.start)}.`,
          cons: 'A mass message cannot be taken back.',
          cost: { people: holders.count, messages: holders.count, money: 0, reversible: false },
          actions: [{
            kind: 'broadcast', summary: `Weather notice to ${holders.count} pass and ticket holders`, to: [{ kind: 'segment', id: segment }],
            channels: ['push', 'sms'], template: 'weather_notice', vars: { snowSpan, shuttleNote },
          }],
        },
        {
          title: started ? 'Hold for now' : 'Hold until the snow starts',
          pros: 'No message if the forecast changes.',
          cons: started ? 'People travel without a warning.' : `Most people plan after ${clock(snow.start)}, when roads are already slower.`,
          cost: { people: 0, messages: 0, money: 0, reversible: true },
          actions: [{ kind: 'watch', summary: `Re-check the forecast at ${clock(started ? addMinutes(now, 30) : snow.start)}`, watch: { at: started ? addMinutes(now, 30) : snow.start, trigger: recheck } }],
        },
      ]),
      ruleRecommendation: minsToSnow <= 180 ? 'A' : 'B',
      ruleReason: minsToSnow <= 180 ? `Snow starts within 3 hours (${clock(snow.start)}), and most people plan their afternoon now.` : 'Snow is more than 3 hours away; the forecast may still change.',
      facts: [forecastFact], deadline, state: tag,
    };
    propose(plan, c, now, recheck, `Weather notice will be needed by ${clock(deadline)}.`);
  }

  // --- decision: extra bus, only for routes that are late or loaded
  for (const { route, delay, reported, basis } of delays) {
    // Only the current or next window; later ones are re-checked by the watch timer.
    for (const d of demandWindows(v, route, snow.start, snow.end).filter(x => isBefore(now, x.to)).slice(0, 1)) {
      const load = shuttleLoad(route, d, delay);
      if (!(reported && delay > 0) && load.load < 0.75) continue;
      const withBus = shuttleLoad(route, d, delay, 1);
      const pct = Math.round(load.load * 100);
      const window = span(d.from, d.to);
      const deadline = clampDeadline(addMinutes(d.from, -route.extraBusLeadMin), now);
      const watchAt = minIso(addMinutes(maxIso(now, d.from), 30), d.to);
      const facts: Fact[] = [
        { key: 'shuttle_delay', value: `${delay} min`, source: { kind: reported ? 'feed' : 'rule', ref: reported ? 'shuttle feed' : 'snow model', at: now } },
        { key: 'expected_riders', value: String(load.riders), source: { kind: d.source === 'sheet' ? 'sheet' : 'rule', ref: d.source === 'sheet' ? `Shuttle demand tab, ${route.name} ${window}` : `saved plans, ${route.name} ${window}`, at: now } },
      ];
      const c: DecisionCandidate = {
        ref: `shuttle_${route.id}_${d.from.slice(11, 13)}`, key: `weather:shuttle:${route.id}:${d.from}`, scenario: 'weather', owner: 'operations',
        title: `Extra bus on ${route.name}, ${window}`,
        why: `${basis}. ${d.source === 'sheet' ? 'Expected' : 'Saved plans show'} ${load.riders} riders for ${load.capacity} seats (${pct}%).`,
        options: keyed([
          {
            title: 'Skip it and watch the load',
            pros: `${load.riders} riders for ${load.capacity} seats (${pct}%), even ${delay} min late.`,
            cons: 'If more people move than planned, waits get longer. You get a flag above 90%.',
            cost: { people: 0, messages: 0, money: 0, reversible: true },
            actions: [{ kind: 'watch', summary: `Re-check ${route.name} load at ${clock(watchAt)}`, watch: { at: watchAt, trigger: recheck } }],
          },
          {
            title: `Add one bus on ${route.name}`,
            pros: `Seats go to ${withBus.capacity} (${Math.round(withBus.load * 100)}%).`,
            cons: `$${route.extraBusCost}. ${route.vendor} needs ${route.extraBusLeadMin} min notice.`,
            cost: { people: 0, messages: 1, money: route.extraBusCost, reversible: true, note: `Can be cancelled until ${clock(deadline)}` },
            actions: [{
              kind: 'vendor_order', summary: `Order one extra bus from ${route.vendor}`, template: 'vendor_extra_bus', vars: { route: route.name, window },
              vendor: { vendor: route.vendor, item: `1 extra bus on ${route.name}, ${window}`, cost: route.extraBusCost },
            }],
          },
        ]),
        ruleRecommendation: load.load >= 0.9 ? 'B' : 'A',
        ruleReason: `Load is ${pct}%, ${load.load >= 0.9 ? 'at or above' : 'under'} the 90% line.`,
        facts, deadline, state: `${delay}:${load.riders}:${load.capacity}`,
      };
      propose(plan, c, now, recheck, `${route.name} may need an extra bus by ${clock(deadline)}.`);
      if (reported && delay > 0) {
        plan.autoActions.push({
          kind: 'staff_heads_up', key: `heads:transport:${route.id}:${delay}:${d.from}`, to: [{ kind: 'team', id: 'operations' }],
          template: 'transport_heads_up', vars: { route: route.name, delay: String(delay), riders: String(load.riders), capacity: String(load.capacity), window },
          summary: `Heads-up to Operations: ${route.name} ${delay} min late`,
        });
      }
    }
  }

  // --- decision: outdoor sessions in the snow window
  for (const s of v.sessions().filter(x => x.outdoor && x.status === 'scheduled' && isBefore(now, x.start) && overlaps(x.start, x.end, snow.start!, snow.end!))) {
    const venue = v.placeName(s.venueId);
    const setupBy = clock(addMinutes(s.start, -30));
    const moveIn = snow.level === 'moderate' || snow.level === 'heavy';
    const c: DecisionCandidate = {
      ref: `outdoor_${s.id}`, key: `weather:outdoor:${s.id}`, scenario: 'weather', owner: 'operations',
      title: `"${s.title}" is outdoors during the snow`,
      why: `${clock(s.start)} at ${venue}, ${s.expected} with it in their plan. Snow ${snowSpan}.`,
      options: keyed([
        {
          title: `Move it indoors at ${venue}`,
          pros: 'Guests and crews stay dry; no slip risk on the carpet.', cons: 'Smaller space; photographers need a new spot.',
          cost: { people: s.expected, messages: 0, money: 0, reversible: true },
          actions: [
            { kind: 'schedule_change', summary: `Mark "${s.title}" as indoor`, change: { sessionId: s.id, note: 'Indoor plan because of snow' } },
            { kind: 'update_brief', summary: `Brief the house team at ${venue}`, to: [{ kind: 'team', id: 'house_manager' }], template: 'outdoor_brief', vars: { session: s.title, venue, setupBy } },
          ],
        },
        {
          title: 'Keep it outdoors with covers and mats',
          pros: 'No change for guests or press.', cons: 'Slip risk and wet equipment if the snow is heavy.',
          cost: { people: 0, messages: 0, money: 0, reversible: true },
          actions: [{ kind: 'update_brief', summary: `Brief the house team at ${venue}`, to: [{ kind: 'team', id: 'house_manager' }], template: 'outdoor_keep', vars: { session: s.title, setupBy } }],
        },
      ]),
      ruleRecommendation: moveIn ? 'A' : 'B',
      ruleReason: moveIn ? `${snow.level} snow (peak ${snow.peakInHr} in/hr) at start time.` : 'Light snow only.',
      facts: [forecastFact], deadline: clampDeadline(addMinutes(s.start, -60), now), state: `${snow.level}`,
    };
    propose(plan, c, now, recheck, `"${s.title}" is outdoors at ${clock(s.start)} during the snow. Decision by ${clock(c.deadline)}.`);
  }
  return plan;
}
