// OpsBackend: the one entry point the HTTP routes, the CLI and the tests use.
//
//   trigger ─▶ fire due timers ─▶ update live conditions ─▶ router ─▶ agent(s) ─▶ commit
//                                                                    │
//        commit = run automatic steps (policy: internal only) + flags/timers for later
//                 + open decisions (with deadline timers) + close decisions no longer needed
//
// Every call is serialized and works on a loaded copy of the state, which is
// saved at the end, so concurrent requests cannot interleave.

import type { Decision, FestivalData, Iso, OpsState, OutboxItem, Trigger } from './domain/types';
import { clock, isBefore, maxIso } from './domain/time';
import { FestivalView } from './domain/view';
import { auditFor, nextId, type Audit } from './engine/audit';
import { decide as decideCore, onDeadline, upsertDecision, type DecideInput } from './engine/decisions';
import { execute } from './engine/executor';
import { gateFor } from './engine/policy';
import type { Store } from './engine/store';
import type { Integrations } from './integrations';
import { mockMessenger } from './integrations';
import type { Llm } from './llm/ollama';
import { summarizeSnow } from './model/snow';
import { planGuest } from './playbooks/guest';
import type { LaterItem } from './playbooks/plan';
import { runAgent, type AgentOutcome } from './agents/loop';
import { route, type Route } from './agents/router';
import { guestAgent, weatherAgent, type GuestCtx } from './agents/specs';
import { newScratch, type Scratch, type ToolCtx } from './agents/tools';

export interface AgentReport {
  agent: 'weather' | 'guest';
  subject?: string;
  via: 'llm' | 'rules';
  model?: string;
  llmCalls: number;
  llmMs: number;
  tools: { tool: string; ok: boolean; via: 'llm' | 'rules'; error?: string }[];
  error?: string;
}

export interface RunReport {
  runId: string;
  at: Iso;
  trigger: string;
  duplicate?: boolean;
  routes: Route[];
  routedBy?: 'rules' | 'llm';
  agents: AgentReport[];
  decisions: { id: string; title: string; change: 'created' | 'unchanged' | 'superseded' | 'closed'; recommended?: string; via?: string }[];
  automatic: string[];
  watching: string[];
  review: string[];
  deadlines: string[];
}

export interface BackendOptions {
  data: FestivalData;
  store: Store;
  /** One model, or several tried in order (Qwen, then Llama). */
  llm?: Llm | null;
  llms?: Llm[];
  integrations?: Integrations;
  warnings?: string[];
}

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

export function describeTrigger(t: Trigger, v: FestivalView): string {
  switch (t.type) {
    case 'weather_update': return `Forecast update from ${t.forecast.source}`;
    case 'weather_poll': return 'Forecast poll';
    case 'flight_update': return `Flight ${t.flight.flight}: ${t.flight.status}${t.flight.estimatedArrival ? `, lands ${clock(t.flight.estimatedArrival)}` : ''}`;
    case 'shuttle_update': return `Shuttle feed: ${v.data.shuttles.find(r => r.id === t.routeId)?.name ?? t.routeId} ${t.delayMin} min late`;
    case 'guest_checkin': return `${v.name(t.guestId)} checked in at ${t.place}`;
    case 'inbound_message': return `Inbound ${t.channel} from ${t.from}`;
    case 'recheck': return `Re-check (${t.scope}${t.ref ? ` ${v.name(t.ref)}` : ''})`;
  }
}

export class OpsBackend {
  readonly data: FestivalData;
  readonly warnings: string[];
  private llms: Llm[];
  private integrations: Integrations;
  private store: Store;
  private lock: Promise<unknown> = Promise.resolve();

  constructor(o: BackendOptions) {
    this.data = o.data;
    this.store = o.store;
    this.llms = o.llms ?? (o.llm ? [o.llm] : []);
    this.integrations = o.integrations ?? { messenger: mockMessenger };
    this.warnings = o.warnings ?? [];
  }

  get model(): string | null { return this.llms.length ? this.llms.map(m => m.model).join(' -> ') : null; }
  get models(): string[] { return this.llms.map(m => m.model); }
  setLlms(llms: Llm[]) { this.llms = llms; }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async mutate<T>(fn: (s: OpsState) => Promise<T>): Promise<T> {
    return this.serial(async () => {
      const s = await this.store.load();
      const before = s.outbox.length;
      const out = await fn(s);
      await this.store.save(s);
      await this.deliver(s, s.outbox.slice(before));
      return out;
    });
  }

