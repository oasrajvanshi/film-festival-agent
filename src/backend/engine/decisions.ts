// Decision state machine.
//
//   open ──approve──▶ executed        (a person picked an option)
//    │ ──reject───▶ rejected          (nothing runs)
//    │ ──deadline─▶ executed          (only if a safe default exists)
//    │ ──deadline─▶ open + escalated  (no safe default: nothing runs, the ops lead is paged)
//    └─new facts──▶ superseded        (replaced by a newer decision for the same thing)
//
// Every change bumps `version`. A decide call must send the version it saw,
// so two managers picking different options are serialized: the second gets
// a conflict and sees the first one's choice.

import type { Decision, DecisionCandidate, FestivalData, Iso, OpsState, OptionKey } from '../domain/types';
import { teamName } from '../domain/view';
import { clock } from '../domain/time';
import { nextId, type Audit } from './audit';
import { execute } from './executor';
import { canDecide, defaultFor, vetCandidate } from './policy';

export class DecisionError extends Error {
  readonly name = 'DecisionError';
  constructor(public code: 'not_found' | 'conflict' | 'forbidden' | 'bad_request', message: string) { super(message); }
}

/** By name, not instanceof: Next.js may load this module once per route bundle. */
export function isDecisionError(e: unknown): e is DecisionError {
  return (e as Error)?.name === 'DecisionError' && typeof (e as DecisionError).code === 'string';
}

export interface AgentPick { key: OptionKey; rationale: string; via: 'llm' | 'rules'; model?: string; grounded: boolean }

export function fingerprint(c: DecisionCandidate): string {
  return [c.key, c.state, ...c.options.map(o => o.title)].join('|');
}


function cancelDeadline(state: OpsState, d: Decision) {
  for (const t of state.timers) if (t.kind === 'deadline' && t.ref === d.id) t.fired = true;
}

function touch(d: Decision, at: Iso, event: string, by?: string, note?: string) {
  d.version++;
  d.history.push({ at, event, by, note });
}

export function upsertDecision(data: FestivalData, state: OpsState, c: DecisionCandidate, pick: AgentPick, runId: string, now: Iso, audit: Audit):
  { decision: Decision; created: boolean; superseded?: Decision } {
  const fp = fingerprint(c);
  const same = state.decisions.filter(d => d.key === c.key);
  const open = same.find(d => d.status === 'open');
  const last = [...same].reverse().find(d => d.status !== 'superseded');
  if (open?.fingerprint === fp) return { decision: open, created: false };
  if (!open && last?.fingerprint === fp) return { decision: last, created: false };

  if (open) {
    open.status = 'superseded';
    touch(open, now, 'superseded', 'agent', 'New facts changed the options');
    cancelDeadline(state, open);
  }
  const { candidate, dropped } = vetCandidate(data, c);
  for (const x of dropped) audit('blocked', `Option ${x.key} of "${c.title}" removed by policy`, x.problems);
  const { ref: _ref, ...rest } = candidate;
  const agentKey = candidate.options.some(o => o.key === pick.key) ? pick.key : candidate.ruleRecommendation;
  const d: Decision = {
    ...rest,
    id: nextId(state, 'dec'),
    agentRecommendation: { ...pick, key: agentKey },
    defaultOption: defaultFor(candidate.options, candidate.ruleRecommendation),
    status: 'open', escalated: false, fingerprint: fp, version: 1, createdAt: now, runId,
    history: [{ at: now, event: 'created', by: pick.via === 'llm' ? `agent (${pick.model})` : 'agent (rules)' }],
  };
  state.decisions.push(d);
  state.timers.push({ id: nextId(state, 'timer'), at: d.deadline, kind: 'deadline', ref: d.id, fired: false });
  audit('decision', `Decision ${d.id}: ${d.title} (owner ${teamName(d.owner)}, due ${clock(d.deadline)}, recommended ${agentKey})`,
    { id: d.id, key: d.key, options: d.options.map(o => o.key), rule: d.ruleRecommendation, agent: d.agentRecommendation, defaultOption: d.defaultOption });

  const rec = d.options.find(o => o.key === agentKey);
  execute(data, state, now, {
    kind: 'staff_heads_up', summary: `Ping ${teamName(d.owner)} about ${d.id}`, to: [{ kind: 'team', id: d.owner }],
    template: 'owner_ping', vars: { team: teamName(d.owner), title: d.title, deadline: clock(d.deadline), option: rec ? `${rec.key}, ${rec.title}` : 'none' },
  }, `${d.id}:ping`, audit);
  return { decision: d, created: true, superseded: open };
}

