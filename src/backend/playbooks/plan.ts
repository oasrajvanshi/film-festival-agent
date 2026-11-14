// What a playbook returns. Playbooks are rules: they read the festival and
// the live conditions and propose decisions with costed options. The agent
// (model or rules) picks a recommendation; a person approves.

import type { DecisionCandidate, DecisionOption, Iso, OptionKey, PlannedAction, Trigger } from '../domain/types';
import { addMinutes, isBefore, minutesBetween } from '../domain/time';

/** Decisions further out than this become an amber flag and a re-check timer. */
export const HORIZON_MIN = 150;

export interface LaterItem {
  key: string;
  level: 'amber' | 'grey';
  text: string;
  recheckAt?: Iso;
  trigger?: Trigger;
}

export interface Plan {
  candidates: DecisionCandidate[];
  autoActions: PlannedAction[];
  later: LaterItem[];
  notes: string[];
}

export const emptyPlan = (): Plan => ({ candidates: [], autoActions: [], later: [], notes: [] });

/** A deadline never sits in the past: at least `minMin` from now. */
export function clampDeadline(d: Iso, now: Iso, minMin = 10): Iso {
  return minutesBetween(now, d) < minMin ? addMinutes(now, minMin) : d;
}

export function withinHorizon(deadline: Iso, now: Iso): boolean {
  return minutesBetween(now, deadline) <= HORIZON_MIN;
}

export function keyed(options: Omit<DecisionOption, 'key'>[]): DecisionOption[] {
  const keys: OptionKey[] = ['A', 'B', 'C'];
  return options.slice(0, 3).map((o, i) => ({ ...o, key: keys[i] }));
}

/**
 * Add a candidate if it is due soon; otherwise park it as an amber flag that
 * re-checks 30 minutes before its deadline.
 */
export function propose(plan: Plan, c: DecisionCandidate, now: Iso, recheck: Trigger, laterText: string) {
  if (withinHorizon(c.deadline, now)) { plan.candidates.push(c); return; }
  const at = addMinutes(c.deadline, -30);
  plan.later.push({ key: c.key, level: 'amber', text: laterText, recheckAt: isBefore(now, at) ? at : undefined, trigger: { ...recheck, at } as Trigger });
}