  private async deliver(s: OpsState, items: OutboxItem[]) {
    if (!items.length || this.integrations.messenger.name === 'mock') return;
    const res = await this.integrations.messenger.deliver(items);
    let changed = false;
    for (const i of s.outbox) if (res[i.id] && res[i.id] !== i.delivered) { i.delivered = res[i.id]; changed = true; }
    if (changed) await this.store.save(s);
  }

  // ---------------------------------------------------------------- public API

  ingest(t: Trigger): Promise<RunReport[]> {
    return this.mutate(async s => {
      const fired = await this.advance(s, t.at);
      return [...fired, await this.process(s, t)];
    });
  }

  /** Move the festival clock forward and fire due deadlines and re-checks. */
  tick(at?: Iso): Promise<RunReport[]> {
    return this.mutate(async s => this.advance(s, at ?? s.clock));
  }

  decide(id: string, input: DecideInput & { at?: Iso }): Promise<{ decision: Decision; reports: RunReport[] }> {
    return this.mutate(async s => {
      const reports = input.at ? await this.advance(s, input.at) : [];
      const runId = nextId(s, 'run');
      const decision = decideCore(this.data, s, id, input, s.clock, auditFor(s, runId));
      return { decision, reports };
    });
  }

  async state(): Promise<OpsState> { return this.serial(() => this.store.load()); }

  reset(clockAt?: Iso): Promise<OpsState> {
    return this.serial(async () => {
      const s = await this.store.reset();
      if (clockAt) { s.clock = clockAt; await this.store.save(s); }
      return s;
    });
  }

  /** Seed live conditions directly (scenario setup), without routing. */
  seed(fn: (s: OpsState) => void): Promise<void> {
    return this.mutate(async s => { fn(s); });
  }

  // ---------------------------------------------------------------- internals

  private async advance(s: OpsState, to: Iso): Promise<RunReport[]> {
    const reports: RunReport[] = [];
    for (let guard = 0; guard < 200; guard++) {
      const due = s.timers.filter(t => !t.fired && !isBefore(to, t.at)).sort((a, b) => a.at.localeCompare(b.at))[0];
      if (!due) break;
      due.fired = true;
      s.clock = maxIso(s.clock, due.at);
      if (due.kind === 'deadline') {
        const d = s.decisions.find(x => x.id === due.ref);
        if (!d || d.status !== 'open') continue;
        const runId = nextId(s, 'run');
        const audit = auditFor(s, runId);
        audit('timer', `Deadline for ${d.id}: ${d.title}`);
        onDeadline(this.data, s, d, s.clock, audit);
        reports.push({ ...emptyReport(runId, s.clock, `Deadline: ${d.title}`), deadlines: [d.chosen ? `${d.id}: ran safe default ${d.chosen.key}` : `${d.id}: escalated, nothing ran`] });
      } else if (due.trigger) {
        reports.push(await this.process(s, { ...due.trigger, at: due.at, id: due.id }));
      }
    }
    s.clock = maxIso(s.clock, to);
    return reports;
  }

  private async process(s: OpsState, t: Trigger): Promise<RunReport> {
    const id = t.id ?? `${t.type}:${t.at}:${hash(JSON.stringify(t))}`;
    const runId = nextId(s, 'run');
    s.clock = maxIso(s.clock, t.at);
    const now = s.clock;
    const audit = auditFor(s, runId);
    const view = new FestivalView(this.data, s);
    const report = emptyReport(runId, now, describeTrigger(t, view));
    if (s.processed.includes(id)) {
      audit('trigger', `Duplicate ignored: ${report.trigger}`, { id });
      return { ...report, duplicate: true };
    }
    audit('trigger', report.trigger, { id, trigger: t.type === 'inbound_message' ? { ...t, text: `${t.text.length} chars` } : t });
    await this.applyTrigger(s, t, audit);

    const routing = await route(t, view, now, this.llms, audit);
    report.routes = routing.routes;
    report.routedBy = routing.via;
    audit('route', routing.routes.map(r => `${r.to}${'guestId' in r ? ` ${view.name(r.guestId)}` : ''}: ${r.reason}`).join(' | '), { via: routing.via, inbound: routing.inbound });
    for (const f of routing.facts) s.conditions.reportedEtas[f.guestId] = f.fact;

    for (const r of routing.routes) {
      if (r.to === 'weather') await this.runWeather(s, now, runId, audit, report);
      else if (r.to === 'guest') await this.runGuest(s, now, runId, audit, report, r.guestId, r.sessionId);
      else if (r.to === 'guest_sweep') await this.sweepGuests(s, now, runId, audit, report);
      else if (r.to === 'review' && t.type === 'inbound_message') this.toReview(s, t, r.reason, now, runId, audit, report);
    }
    s.processed.push(id);
    if (s.processed.length > 1000) s.processed.splice(0, s.processed.length - 1000);
    return report;
  }

