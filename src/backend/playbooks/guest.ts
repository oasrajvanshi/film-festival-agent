// Late guest playbook. For each upcoming call of a speaker or moderator it
// works out the ETA and status, then:
//   at risk        -> brief a backup / move the car earlier / line up video
//   will be late   -> start with the backup / delay the start / join by video
// Internal steps (dashboard flag, heads-up to Talent and the venue) run on
// their own; anything that reaches a guest or the audience waits for Talent.

import type { CallEntry, DecisionCandidate, DecisionOption, Fact, Guest, Iso, PlannedAction, Recipient, Session, Trigger } from '../domain/types';
import { addMinutes, clock, isBefore, minutesBetween, roundUp5, span } from '../domain/time';
import type { FestivalView } from '../domain/view';
import { assess, backupsFor, STATUS_WORDS, type Assessment, type BackupOption } from '../model/eta';
import type { SnowSummary } from '../model/snow';
import { clampDeadline, emptyPlan, keyed, propose, withinHorizon, type Plan } from './plan';

const firstName = (name: string) => name.split(/\s+/)[0];

export interface GuestPlan extends Plan { assessments: Assessment[] }

const roundTo10 = (t?: Iso) => (t ? t.slice(0, -1) + '0' : '');

/** Upcoming calls of a guest as speaker or moderator. */
export function upcomingCalls(v: FestivalView, guestId: string, now: Iso, sessionId?: string): CallEntry[] {
  return v.callsFor(guestId).filter(c => {
    if (c.role === 'backup' || (sessionId && c.sessionId !== sessionId)) return false;
    const s = v.session(c.sessionId);
    return !!s && s.status === 'scheduled' && isBefore(now, s.end);
  });
}

export function planGuest(v: FestivalView, guestId: string, now: Iso, snow: SnowSummary, sessionId?: string): GuestPlan {
  const plan: GuestPlan = { ...emptyPlan(), assessments: [] };
  const g = v.guest(guestId);
  if (!g) { plan.notes.push(`Unknown guest ${guestId}`); return plan; }
  for (const entry of upcomingCalls(v, guestId, now, sessionId)) {
    const a = assess(v, entry, now, snow);
    plan.assessments.push(a);
    planOne(v, plan, g, entry, a, now, snow);
  }
  return plan;
}

function planOne(v: FestivalView, plan: GuestPlan, g: Guest, entry: CallEntry, a: Assessment, now: Iso, snow: SnowSummary) {
  const s = v.session(entry.sessionId)!;
  const venue = v.placeName(s.venueId);
  const target = entry.callTime ?? s.start;
  const key = `guest:${g.id}:${s.id}`;
  const state = `${a.status}:${roundTo10(a.eta?.late)}`;
  const etaText = a.eta ? span(a.eta.early, a.eta.late) : 'unknown';
  const callWord = entry.callTime ? `call ${clock(entry.callTime)}${entry.callSource === 'default' ? ', default' : ''}` : `start ${clock(s.start)}, no call time on the sheet`;
  const recheck: Trigger = { type: 'recheck', at: now, scope: 'guest', ref: g.id };
  const facts: Fact[] = [
    ...(a.eta?.fact ? [a.eta.fact] : []),
    ...a.basis.filter(() => a.eta?.source !== 'reported').map(b => ({ key: 'eta_basis', value: b, source: { kind: 'rule' as const, ref: 'ETA model', at: now } })),
  ];
  const heads = (team: 'guest_relations' | 'house_manager'): PlannedAction => ({
    kind: 'staff_heads_up', key: `heads:${team}:${key}:${state}`, to: [{ kind: 'team', id: team }],
    template: 'talent_heads_up', vars: { name: g.name, status: STATUS_WORDS[a.status], session: s.title, callWord, eta: etaText, basis: a.basis.join('; ') },
    summary: `Heads-up to ${team === 'guest_relations' ? 'Guest relations' : 'the house managers'}: ${g.name} ${STATUS_WORDS[a.status]}`,
  });

  switch (a.status) {
    case 'here': case 'on_track': case 'done':
      return;
    case 'unknown':
      if (minutesBetween(now, target) >= 0 && minutesBetween(now, target) <= 60) {
        plan.autoActions.push({ kind: 'flag', level: 'amber', key: `flag:${key}:unknown`, summary: `No ETA for ${g.name} (${callWord}, ${venue}).` }, heads('guest_relations'));
      }
      return;
    case 'at_risk': {
      const c = atRiskCandidate(v, g, entry, s, a, now, snow, { key, state, facts, recheck, venue, target, etaText });
      // Due soon: an amber flag plus the decision. Further out: the parked item is the flag.
      if (c && withinHorizon(c.deadline, now)) plan.autoActions.push({ kind: 'flag', level: 'amber', key: `flag:${key}:${state}`, summary: a.summary });
      if (c) propose(plan, c, now, recheck, `${a.summary} Decision by ${clock(c.deadline)}.`);
      else plan.later.push({ key, level: 'amber', text: a.summary, recheckAt: addMinutes(target, -30), trigger: { ...recheck, at: addMinutes(target, -30) } });
      return;
    }
    case 'likely_late': case 'will_miss_start': {
      plan.autoActions.push({ kind: 'flag', level: 'red', key: `flag:${key}:${state}`, summary: a.summary }, heads('guest_relations'), heads('house_manager'));
      plan.candidates.push(lateCandidate(v, g, entry, s, a, now, snow, { key, state, facts, venue, etaText }));
      return;
    }
  }
}

