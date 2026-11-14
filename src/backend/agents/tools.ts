// The tools the agents can call. Three kinds:
//   read      look up sheets and live feeds
//   analysis  run the models and playbooks (rules) and return costed options
//   propose   submit_decision: pick an option and say why
// There is deliberately no "send" tool: the model cannot message anyone.
// Outbound steps come only from playbook options, after a person approves.

import type { DecisionCandidate, Iso, OptionKey, PlannedAction } from '../domain/types';
import { addMinutes, clock, isBefore, span } from '../domain/time';
import type { FestivalView } from '../domain/view';
import type { Integrations } from '../integrations';
import { assess, backupsFor, STATUS_WORDS, type Assessment } from '../model/eta';
import { demandWindows, shuttleLoad } from '../model/shuttle';
import { TRAVEL_FACTORS, type SnowSummary } from '../model/snow';
import { planGuest, upcomingCalls } from '../playbooks/guest';
import type { LaterItem, Plan } from '../playbooks/plan';
import { planWeather, shuttleDelays } from '../playbooks/weather';
import type { ToolSpec } from '../llm/ollama';
import type { JsonSchema } from './schema';

export interface Scratch {
  candidates: Map<string, DecisionCandidate>;
  submitted: Map<string, { key: OptionKey; rationale: string; via: 'llm' | 'rules' }>;
  autoActions: PlannedAction[];
  later: LaterItem[];
  notes: string[];
  assessments: Assessment[];
  /** Every tool output, for checking that the model's reasons use real facts. */
  evidence: string[];
  planned: boolean;
}

export const newScratch = (): Scratch => ({
  candidates: new Map(), submitted: new Map(), autoActions: [], later: [], notes: [], assessments: [], evidence: [], planned: false,
});

export interface ToolCtx { view: FestivalView; now: Iso; snow: SnowSummary; integrations: Integrations; scratch: Scratch; brief: string }

export interface Tool {
  name: string;
  kind: 'read' | 'analysis' | 'propose';
  description: string;
  parameters: JsonSchema & { type: 'object' };
  run(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> | unknown;
}

export function toolSpec(t: Tool): ToolSpec {
  return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown> } };
}

const none = { type: 'object' as const, properties: {} };

function mergePlan(ctx: ToolCtx, plan: Plan) {
  const s = ctx.scratch;
  s.planned = true;
  for (const c of plan.candidates) s.candidates.set(c.ref, c);
  const seen = new Set(s.autoActions.map(a => a.key));
  for (const a of plan.autoActions) if (!a.key || !seen.has(a.key)) s.autoActions.push(a);
  for (const l of plan.later) if (!s.later.some(x => x.key === l.key)) s.later.push(l);
  s.notes.push(...plan.notes);
}

function describePlan(ctx: ToolCtx, plan: Plan) {
  return {
    decisions: plan.candidates.map(c => ({
      decision_ref: c.ref, title: c.title, why: c.why, owner: c.owner, due: clock(c.deadline),
      options: c.options.map(o => ({
        key: o.key, title: o.title, pros: o.pros, cons: o.cons,
        cost: { people_affected: o.cost.people, messages: o.cost.messages, money_usd: o.cost.money, reversible: o.cost.reversible },
      })),
      rule_recommendation: c.ruleRecommendation, rule_reason: c.ruleReason,
    })),
    automatic_steps: plan.autoActions.map(a => a.summary),
    watching: plan.later.map(l => l.text),
    notes: plan.notes,
    next: plan.candidates.length ? 'Call submit_decision once for each decision_ref.' : 'No decision is needed now. Reply DONE.',
  };
}

const sessionOut = (v: FestivalView, s: ReturnType<FestivalView['sessions']>[number]) => ({
  id: s.id, title: s.title, kind: s.kind, venue: v.placeName(s.venueId), room: s.room ?? null,
  start: clock(s.start), end: clock(s.end), outdoor: s.outdoor, people_with_it_in_plan: s.expected, guests: s.guestIds.map(g => v.name(g)),
});

const assessmentOut = (a: Assessment) => ({
  session_id: a.sessionId, session: a.sessionTitle, role: a.role,
  call_time: a.callTime ? clock(a.callTime) : 'not on the sheet', start: clock(a.start),
  status: a.status, status_words: STATUS_WORDS[a.status],
  eta: a.eta ? { earliest: clock(a.eta.early), likely: clock(a.eta.likely), latest: clock(a.eta.late), source: a.eta.source } : null,
  minutes_spare_in_worst_case: a.slackMin ?? null, basis: a.basis,
});