  private async applyTrigger(s: OpsState, t: Trigger, audit: Audit) {
    const c = s.conditions;
    switch (t.type) {
      case 'weather_update': c.forecast = t.forecast; break;
      case 'weather_poll':
        if (!this.integrations.weather) { audit('error', 'No weather provider configured (set OPS_WEATHER=open-meteo)'); break; }
        c.forecast = await this.integrations.weather.forecast(this.data.info, t.at);
        audit('tool', `weather feed -> ${this.integrations.weather.name}: ${c.forecast.hourly.length} hours`);
        break;
      case 'flight_update': c.flights[t.flight.flight] = t.flight; break;
      case 'shuttle_update': c.shuttleDelays[t.routeId] = t.delayMin; break;
      case 'guest_checkin': c.checkIns[t.guestId] = { at: t.at, place: t.place }; break;
    }
  }

  private ctx(s: OpsState, now: Iso, brief: string): ToolCtx {
    const view = new FestivalView(this.data, s);
    return { view, now, snow: summarizeSnow(s.conditions.forecast, this.data.info, now), integrations: this.integrations, scratch: newScratch(), brief };
  }

  private async runWeather(s: OpsState, now: Iso, runId: string, audit: Audit, report: RunReport) {
    const ctx = this.ctx(s, now, '');
    const snow = ctx.snow;
    const delays = Object.entries(s.conditions.shuttleDelays).map(([id, d]) => `${this.data.shuttles.find(r => r.id === id)?.name ?? id} ${d} min late`);
    ctx.brief = `Festival time ${clock(now)}. The forecast says ${snow.start && snow.end ? `snow ${clock(snow.start)} to ${clock(snow.end)}, about ${snow.totalIn} in` : 'no snow'}. ${delays.length ? `Shuttle feed: ${delays.join(', ')}.` : ''} Assess the impact and recommend an option for each decision.`;
    const outcome = await runAgent(this.llms, weatherAgent, ctx, audit);
    this.commit(s, now, runId, audit, report, ctx.scratch, outcome, 'weather', 'weather:');
  }

  private async runGuest(s: OpsState, now: Iso, runId: string, audit: Audit, report: RunReport, guestId: string, sessionId?: string) {
    const g = this.data.guests.find(x => x.id === guestId);
    if (!g) return;
    const ctx = this.ctx(s, now, '') as GuestCtx;
    ctx.subject = { guestId, sessionId };
    const fact = s.conditions.reportedEtas[guestId];
    ctx.brief = `Festival time ${clock(now)}. Check guest ${g.name} (id ${g.id})${sessionId ? ` for session ${sessionId}` : ''}.`
      + (fact ? ` ${fact.source.ref} wrote at ${clock(fact.source.at)}: "${fact.source.quote}" (unconfirmed).` : '')
      + ' Work out whether they will make their call and recommend an option for each decision.';
    const outcome = await runAgent(this.llms, guestAgent, ctx, audit);
    this.commit(s, now, runId, audit, report, ctx.scratch, outcome, 'guest', `guest:${guestId}:${sessionId ?? ''}`, g.name);
  }

  /** After snow: plan every guest still on the way; only guests with a decision to make get the model. */
  private async sweepGuests(s: OpsState, now: Iso, runId: string, audit: Audit, report: RunReport) {
    const ctx = this.ctx(s, now, '');
    // Guests on a flight or a booked car today, or with a reported ETA. Guests already in town are not slowed by a trip.
    const day = ctx.view.dayOf(now);
    const travelling = this.data.guests.filter(g => !s.conditions.checkIns[g.id]?.at.startsWith(now.slice(0, 10))
      && (ctx.view.travelFor(g, day).mode !== 'local' || !!s.conditions.reportedEtas[g.id]));
    for (const g of travelling) {
      const plan = planGuest(ctx.view, g.id, now, ctx.snow);
      if (!plan.assessments.length) continue;
      audit('route', `Sweep ${g.name}: ${plan.assessments.map(a => a.status).join(', ')}`);
      if (plan.candidates.length) { await this.runGuest(s, now, runId, audit, report, g.id); continue; }
      const scratch = newScratch();
      scratch.autoActions.push(...plan.autoActions);
      scratch.later.push(...plan.later);
      scratch.planned = true;
      this.commit(s, now, runId, audit, report, scratch, null, 'guest', `guest:${g.id}:`, g.name);
    }
  }

