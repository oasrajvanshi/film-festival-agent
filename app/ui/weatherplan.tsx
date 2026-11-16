'use client';
// Weather on the Today page, the way the team first imagined it: pick a
// weather, see what it would break, get the agent's recommendation as a
// checklist, approve it in one go, and the calendar moves. The plan before
// the change stays one tap away.
//
// Everything here comes from the agent's own rules (src/agent/weather.ts):
// the same risk windows, staff heads-ups, volunteer briefs and personal
// messages. Approving runs the schedule change through the agent's grid
// edit, so the right people get their new times.

import { useMemo, useState } from 'react';
import type { AgentStore } from './useAgent';
import { assessWeather, planWeather, scenarioHours, type WeatherRisk } from '../../src/agent/weather';
import type { Action } from '../../src/agent/approvals';
import type { DayNumber, FestivalEvent } from '../../src/core/types';
import { addMinutes, clock as fmt, overlaps, toMinutes } from '../../src/core/time';
import { Icon } from './icons';

export type WxKind = 'storm' | 'snow' | 'heat';
const KINDS: { k: WxKind; label: string; icon: 'cloud' | 'alert' | 'clock' }[] = [
  { k: 'storm', label: 'Thunderstorm', icon: 'cloud' },
  { k: 'snow', label: 'Snow', icon: 'cloud' },
  { k: 'heat', label: 'Heat wave', icon: 'cloud' },
];
const NAME: Record<WxKind, string> = { storm: 'Thunderstorms', snow: 'Snow', heat: 'A heat wave' };
/** How much later the agent starts events in the window, per weather. */
const DELAY: Record<WxKind, number> = { storm: 15, snow: 20, heat: 10 };
const WHY: Record<WxKind, string> = {
  storm: 'so people caught in the rain still make the start',
  snow: 'so people on slow sidewalks and the shuttle still make the start',
  heat: 'so lines can wait indoors through the hottest hours',
};

type ItemKey = 'shift' | 'people' | 'team';
export interface WeatherPlan {
  kind: WxKind;
  risk: WeatherRisk;
  delay: number;
  /** The day's events as they would be after the change. */
  after: FestivalEvent[];
  moved: string[];
  /** Events that start inside the weather window. */
  starting: number;
  people: number;
  staff: number;
  volunteers: number;
  guests: string[];
  actions: Action[];
}

/** Push every event starting in the window back, then keep each venue's later events from overlapping. */
function shiftEvents(events: FestivalEvent[], day: DayNumber, from: string, to: string, delay: number): FestivalEvent[] {
  const out = events.map(e => ({ ...e }));
  const today = out.filter(e => e.day === day && e.status === 'scheduled');
  const venues = [...new Set(today.map(e => e.venueId))];
  for (const v of venues) {
    const list = today.filter(e => e.venueId === v).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    let lastEnd: string | null = null;
    for (const e of list) {
      const inWindow = toMinutes(e.start) >= toMinutes(from) && toMinutes(e.start) < toMinutes(to);
      let push = inWindow ? delay : 0;
      if (lastEnd && toMinutes(e.start) + push < toMinutes(lastEnd)) push = toMinutes(lastEnd) - toMinutes(e.start);
      if (push > 0) { e.start = addMinutes(e.start, push); e.end = addMinutes(e.end, push); }
      lastEnd = e.end;
    }
  }
  return out;
}