// ---------------------------------------------------------------- weather tools

export const getForecast: Tool = {
  name: 'get_forecast', kind: 'read',
  description: 'Snow forecast for the rest of the festival day: snow window, total inches, peak rate, whether it is over the threshold, and how much slower travel gets.',
  parameters: none,
  run: ({ snow }) => ({
    source: snow.source ?? 'none', issued: snow.issuedAt ? clock(snow.issuedAt) : null,
    snow: snow.start && snow.end ? span(snow.start, snow.end) : 'none', total_in: snow.totalIn, peak_in_per_hour: snow.peakInHr,
    level: snow.level, threshold_in: snow.threshold, over_threshold: snow.crossed,
    travel_time_factor: TRAVEL_FACTORS[snow.level], alert: snow.alert ?? null,
  }),
};

export const listSessions: Tool = {
  name: 'list_sessions', kind: 'read',
  description: 'Sessions that overlap a time window (default: the snow window, or now to the end of the day). Times like "2:00 pm".',
  parameters: { type: 'object', properties: { from: { type: 'string', description: 'Start of window, e.g. "2:00 pm"' }, to: { type: 'string', description: 'End of window, e.g. "7:00 pm"' } } },
  run: ({ view, now, snow }, args) => {
    const parse = (x: unknown, d: Iso) => {
      const m = typeof x === 'string' ? x.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i) : null;
      if (!m) return d;
      let h = Number(m[1]); const ap = m[3]?.toLowerCase();
      if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
      return `${now.slice(0, 10)}T${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
    };
    const from = parse(args.from, snow.start ?? now), to = parse(args.to, snow.end ?? `${now.slice(0, 10)}T23:59`);
    return view.sessions().filter(s => s.status === 'scheduled' && isBefore(s.start, to) && isBefore(from, s.end)).slice(0, 20).map(s => sessionOut(view, s));
  },
};

export const getShuttleStatus: Tool = {
  name: 'get_shuttle_status', kind: 'read',
  description: 'Each shuttle route: how late it runs (from the feed, or estimated from the snow), expected riders from saved plans, seats, and load.',
  parameters: none,
  run: ({ view, now, snow }) => shuttleDelays(view, snow).map(({ route, delay, reported }) => ({
    id: route.id, name: route.name, delay_min: delay, delay_source: reported ? 'shuttle feed' : 'snow model',
    windows: (snow.start && snow.end ? demandWindows(view, route, snow.start, snow.end) : []).filter(d => isBefore(now, d.to)).map(d => {
      const l = shuttleLoad(route, d, delay);
      return { window: span(d.from, d.to), expected_riders: l.riders, riders_from: d.source === 'sheet' ? 'Shuttle demand tab' : 'saved plans', seats: l.capacity, load_pct: Math.round(l.load * 100) };
    }),
    extra_bus: { cost_usd: route.extraBusCost, notice_min: route.extraBusLeadMin, vendor: route.vendor },
  })),
};

export const planWeatherOptions: Tool = {
  name: 'plan_weather_options', kind: 'analysis',
  description: 'Run the snow playbook. Returns the decisions staff must make now, each with options, costs and the rule recommendation, plus the internal steps that run automatically.',
  parameters: none,
  run: ctx => {
    const plan = planWeather(ctx.view, ctx.now);
    mergePlan(ctx, plan);
    return describePlan(ctx, plan);
  },
};

// ---------------------------------------------------------------- guest tools

export const getGuest: Tool = {
  name: 'get_guest', kind: 'read',
  description: 'A guest by id or name: role, travel plan, whether they can join by video, and their upcoming calls.',
  parameters: { type: 'object', properties: { guest: { type: 'string', description: 'Guest id or name' } }, required: ['guest'] },
  run: ({ view, now }, args) => {
    const g = view.findGuest(String(args.guest));
    if (!g) throw new Error(`No guest matches "${args.guest}". Guests: ${view.data.guests.map(x => `${x.id} ${x.name}`).join(', ')}`);
    const trip = view.travelFor(g, view.dayOf(now));
    return {
      id: g.id, name: g.name, badge: g.role, remote_ok: g.remoteOk, assistant: g.assistant?.name ?? null,
      checked_in: view.state.conditions.checkIns[g.id] ? clock(view.state.conditions.checkIns[g.id].at) : null,
      travel_today: { mode: trip.mode, flight: trip.flight ?? null, from: trip.from ? view.placeName(trip.from) : null,
        scheduled_arrival: trip.arrival ? clock(trip.arrival) : null, pickup: trip.pickupAt ? clock(trip.pickupAt) : null },
      reported_eta: view.state.conditions.reportedEtas[g.id] ? { time: clock(view.state.conditions.reportedEtas[g.id].value), quote: view.state.conditions.reportedEtas[g.id].source.quote } : null,
      upcoming_calls_today: upcomingCalls(view, g.id, now).filter(c => view.session(c.sessionId)!.day === view.dayOf(now)).map(c => {
        const s = view.session(c.sessionId)!;
        return { session_id: s.id, title: s.title, kind: s.kind, role: c.role, call_time: c.callTime ? `${clock(c.callTime)}${c.callSource === 'default' ? ' (default)' : ''}` : 'not on the sheet', start: clock(s.start), venue: view.placeName(s.venueId) };
      }),
    };
  },
};

export const getFlightStatus: Tool = {
  name: 'get_flight_status', kind: 'read',
  description: 'Latest status of a flight from the flight feed.',
  parameters: { type: 'object', properties: { flight: { type: 'string', description: 'Flight number, e.g. UA512' } }, required: ['flight'] },
  run: async ({ view, now, integrations }, args) => {
    const flight = String(args.flight).replace(/\s+/g, '').toUpperCase();
    const trip = view.data.guests.flatMap(g => g.trips).find(t => t.flight?.replace(/\s+/g, '').toUpperCase() === flight);
    if (!trip) throw new Error(`No guest is booked on ${flight}`);
    let st = view.state.conditions.flights[trip.flight!];
    if (integrations.flights) {
      const live = await integrations.flights.status(trip.flight!, view.info, now);
      if (live) { st = live; view.state.conditions.flights[trip.flight!] = live; }
    }
    if (!st) return { flight, status: 'scheduled', arrival: trip.arrival ? clock(trip.arrival) : null, source: 'schedule (no feed update)' };
    return { flight, status: st.status, scheduled: st.scheduledArrival ? clock(st.scheduledArrival) : null, estimated: st.estimatedArrival ? clock(st.estimatedArrival) : null, source: st.source, updated: clock(st.updatedAt) };
  },
};

export const estimateGuestEta: Tool = {
  name: 'estimate_guest_eta', kind: 'analysis',
  description: 'ETA range (earliest, likely, latest) for a guest to each upcoming call, using check-ins, reported ETAs, the flight feed and the snow travel model. Status is one of on_track, at_risk, likely_late, will_miss_start, here, unknown.',
  parameters: { type: 'object', properties: { guest_id: { type: 'string' }, session_id: { type: 'string', description: 'Optional: one session only' } }, required: ['guest_id'] },
  run: ({ view, now, snow, scratch }, args) => {
    const g = view.findGuest(String(args.guest_id));
    if (!g) throw new Error(`Unknown guest ${args.guest_id}`);
    const calls = upcomingCalls(view, g.id, now, args.session_id ? String(args.session_id) : undefined);
    const out = calls.map(c => assess(view, c, now, snow));
    scratch.assessments.push(...out);
    return { guest: g.name, assessments: out.map(assessmentOut) };
  },
};

export const findBackups: Tool = {
  name: 'find_backups', kind: 'analysis',
  description: 'Who could step in for a session: backups named on the call sheet first, then other guests who are free at that time and nearby. Says whether each is at the venue and when they could arrive.',
  parameters: { type: 'object', properties: { session_id: { type: 'string' } }, required: ['session_id'] },
  run: ({ view, now, snow }, args) => {
    const s = view.session(String(args.session_id));
    if (!s) throw new Error(`Unknown session ${args.session_id}`);
    return backupsFor(view, s.id, now, snow).map(b => ({
      guest_id: b.guestId, name: b.name, badge: b.badge, named_on_call_sheet: b.designated, at_the_venue: b.here,
      can_arrive_by: b.canArrive ? clock(b.canArrive) : null, basis: b.basis,
    }));
  },
};

export const checkDelayImpact: Tool = {
  name: 'check_delay_impact', kind: 'analysis',
  description: 'What delaying a session by N minutes would do: new times, ticket holders who wait, and whether it runs into the next session in the same room.',
  parameters: { type: 'object', properties: { session_id: { type: 'string' }, minutes: { type: 'integer' } }, required: ['session_id', 'minutes'] },
  run: ({ view }, args) => {
    const s = view.session(String(args.session_id));
    if (!s) throw new Error(`Unknown session ${args.session_id}`);
    const n = Number(args.minutes);
    const newEnd = addMinutes(s.end, n);
    const next = view.nextInRoom(s);
    return {
      session: s.title, new_start: clock(addMinutes(s.start, n)), new_end: clock(newEnd), people_waiting: s.expected,
      next_in_room: next ? { title: next.title, start: clock(next.start) } : null, runs_into_next: !!next && isBefore(next.start, newEnd),
    };
  },
};

export const planGuestOptions: Tool = {
  name: 'plan_guest_options', kind: 'analysis',
  description: 'Run the late-guest playbook for one guest. Returns the decisions staff must make now, each with options, costs and the rule recommendation.',
  parameters: { type: 'object', properties: { guest_id: { type: 'string' }, session_id: { type: 'string', description: 'Optional: one session only' } }, required: ['guest_id'] },
  run: (ctx, args) => {
    const g = ctx.view.findGuest(String(args.guest_id));
    if (!g) throw new Error(`Unknown guest ${args.guest_id}`);
    const plan = planGuest(ctx.view, g.id, ctx.now, ctx.snow, args.session_id ? String(args.session_id) : undefined);
    ctx.scratch.assessments.push(...plan.assessments);
    mergePlan(ctx, plan);
    return describePlan(ctx, plan);
  },
};

// ---------------------------------------------------------------- propose

/** Times and numbers in the model's reason must appear in the tool results it saw. */
export function ungrounded(text: string, evidence: string): string[] {
  const times = text.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  const rest = text.replace(/\b\d{1,2}:\d{2}\b/g, ' ');
  const numbers = (rest.match(/\b\d+(?:\.\d+)?\b/g) ?? []).filter(t => t.length > 1);
  return [...new Set([...times, ...numbers])].filter(t => !evidence.includes(t));
}

export const submitDecision: Tool = {
  name: 'submit_decision', kind: 'propose',
  description: 'Record your recommendation for one decision_ref returned by a plan tool. Pick one of its option keys and give a one or two sentence reason using only facts from the tool results. Staff still approve.',
  parameters: {
    type: 'object',
    properties: {
      decision_ref: { type: 'string' },
      recommended_option: { type: 'string', enum: ['A', 'B', 'C'] },
      rationale: { type: 'string', description: 'One or two sentences, only facts from tool results' },
    },
    required: ['decision_ref', 'recommended_option', 'rationale'],
  },
  run: ({ scratch, brief }, args) => {
    const ref = String(args.decision_ref);
    const c = scratch.candidates.get(ref);
    if (!c) throw new Error(`Unknown decision_ref "${ref}". Valid: ${[...scratch.candidates.keys()].join(', ') || 'none yet; call a plan tool first'}`);
    const key = String(args.recommended_option) as OptionKey;
    if (!c.options.some(o => o.key === key)) throw new Error(`Option ${key} does not exist for ${ref}. Options: ${c.options.map(o => o.key).join(', ')}`);
    const rationale = String(args.rationale).trim().slice(0, 600);
    const bad = ungrounded(rationale, scratch.evidence.join(' ') + ' ' + brief);
    if (bad.length) throw new Error(`Your reason mentions ${bad.join(', ')}, which is not in any tool result. Resubmit using only facts from the tool results.`);
    scratch.submitted.set(ref, { key, rationale, via: 'llm' });
    const remaining = [...scratch.candidates.keys()].filter(r => !scratch.submitted.has(r));
    return { ok: true, remaining, next: remaining.length ? `Submit ${remaining.join(', ')}` : 'All decisions submitted. Reply DONE.' };
  },
};

export const WEATHER_TOOLS: Tool[] = [getForecast, listSessions, getShuttleStatus, planWeatherOptions, submitDecision];
export const GUEST_TOOLS: Tool[] = [getGuest, getFlightStatus, estimateGuestEta, findBackups, checkDelayImpact, planGuestOptions, submitDecision];
