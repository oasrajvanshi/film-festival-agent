// Scenario files: a timeline of feed events and staff decisions, plus the
// outcomes we expect. They drive the CLI demo, the API demo route and the
// tests. Times are "HH:MM" on the festival day. Format: docs/scenarios.md.

import type { ActionKind, DecisionStatus, Forecast, FlightStatus, OpsState, OptionKey, Trigger } from './domain/types';
import { at as atTime } from './domain/time';
import { isDecisionError } from './engine/decisions';
import type { OpsBackend, RunReport } from './service';

export interface ForecastInput { source: string; issued: string; hourly: Record<string, number>; alerts?: { event: string; start: string; end: string }[] }
export interface FlightInput { flight: string; status: FlightStatus['status']; scheduled?: string; estimated?: string; source?: string }

export type TriggerInput =
  | { type: 'weather_update'; forecast: ForecastInput }
  | { type: 'weather_poll' }
  | { type: 'flight_update'; flight: FlightInput }
  | { type: 'shuttle_update'; routeId: string; delayMin: number }
  | { type: 'guest_checkin'; guestId: string; place: string }
  | { type: 'inbound_message'; channel: 'email' | 'sms'; from: string; text: string };

export interface DecideStep { key: string; option?: OptionKey | 'recommended'; by: string; action?: 'approve' | 'reject'; stale?: boolean; expect?: 'ok' | 'conflict' | 'forbidden' }

export interface ScenarioStep { at: string; note?: string; trigger?: TriggerInput; decide?: DecideStep; tick?: boolean }

export type Expectation =
  | { type: 'decision'; key: string; label: string; status?: DecisionStatus; rule?: OptionKey; chosen?: OptionKey; chosenVia?: 'human' | 'deadline'; factConfirmed?: boolean }
  | { type: 'decision_count'; prefix: string; label: string; count: number }
  | { type: 'outbox'; label: string; template?: string; kind?: ActionKind; count?: number; max?: number; notBefore?: string }
  | { type: 'flag'; label: string; contains: string }
  | { type: 'review'; label: string; count: number }
  | { type: 'step'; label: string; index: number; result: 'ok' | 'conflict' | 'forbidden' };

export interface ScenarioFile {
  name: string;
  title: string;
  description: string;
  /** Festival day (1, 2 or 3); times in the file are on that day. */
  day: number;
  start: string;
  setup?: { forecast?: ForecastInput; shuttleDelays?: Record<string, number>; checkIns?: { guestId: string; at: string; place: string }[]; flights?: FlightInput[] };
  steps: ScenarioStep[];
  expect: Expectation[];
}

export interface StepResult {
  index: number;
  at: string;
  note?: string;
  kind: 'trigger' | 'decide' | 'tick';
  reports: RunReport[];
  decide?: { id?: string; title?: string; option?: string; by: string; result: 'ok' | 'conflict' | 'forbidden' | 'not_found' | 'bad_request'; message?: string };
}

export interface ScenarioResult {
  name: string;
  title: string;
  steps: StepResult[];
  checks: { label: string; pass: boolean; detail: string }[];
  passed: boolean;
  state: OpsState;
}

export function forecastFrom(date: string, f: ForecastInput): Forecast {
  return {
    source: f.source, issuedAt: atTime(date, f.issued),
    hourly: Object.entries(f.hourly).map(([h, snowIn]) => ({ hour: atTime(date, h), snowIn })),
    alerts: (f.alerts ?? []).map(a => ({ event: a.event, start: atTime(date, a.start), end: atTime(date, a.end) })),
  };
}

export function flightFrom(date: string, f: FlightInput, updated: string): FlightStatus {
  return {
    flight: f.flight, status: f.status, source: f.source ?? 'mock flight feed', updatedAt: updated,
    scheduledArrival: f.scheduled ? atTime(date, f.scheduled) : undefined, estimatedArrival: f.estimated ? atTime(date, f.estimated) : undefined,
  };
}

export function triggerFrom(date: string, input: TriggerInput, at: string): Trigger {
  switch (input.type) {
    case 'weather_update': return { type: 'weather_update', at, forecast: forecastFrom(date, input.forecast) };
    case 'flight_update': return { type: 'flight_update', at, flight: flightFrom(date, input.flight, at) };
    default: return { ...input, at } as Trigger;
  }
}

