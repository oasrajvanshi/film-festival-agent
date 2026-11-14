// The approval gate and the safety rules. These are fixed code, not the
// model's judgment:
//   - internal steps (flags, briefs, staff heads-ups, re-check timers) run on their own
//   - anything that reaches a guest, the audience or a vendor, or changes the agenda, needs a person
//   - a deadline may only run an option that is internal and reversible; mass messages never run by default
//   - recipients must exist in the sheets; there is no free-text address
//   - only festival staff of the owning team, or operations / the director, can decide

import type { ActionKind, DecisionCandidate, DecisionOption, FestivalData, OptionKey, PlannedAction, Team } from '../domain/types';
import { isTemplate, render } from './templates';

export type Gate = 'auto' | 'approval';

export const GATE: Record<ActionKind, Gate> = {
  flag: 'auto',
  update_brief: 'auto',
  staff_heads_up: 'auto',
  watch: 'auto',
  message_guest: 'approval',
  broadcast: 'approval',
  schedule_change: 'approval',
  vendor_order: 'approval',
};

/** Recipient kinds each action may address. Staff actions cannot reach guests and vice versa. */
const ALLOWED_TO: Partial<Record<ActionKind, string[]>> = {
  update_brief: ['team', 'staff'],
  staff_heads_up: ['team', 'staff'],
  message_guest: ['guest', 'assistant'],
  broadcast: ['segment'],
};

export function gateFor(a: PlannedAction): Gate {
  return GATE[a.kind];
}

export function isSafeDefault(o: DecisionOption): boolean {
  return o.cost.reversible && o.actions.every(a => gateFor(a) === 'auto');
}

/** The option a deadline may run: the recommendation if it is safe, else any safe option, else none. */
export function defaultFor(options: DecisionOption[], recommended: OptionKey): OptionKey | null {
  const rec = options.find(o => o.key === recommended);
  if (rec && isSafeDefault(rec)) return rec.key;
  return options.find(isSafeDefault)?.key ?? null;
}

/** Audience segments: day:<n> (everyone with a pass or ticket that day) and event:<id> (people with it in their plan). */
export function isSegment(data: FestivalData, id: string): boolean {
  const day = id.match(/^day:(\d+)$/);
  if (day) return !!data.info.dates[Number(day[1])];
  return id.startsWith('event:') && data.sessions.some(s => s.id === id.slice(6));
}

/** Problems with an action, or [] if it may run once its gate allows. */
export function checkAction(data: FestivalData, a: PlannedAction): string[] {
  const problems: string[] = [];
  const allowed = ALLOWED_TO[a.kind];
  for (const r of a.to ?? []) {
    if (allowed && !allowed.includes(r.kind)) problems.push(`${a.kind} cannot address a ${r.kind}`);
    if (r.kind === 'staff' && !data.staff.some(s => s.id === r.id)) problems.push(`unknown staff ${r.id}`);
    if ((r.kind === 'guest' || r.kind === 'assistant') && !data.guests.some(g => g.id === r.id)) problems.push(`unknown guest ${r.id}`);
    if (r.kind === 'assistant' && !data.guests.find(g => g.id === r.id)?.assistant) problems.push(`guest ${r.id} has no assistant`);
    if (r.kind === 'segment' && !isSegment(data, r.id)) problems.push(`unknown audience segment ${r.id}`);
  }
  if (['message_guest', 'broadcast', 'staff_heads_up', 'update_brief'].includes(a.kind) && !(a.to?.length)) problems.push(`${a.kind} has no recipients`);
  if (a.template) {
    if (!isTemplate(a.template)) problems.push(`unknown template ${a.template}`);
    else { try { render(a.template, a.vars); } catch (e) { problems.push((e as Error).message); } }
  } else if (['message_guest', 'broadcast', 'staff_heads_up', 'update_brief', 'vendor_order'].includes(a.kind)) {
    problems.push(`${a.kind} needs a template`);
  }
  if (a.kind === 'schedule_change' && !data.sessions.some(s => s.id === a.change?.sessionId)) problems.push('schedule change for an unknown session');
  return problems;
}

/** Mark safe defaults and drop options whose actions break the rules. */
export function vetCandidate(data: FestivalData, c: DecisionCandidate): { candidate: DecisionCandidate; dropped: { key: OptionKey; problems: string[] }[] } {
  const dropped: { key: OptionKey; problems: string[] }[] = [];
  const options = c.options.filter(o => {
    const problems = o.actions.flatMap(a => checkAction(data, a));
    if (problems.length) dropped.push({ key: o.key, problems });
    return !problems.length;
  }).map(o => ({ ...o, safeDefault: isSafeDefault(o) }));
  const rec = options.some(o => o.key === c.ruleRecommendation) ? c.ruleRecommendation : options[0]?.key ?? c.ruleRecommendation;
  return { candidate: { ...c, options, ruleRecommendation: rec }, dropped };
}

export function canDecide(data: FestivalData, staffId: string, owner: Team): boolean {
  const s = data.staff.find(x => x.id === staffId);
  return !!s && s.lead && (s.team === owner || s.team === 'operations' || s.team === 'director');
}