function runOption(data: FestivalData, state: OpsState, d: Decision, key: OptionKey, by: string, via: 'human' | 'deadline', now: Iso, audit: Audit) {
  const option = d.options.find(o => o.key === key)!;
  const failed: string[] = [];
  option.actions.forEach((a, i) => {
    const r = execute(data, state, now, a, `${d.id}:${key}:${i}`, audit);
    if (!r.ran && r.note !== 'already done') failed.push(`${a.summary}: ${r.note}`);
  });
  if (via === 'human') for (const f of d.facts) f.confirmedBy ??= by;
  d.chosen = { key, by, at: now, via };
  d.status = failed.length ? 'failed' : 'executed';
  touch(d, now, failed.length ? 'failed' : `option ${key} ran`, by, failed.join('; ') || undefined);
  cancelDeadline(state, d);
}

export interface DecideInput { action: 'approve' | 'reject'; option?: OptionKey; by: string; version?: number; note?: string }

export function decide(data: FestivalData, state: OpsState, id: string, input: DecideInput, now: Iso, audit: Audit): Decision {
  const d = state.decisions.find(x => x.id === id);
  if (!d) throw new DecisionError('not_found', `No decision ${id}`);
  if (d.status !== 'open') throw new DecisionError('conflict', `Decision ${id} is already ${d.status}${d.chosen ? ` (option ${d.chosen.key ?? 'none'} by ${d.chosen.by})` : ''}`);
  if (input.version !== undefined && input.version !== d.version) {
    throw new DecisionError('conflict', `Decision ${id} changed since you loaded it (you saw version ${input.version}, it is now ${d.version}). Reload and decide again.`);
  }
  if (!canDecide(data, input.by, d.owner)) throw new DecisionError('forbidden', `${input.by} cannot decide for ${teamName(d.owner)}; ask festival staff of that team or Operations`);
  const who = data.staff.find(s => s.id === input.by)!.name;
  if (input.action === 'reject') {
    d.status = 'rejected';
    d.chosen = { key: null, by: input.by, at: now, via: 'human' };
    touch(d, now, 'rejected', input.by, input.note);
    cancelDeadline(state, d);
    audit('approval', `${who} rejected ${d.id}: ${d.title}`, { id, note: input.note });
    return d;
  }
  if (!input.option || !d.options.some(o => o.key === input.option)) {
    throw new DecisionError('bad_request', `Pick one of ${d.options.map(o => o.key).join(', ')}`);
  }
  audit('approval', `${who} chose ${input.option} on ${d.id}: ${d.options.find(o => o.key === input.option)!.title}`, { id, option: input.option, note: input.note });
  runOption(data, state, d, input.option, input.by, 'human', now, audit);
  return d;
}

/** Deadline passed with no answer. */
export function onDeadline(data: FestivalData, state: OpsState, d: Decision, now: Iso, audit: Audit) {
  if (d.status !== 'open' || d.escalated) return;
  const notify = (template: 'default_ran' | 'escalation', option: string) => execute(data, state, now, {
    kind: 'staff_heads_up', summary: `Tell ${teamName(d.owner)} and Operations about the deadline on ${d.id}`,
    to: [{ kind: 'team', id: d.owner }, { kind: 'team', id: 'operations' }],
    template, vars: { title: d.title, deadline: clock(d.deadline), option },
  }, `${d.id}:deadline`, audit);
  if (d.defaultOption) {
    const o = d.options.find(x => x.key === d.defaultOption)!;
    audit('timer', `No answer on ${d.id} by ${clock(d.deadline)}: running the safe default ${o.key}`, { id: d.id });
    runOption(data, state, d, o.key, 'deadline', 'deadline', now, audit);
    notify('default_ran', `${o.key}, ${o.title}`);
  } else {
    d.escalated = true;
    touch(d, now, 'escalated', 'deadline', 'No safe default: nothing ran');
    audit('timer', `No answer on ${d.id} by ${clock(d.deadline)}: no safe default, escalated to Operations`, { id: d.id });
    notify('escalation', '');
  }
}