  private toReview(s: OpsState, t: Extract<Trigger, { type: 'inbound_message' }>, reason: string, now: Iso, runId: string, audit: Audit, report: RunReport) {
    const item = { id: nextId(s, 'review'), at: now, reason, from: t.from, text: t.text, status: 'open' as const };
    s.review.push(item);
    audit('review', `Message from ${t.from} needs a person: ${reason}`, { id: item.id });
    execute(this.data, s, now, { kind: 'flag', level: 'amber', summary: `Message from ${t.from} needs a person: ${reason}.` }, `review:${item.id}:flag`, audit);
    execute(this.data, s, now, {
      kind: 'staff_heads_up', summary: 'Ask the Talent desk to read it', to: [{ kind: 'team', id: 'talent' }],
      template: 'owner_ping', vars: { team: 'Talent desk', title: `read the ${t.channel} from ${t.from} (${reason})`, deadline: clock(now), option: 'reply by hand' },
    }, `review:${item.id}:ping`, audit);
    report.review.push(`${t.from}: ${reason}`);
  }

  private commit(s: OpsState, now: Iso, runId: string, audit: Audit, report: RunReport, scratch: Scratch, outcome: AgentOutcome | null,
    agent: 'weather' | 'guest', scope: string, subject?: string) {
    if (outcome) {
      report.agents.push({
        agent, subject, via: outcome.via, model: outcome.model, llmCalls: outcome.llmCalls, llmMs: outcome.llmMs, error: outcome.error,
        tools: outcome.trace.map(t => ({ tool: t.tool, ok: t.ok, via: t.via, error: t.error })),
      });
    }
    // Automatic steps: only internal kinds can run here, whatever a plan says.
    for (const a of scratch.autoActions) {
      if (gateFor(a) !== 'auto') { audit('blocked', `Not automatic, skipped: ${a.summary}`); continue; }
      const r = execute(this.data, s, now, a, `auto:${a.key ?? hash(a.summary + JSON.stringify(a.vars ?? {}))}`, audit);
      if (r.ran) report.automatic.push(a.summary);
    }
    for (const l of scratch.later) this.park(s, now, audit, report, l);

    const live = new Set([...scratch.candidates.values()].map(c => c.key).concat(scratch.later.map(l => l.key)));
    for (const c of scratch.candidates.values()) {
      const sub = scratch.submitted.get(c.ref) ?? { key: c.ruleRecommendation, rationale: c.ruleReason, via: 'rules' as const };
      const res = upsertDecision(this.data, s, c, { ...sub, model: sub.via === 'llm' ? outcome?.model : undefined, grounded: true }, runId, now, audit);
      if (res.superseded) report.decisions.push({ id: res.superseded.id, title: res.superseded.title, change: 'superseded' });
      report.decisions.push({ id: res.decision.id, title: res.decision.title, change: res.created ? 'created' : 'unchanged', recommended: res.decision.agentRecommendation.key, via: res.decision.agentRecommendation.via });
    }
    // Close open decisions in this scope that the new plan no longer needs.
    if (scratch.planned) {
      for (const d of s.decisions.filter(x => x.status === 'open' && x.key.startsWith(scope) && !live.has(x.key))) {
        d.status = 'superseded';
        d.version++;
        d.history.push({ at: now, event: 'closed', by: 'agent', note: 'No longer needed after the latest check' });
        for (const t of s.timers) if (t.kind === 'deadline' && t.ref === d.id) t.fired = true;
        audit('decision', `Closed ${d.id}: ${d.title} (no longer needed)`);
        report.decisions.push({ id: d.id, title: d.title, change: 'closed' });
      }
    }
  }

  private park(s: OpsState, now: Iso, audit: Audit, report: RunReport, l: LaterItem) {
    const r = execute(this.data, s, now, { kind: 'flag', level: l.level, summary: l.text }, `later:${l.key}:${hash(l.text)}`, audit);
    if (r.ran) report.watching.push(l.text);
    if (l.recheckAt && l.trigger && isBefore(now, l.recheckAt)) {
      execute(this.data, s, now, { kind: 'watch', summary: `Re-check at ${clock(l.recheckAt)}: ${l.key}`, watch: { at: l.recheckAt, trigger: l.trigger } }, `later:${l.key}:watch:${l.recheckAt}`, audit);
    }
  }
}

function emptyReport(runId: string, at: Iso, trigger: string): RunReport {
  return { runId, at, trigger, routes: [], agents: [], decisions: [], automatic: [], watching: [], review: [], deadlines: [] };
}