export function planFor(s: AgentStore, kind: WxKind, day: DayNumber): WeatherPlan | null {
  const f = s.agent.f;
  const date = f.dates[day];
  const risk = assessWeather(scenarioHours(date, kind))[0];
  if (!risk) return null;
  const delay = DELAY[kind];
  const after = shiftEvents(f.events, day, risk.from, risk.to, delay);
  const moved = after.filter(e => f.events.find(x => x.id === e.id)?.start !== e.start).map(e => e.id);
  const actions = planWeather(f, [risk], `${NAME[kind]} (demo forecast)`);
  const notify = actions.find(a => a.kind === 'notify_people');
  const touched = f.events.filter(e => e.day === day && e.status === 'scheduled' && overlaps(e.start, e.end, risk.from, risk.to));
  const guests = [...new Set(touched.flatMap(e => e.guestIds))].map(id => f.people.find(p => p.id === id)?.name).filter(Boolean) as string[];
  return {
    kind, risk, delay, after, moved,
    starting: f.events.filter(e => e.day === day && e.status === 'scheduled' && toMinutes(e.start) >= toMinutes(risk.from) && toMinutes(e.start) < toMinutes(risk.to)).length,
    people: notify?.messages?.length ?? 0,
    staff: f.people.filter(p => p.role === 'festival_staff').length,
    volunteers: new Set(f.shifts.filter(x => overlaps(x.start, x.end, risk.from, risk.to)).map(x => x.personId)).size,
    guests, actions,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function WeatherWatch({ s, day, user, onPreview, onApplied }: {
  s: AgentStore; day: DayNumber; user: string;
  /** The day's events as the open recommendation would leave them (null: no preview). */
  onPreview: (p: { events: FestivalEvent[]; moved: string[] } | null) => void;
  /** Called after approval with the events as they were before. */
  onApplied: (before: FestivalEvent[]) => void;
}) {
  const [kind, setKind] = useState<WxKind | null>(null);
  const [off, setOff] = useState<Set<ItemKey>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const plan = useMemo(() => (kind ? planFor(s, kind, day) : null), [kind, day, s.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (k: WxKind | null) => {
    setKind(k); setOff(new Set()); setDone(null);
    const p = k ? planFor(s, k, day) : null;
    onPreview(p && p.moved.length ? { events: p.after, moved: p.moved } : null);
  };
  const toggle = (k: ItemKey) => {
    const next = new Set(off);
    if (next.has(k)) next.delete(k); else next.add(k);
    setOff(next);
    if (k === 'shift' && plan) onPreview(next.has('shift') || !plan.moved.length ? null : { events: plan.after, moved: plan.moved });
  };

  const items: { key: ItemKey; text: string }[] = plan ? [
    ...(plan.moved.length ? [{ key: 'shift' as const, text: `Start the ${plural(plan.starting, 'event')} in the window ${plan.delay} min later, ${WHY[plan.kind]}${plan.moved.length > plan.starting ? `, and push ${plural(plan.moved.length - plan.starting, 'later event')} at the same venues to match` : ''}` }] : []),
    ...(plan.people ? [{ key: 'people' as const, text: `Send ${plural(plan.people, 'person', 'people')} with plans then their new time and what to bring` }] : []),
    { key: 'team', text: `Tell ${plural(plan.staff, 'staff member')}${plan.volunteers ? ` and brief ${plural(plan.volunteers, 'volunteer')} on shift` : ''}` },
  ] : [];
  const chosen = items.filter(i => !off.has(i.key));

  const approve = async () => {
    if (!plan) return;
    setBusy(true);
    const a = s.agent;
    const before = a.f.events.map(e => ({ ...e }));
    const want = (k: ItemKey) => chosen.some(i => i.key === k);
    let sent = 0;
    // 1. The schedule change goes through the agent's grid edit: it works out who each move affects.
    if (want('shift') && plan.moved.length) {
      const r = await a.onGridEdit(plan.after, user || 'Organizer');
      for (const act of r.actions) {
        const q = a.queue.find(x => x.action.id === act.id && x.status === 'pending');
        if (!q) continue;
        if (act.kind === 'notify_people' && !want('people')) a.reject(act.id, user || 'Organizer', 'Left out of the weather plan');
        else { a.approve(act.id, user || 'Organizer', 'Weather plan'); sent += act.messages?.length ?? 0; }
      }
    }
    // 2. The weather notes: staff and volunteers, and people with plans (when no schedule notice already went).
    const weather = planWeather(a.f, [plan.risk], `${NAME[plan.kind]} (demo forecast)`).filter(x =>
      (x.kind === 'notify_staff' || x.kind === 'update_brief') ? want('team')
        : x.kind === 'notify_people' ? want('people') && !want('shift')
          : false);
    for (const act of weather) {
      a.queue.push({ action: act, runId: 'weather-plan', status: 'pending' });
      a.approve(act.id, user || 'Organizer', 'Weather plan');
      sent += act.messages?.length ?? 0;
    }
    s.commit();
    setBusy(false);
    onPreview(null);
    if (want('shift') && plan.moved.length) onApplied(before);
    setDone(`Done. ${want('shift') && plan.moved.length ? `${plural(plan.moved.length, 'event')} moved. ` : ''}${plural(sent, 'message')} sent.`);
    setKind(null);
    document.querySelector('.today-cal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="card wx">
      <div className="section-title">
        <h2><Icon name="cloud" size={18} /> Weather</h2>
        <div className="pill-toggle" role="tablist" aria-label="Weather">
          {KINDS.map(x => <button key={x.k} className={kind === x.k ? 'on' : ''} onClick={() => pick(kind === x.k ? null : x.k)}>{x.label}</button>)}
        </div>
      </div>

      {!plan && <p className="wx-hint">{done ?? 'Pick a weather to see what it would break and what the agent recommends.'}</p>}

      {plan && (
        <div className="wx-rec">
          <p className="wx-what">
            {NAME[plan.kind]} from {fmt(plan.risk.from)} to {fmt(plan.risk.to)}
            {plan.starting ? <>: {plural(plan.starting, 'event')} start{plan.starting === 1 ? 's' : ''} then</> : null}
            {plan.people ? <>, {plural(plan.people, 'person', 'people')} will be on their way</> : null}
            {plan.guests.length ? <>, and {plan.guests.length > 2 ? `${plan.guests.slice(0, 2).join(', ')} and ${plan.guests.length - 2} more guests` : plan.guests.join(' and ')} {plan.guests.length === 1 ? 'is' : 'are'} due on stage</> : null}.
          </p>
          <ul className="wx-list">
            {items.map(i => (
              <li key={i.key}>
                <label>
                  <input type="checkbox" checked={!off.has(i.key)} onChange={() => toggle(i.key)} />
                  <span>{i.text}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="wx-foot">
            <button className="primary big" disabled={!chosen.length || busy} onClick={approve}>{busy ? 'Working…' : `Approve ${chosen.length}`}</button>
          </div>
        </div>
      )}
    </div>
  );
}