interface Ctx { key: string; state: string; facts: Fact[]; recheck: Trigger; venue: string; target: Iso; etaText: string }

function guestAndAssistant(g: Guest): Recipient[] {
  return [{ kind: 'guest', id: g.id }, ...(g.assistant ? [{ kind: 'assistant' as const, id: g.id }] : [])];
}

function atRiskCandidate(v: FestivalView, g: Guest, entry: CallEntry, s: Session, a: Assessment, now: Iso, snow: SnowSummary, x: Ctx): DecisionCandidate | undefined {
  const late = a.eta!.late;
  const why = `${a.summary} Latest ETA ${clock(late)} is after the ${clock(x.target)} ${entry.callTime ? 'call' : 'start'}.`;
  const wait = (at: Iso): Omit<DecisionOption, 'key'> => ({
    title: `Wait and re-check at ${clock(at)}`,
    pros: 'No message now; the ETA may improve.', cons: `If ${g.name} is late, there is less time to react.`,
    cost: { people: 0, messages: 0, money: 0, reversible: true },
    actions: [{ kind: 'watch', summary: `Re-check ${g.name}'s ETA at ${clock(at)}`, watch: { at, trigger: x.recheck } }],
  });

  // A booked car that has not left yet: leave earlier.
  const trip = v.travelFor(g, s.day);
  if (trip.mode === 'car' && trip.pickupAt && isBefore(now, trip.pickupAt)) {
    const pickup = trip.pickupAt;
    const newPickup = addMinutes(pickup, -roundUp5(minutesBetween(x.target, late) + 5));
    const deadline = clampDeadline(addMinutes(newPickup, -15), now);
    return {
      ref: `pickup_${g.id}`, key: x.key, scenario: 'guest', owner: 'guest_relations',
      title: `Move ${g.name}'s pickup earlier`, why, facts: x.facts, deadline, state: x.state,
      options: keyed([
        {
          title: `Move the pickup to ${clock(newPickup)}`,
          pros: `Latest ETA moves to about ${clock(addMinutes(late, minutesBetween(pickup, newPickup)))}.`,
          cons: `${g.name} leaves ${minutesBetween(newPickup, pickup)} min earlier.`,
          cost: { people: 1, messages: 2, money: 0, reversible: true },
          actions: [
            { kind: 'staff_heads_up', summary: 'Tell Operations to move the car', to: [{ kind: 'team', id: 'operations' }], template: 'driver_change',
              vars: { name: g.name, place: v.placeName(trip.from ?? ''), newPickup: clock(newPickup), oldPickup: clock(pickup) } },
            { kind: 'message_guest', summary: `Tell ${g.name} the new pickup time`, to: guestAndAssistant(g), template: 'pickup_change',
              vars: { name: firstName(g.name), venue: x.venue, newPickup: clock(newPickup), oldPickup: clock(pickup) } },
          ],
        },
        wait(addMinutes(pickup, -30)),
      ]),
      ruleRecommendation: 'A', ruleReason: `Leaving ${minutesBetween(newPickup, pickup)} min earlier covers the worst case in snow.`,
    };
  }

  const backups = backupsFor(v, s.id, now, snow).filter(b => b.guestId !== g.id);
  const b = backups.find(x => x.designated) ?? backups[0];
  if (b) {
    const deadline = clampDeadline(addMinutes(x.target, -45), now);
    const gap = b.noCallTime ? ` The call sheet has no call time for ${b.name}, so the message asks for ${clock(x.target)}.` : b.designated ? '' : ` Not named on the call sheet: free at that time and ${b.here ? 'already at the venue' : 'nearby'}.`;
    return {
      ref: `backup_${s.id}`, key: x.key, scenario: 'guest', owner: 'guest_relations',
      title: `Brief a backup for "${s.title}"`, why, facts: x.facts, deadline, state: x.state,
      options: keyed([
        {
          title: `Ask ${b.name} to stand by at ${x.venue} by ${clock(x.target)}`,
          pros: `${b.name} ${b.here ? 'is at the venue' : `can be there by ${b.canArrive ? clock(b.canArrive) : 'call time'}`}.${gap}`,
          cons: 'One more message to a guest.',
          cost: { people: 1, messages: 1, money: 0, reversible: true },
          actions: [
            { kind: 'message_guest', summary: `Standby request to ${b.name}`, to: [{ kind: 'guest', id: b.guestId }], template: 'backup_standby',
              vars: { name: firstName(b.name), venue: x.venue, spot: b.spot ?? 'green room', callTime: clock(x.target), session: s.title, primary: g.name } },
          ],
        },
        wait(deadline),
      ]),
      ruleRecommendation: 'A', ruleReason: `The worst-case ETA (${clock(late)}) misses the call, and a backup needs notice.`,
    };
  }

  if (g.remoteOk) {
    const deadline = clampDeadline(addMinutes(s.start, -30), now);
    return {
      ref: `remote_${s.id}`, key: x.key, scenario: 'guest', owner: 'guest_relations',
      title: `Line up a video fallback for ${g.name}`, why, facts: x.facts, deadline, state: x.state,
      options: keyed([
        {
          title: `Ask ${g.name} to be ready to join by video`,
          pros: 'The panel can start on time either way.', cons: 'Needs AV to prepare a link.',
          cost: { people: 1, messages: 2, money: 0, reversible: true },
          actions: [
            { kind: 'message_guest', summary: `Video standby request to ${g.name}`, to: guestAndAssistant(g), template: 'remote_standby', vars: { name: firstName(g.name), session: s.title, start: clock(s.start) } },
            { kind: 'staff_heads_up', summary: 'Ask projection to prepare a link', to: [{ kind: 'team', id: 'projection', venueId: s.venueId }], template: 'av_remote',
              vars: { name: g.name, session: s.title, setupBy: clock(addMinutes(s.start, -15)), start: clock(s.start) } },
          ],
        },
        wait(deadline),
      ]),
      ruleRecommendation: 'A', ruleReason: 'No backup is listed and the guest can join remotely.',
    };
  }
  return undefined;
}