export async function runScenario(backend: OpsBackend, file: ScenarioFile, onStep?: (s: StepResult) => void | Promise<void>): Promise<ScenarioResult> {
  const date = backend.data.info.dates[file.day];
  if (!date) throw new Error(`Scenario ${file.name}: day ${file.day} is not on the Festival tab`);
  await backend.reset(atTime(date, file.start));
  if (file.setup) {
    const setup = file.setup;
    await backend.seed(s => {
      if (setup.forecast) s.conditions.forecast = forecastFrom(date, setup.forecast);
      Object.assign(s.conditions.shuttleDelays, setup.shuttleDelays ?? {});
      for (const c of setup.checkIns ?? []) s.conditions.checkIns[c.guestId] = { at: atTime(date, c.at), place: c.place };
      for (const f of setup.flights ?? []) s.conditions.flights[f.flight] = flightFrom(date, f, s.clock);
    });
  }
  const steps: StepResult[] = [];
  for (const [index, step] of file.steps.entries()) {
    const at = atTime(date, step.at);
    let res: StepResult;
    if (step.trigger) {
      res = { index, at, note: step.note, kind: 'trigger', reports: await backend.ingest(triggerFrom(date, step.trigger, at)) };
    } else if (step.decide) {
      const d = step.decide;
      const state = await backend.state();
      const matches = state.decisions.filter(x => x.key.startsWith(d.key));
      const target = matches.find(x => x.status === 'open') ?? matches[matches.length - 1];
      res = { index, at, note: step.note, kind: 'decide', reports: [], decide: { by: d.by, result: 'not_found' } };
      if (target) {
        const option = d.option === 'recommended' || !d.option ? target.agentRecommendation.key : d.option;
        res.decide = { id: target.id, title: target.title, option, by: d.by, result: 'ok' };
        try {
          const out = await backend.decide(target.id, { action: d.action ?? 'approve', option, by: d.by, version: d.stale ? 1 : target.version, at });
          res.reports = out.reports;
        } catch (e) {
          if (!isDecisionError(e)) throw e;
          res.decide.result = e.code;
          res.decide.message = e.message;
        }
      }
    } else {
      res = { index, at, note: step.note, kind: 'tick', reports: await backend.tick(at) };
    }
    steps.push(res);
    await onStep?.(res);
  }
  const state = await backend.state();
  const checks = file.expect.map(e => check(e, state, steps, date));
  return { name: file.name, title: file.title, steps, checks, passed: checks.every(c => c.pass), state };
}

function check(e: Expectation, s: OpsState, steps: StepResult[], date: string): { label: string; pass: boolean; detail: string } {
  const ok = (pass: boolean, detail: string) => ({ label: e.label, pass, detail });
  switch (e.type) {
    case 'decision': {
      const d = [...s.decisions].reverse().find(x => x.key.startsWith(e.key) && x.status !== 'superseded');
      if (!d) return ok(false, `no decision with key ${e.key}`);
      const problems: string[] = [];
      if (e.status && d.status !== e.status) problems.push(`status ${d.status}, expected ${e.status}`);
      if (e.rule && d.ruleRecommendation !== e.rule) problems.push(`rule picked ${d.ruleRecommendation}, expected ${e.rule}`);
      if (e.chosen && d.chosen?.key !== e.chosen) problems.push(`chosen ${d.chosen?.key ?? 'none'}, expected ${e.chosen}`);
      if (e.chosenVia && d.chosen?.via !== e.chosenVia) problems.push(`chosen via ${d.chosen?.via ?? 'none'}, expected ${e.chosenVia}`);
      if (e.factConfirmed && !d.facts.some(f => f.key === 'reported_eta' && f.confirmedBy)) problems.push('reported ETA not confirmed by a person');
      return ok(!problems.length, problems.join('; ') || `${d.id} ${d.status}${d.chosen ? `, option ${d.chosen.key} by ${d.chosen.by}` : ''}; model picked ${d.agentRecommendation.key} (${d.agentRecommendation.via})`);
    }
    case 'decision_count': {
      const n = s.decisions.filter(x => x.key.startsWith(e.prefix) && x.status !== 'superseded').length;
      return ok(n === e.count, `${n} decision(s) with key ${e.prefix}`);
    }
    case 'outbox': {
      const items = s.outbox.filter(o => (!e.template || o.template === e.template) && (!e.kind || o.kind === e.kind));
      const problems: string[] = [];
      if (e.count !== undefined && items.length !== e.count) problems.push(`${items.length} message(s), expected ${e.count}`);
      if (e.max !== undefined && items.length > e.max) problems.push(`${items.length} message(s), at most ${e.max} allowed`);
      if (e.notBefore) {
        const early = items.filter(o => o.at < atTime(date, e.notBefore!));
        if (early.length) problems.push(`${early.length} sent before ${e.notBefore}`);
      }
      return ok(!problems.length, problems.join('; ') || `${items.length} message(s)`);
    }
    case 'flag': {
      const f = s.flags.find(x => x.text.includes(e.contains));
      return ok(!!f, f ? f.text : `no flag contains "${e.contains}"`);
    }
    case 'review': {
      const n = s.review.length;
      return ok(n === e.count, `${n} message(s) waiting for a person`);
    }
    case 'step': {
      const st = steps[e.index];
      const r = st?.decide?.result;
      return ok(r === e.result, `step ${e.index + 1}: ${r ?? 'not a decision step'}${st?.decide?.message ? ` (${st.decide.message})` : ''}`);
    }
  }
}