function lateCandidate(v: FestivalView, g: Guest, entry: CallEntry, s: Session, a: Assessment, now: Iso, snow: SnowSummary, x: Omit<Ctx, 'recheck' | 'target'>): DecisionCandidate {
  const moderator = v.callsForSession(s.id).find(c => c.role === 'moderator' && c.guestId !== g.id);
  const modName = moderator ? v.guest(moderator.guestId)!.name : 'The stage manager';
  const backups = backupsFor(v, s.id, now, snow).filter(b => b.guestId !== g.id && (b.here || (b.canArrive && !isBefore(s.start, b.canArrive))));
  const b: BackupOption | undefined = backups.find(x => x.designated && x.here) ?? backups.find(x => x.designated) ?? backups.find(x => x.here) ?? backups[0];
  const likely = a.eta?.likely;
  const missMin = likely ? Math.max(0, minutesBetween(s.start, likely)) : undefined;
  const options: Omit<DecisionOption, 'key'>[] = [];
  const keys: string[] = [];

  if (a.status === 'likely_late' && likely && !isBefore(addMinutes(s.start, -5), likely)) {
    keys.push('keep');
    options.push({
      title: `Keep the ${clock(s.start)} start; meet ${g.name} at the stage door`,
      pros: `Likely ETA ${clock(likely)} is before the start.`, cons: `No time to brief; ${g.name} goes straight on stage.`,
      cost: { people: 0, messages: 0, money: 0, reversible: true },
      actions: [
        { kind: 'staff_heads_up', summary: `Stage door brief at ${x.venue}`, to: [{ kind: 'team', id: 'house_manager' }, { kind: 'team', id: 'door', venueId: s.venueId }], template: 'stage_door_brief',
          vars: { name: g.name, session: s.title, eta: x.etaText, spot: entry.spot ?? 'backstage' } },
      ],
    });
  }
  if (b) {
    keys.push('backup');
    const msgs: PlannedAction[] = [
      { kind: 'message_guest', summary: `Ask ${b.name} to open the session`, to: [{ kind: 'guest', id: b.guestId }], template: 'backup_go',
        vars: { name: firstName(b.name), session: s.title, start: clock(s.start), primary: g.name, moderator: modName, spot: b.spot ?? 'green room' } },
      { kind: 'message_guest', summary: `Tell ${g.name} to join on arrival`, to: guestAndAssistant(g), template: 'guest_join_on_arrival',
        vars: { name: firstName(g.name), backup: b.name, session: s.title, start: clock(s.start), venue: x.venue } },
    ];
    if (moderator) {
      msgs.push({ kind: 'message_guest', summary: `Tell the moderator ${modName}`, to: [{ kind: 'guest', id: moderator.guestId }], template: 'moderator_swap',
        vars: { name: firstName(modName), primary: g.name, eta: x.etaText, session: s.title, start: clock(s.start), backup: b.name } });
    }
    options.push({
      title: `Start on time with ${b.name}; ${g.name} joins on arrival`,
      pros: `${b.name} is ${b.here ? 'at the venue' : `able to arrive by ${clock(b.canArrive!)}`}${b.designated ? ' and is the named backup' : ''}. No change to anyone's plans.`,
      cons: missMin !== undefined ? `${g.name} misses about ${missMin} min of the session.` : `${g.name} may miss the session.`,
      cost: { people: 0, messages: msgs.reduce((n, m) => n + (m.to?.length ?? 0), 0), money: 0, reversible: true, note: 'The audience sees the backup for the first part.' },
      actions: [
        ...msgs,
        { kind: 'staff_heads_up', summary: `Stage brief for ${x.venue}`, to: [{ kind: 'team', id: 'house_manager' }, { kind: 'team', id: 'guest_relations' }],
          template: 'stage_brief', vars: { session: s.title, start: clock(s.start), backup: b.name, primary: g.name, eta: x.etaText } },
        { kind: 'schedule_change', summary: `Add ${b.name} to "${s.title}"`, change: { sessionId: s.id, addSpeaker: b.guestId, note: `${b.name} opens in place of ${g.name}` } },
      ],
    });
  }
  if (likely) {
    keys.push('delay');
    const n = roundUp5(minutesBetween(s.start, likely) + 5);
    const newStart = addMinutes(s.start, n), newEnd = addMinutes(s.end, n);
    const next = v.nextInRoom(s);
    const clash = next && isBefore(next.start, newEnd) ? ` Runs into "${next.title}" at ${clock(next.start)} in the same room.` : '';
    const vars = { session: s.title, venue: x.venue, newStart: clock(newStart), oldStart: clock(s.start) };
    options.push({
      title: `Delay the start by ${n} min to ${clock(newStart)}`,
      pros: `The full session with ${g.name}.`,
      cons: `${s.expected} people with it in their plan wait ${n} min.${clash}`,
      cost: { people: s.expected, messages: s.expected + 2, money: 0, reversible: false },
      actions: [
        { kind: 'schedule_change', summary: `Move "${s.title}" to ${clock(newStart)}`, change: { sessionId: s.id, start: newStart, end: newEnd } },
        { kind: 'broadcast', summary: `Tell ${s.expected} people with it in their plan`, to: [{ kind: 'segment', id: `event:${s.id}` }], channels: ['push', 'email'], template: 'session_delay', vars },
        ...(moderator ? [{ kind: 'message_guest' as const, summary: `Tell the moderator ${modName}`, to: [{ kind: 'guest' as const, id: moderator.guestId }], template: 'moderator_delay', vars: { ...vars, name: firstName(modName), primary: g.name } }] : []),
        { kind: 'message_guest', summary: `Tell ${g.name}`, to: guestAndAssistant(g), template: 'guest_delay_ok', vars: { ...vars, name: firstName(g.name) } },
        { kind: 'update_brief', summary: `Door brief at ${x.venue}`, to: [{ kind: 'team', id: 'door', venueId: s.venueId }], template: 'delay_brief', vars },
      ],
    });
  }
  if (g.remoteOk && a.eta) {
    keys.push('remote');
    options.push({
      title: `${g.name} joins by video until arrival`,
      pros: `The audience hears from ${g.name} from the start.`, cons: `Needs a 10 min AV setup and ${g.name}'s OK; video from a car in snow may drop.`,
      cost: { people: 0, messages: 2, money: 0, reversible: true },
      actions: [
        { kind: 'message_guest', summary: `Ask ${g.name} to join by video`, to: guestAndAssistant(g), template: 'remote_join', vars: { name: firstName(g.name), session: s.title, start: clock(s.start) } },
        { kind: 'staff_heads_up', summary: 'Ask projection to set up a link', to: [{ kind: 'team', id: 'projection', venueId: s.venueId }], template: 'av_remote',
          vars: { name: g.name, session: s.title, setupBy: clock(addMinutes(s.start, -10)), start: clock(s.start) } },
      ],
    });
  }

  const pick = (k: string) => (['A', 'B', 'C'] as const)[Math.max(0, keys.slice(0, 3).indexOf(k))];
  let rec: string, reason: string;
  if (keys.includes('keep')) { rec = 'keep'; reason = 'The likely ETA is before the start; no one outside the team needs to hear about it.'; }
  else if (keys.includes('backup')) { rec = 'backup'; reason = `${b!.name} ${b!.here ? 'is at the venue' : 'can be there in time'} and nobody's plans change; a delay would make ${s.expected} people wait.`; }
  else if (keys.includes('remote')) { rec = 'remote'; reason = 'No backup is available and the guest can join by video.'; }
  else { rec = 'delay'; reason = 'No backup or video option; a short delay keeps the session whole.'; }

  const missing = a.status === 'will_miss_start' ? `the start of "${s.title}"` : `the ${entry.callTime ? clock(entry.callTime) + ' call' : 'call'} for "${s.title}"`;
  return {
    ref: `late_${s.id}`, key: x.key, scenario: 'guest', owner: 'guest_relations',
    title: `${g.name} will miss ${missing}`,
    why: `${a.summary}`, facts: x.facts, state: x.state,
    deadline: clampDeadline(addMinutes(s.start, -15), now, 5),
    options: keyed(options), ruleRecommendation: pick(rec), ruleReason: reason,
  };
}
