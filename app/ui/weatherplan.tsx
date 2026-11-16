'use client';
// Weather on the Today page. The agent watches the forecast in the
// background; when weather threatens the programme, an alert appears above
// the calendar. Opening its recommendation shows one sentence and a
// checklist while the calendar previews the moves; one approval makes it
// the new plan, and the plan before stays one tap away.
//
// The same goes for a key guest running late (the mock festival's Pavel
// Kettering, due on the "Selling at Markets" panel): the agent recommends
// opening with a backup who is already at the venue.
//
// For demos the alerts come from scripted feeds: Day 1 thunderstorms,
// Pavel running late, and Day 2 snow are raised on first open, and the
// demo toolbar can raise any of them.
//
// Everything here comes from the agent's own rules (src/agent/weather.ts):
// the same risk windows, staff heads-ups, volunteer briefs and personal
// messages. Approving runs the schedule change through the agent's grid
// edit, so the right people get their new times.

import { useEffect, useState } from 'react';
import type { AgentStore } from './useAgent';
import { assessWeather, planWeather, scenarioHours, type WeatherRisk } from '../../src/agent/weather';
import type { Action, OutboundMessage } from '../../src/agent/approvals';
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

// ------------------------------------------------------------------ alerts the agent has raised
export type AlertKind = WxKind | 'guest';
export interface WxAlert { id: string; kind: AlertKind; day: DayNumber; status: 'open' | 'done' }
const ALERTS_KEY = 'usher-alerts-v3';
const EVENT = 'usher-alerts';
/** The demo's three problems, brought in from the hidden button on Today. */
const DEMO_ALERTS: WxAlert[] = [
  { id: 'guest-d1', kind: 'guest', day: 1 as DayNumber, status: 'open' },
  { id: 'storm-d1', kind: 'storm', day: 1 as DayNumber, status: 'open' },
  { id: 'snow-d2', kind: 'snow', day: 2 as DayNumber, status: 'open' },
];
/** All quiet until someone brings the problems in. */
export function readAlerts(): WxAlert[] {
  try { const v = localStorage.getItem(ALERTS_KEY); return v ? JSON.parse(v) : []; } catch { return []; }
}
function writeAlerts(list: WxAlert[]) {
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify(list)); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
}
/** Demo toolbar: the agent "sees" this on that day. */
export function raiseAlert(kind: AlertKind, day: DayNumber) {
  const id = `${kind}-d${day}`;
  writeAlerts([...readAlerts().filter(a => a.id !== id), { id, kind, day, status: 'open' }]);
}
export function resetAlerts() { writeAlerts([]); }
export function bringProblems() { writeAlerts(DEMO_ALERTS.map(a => ({ ...a }))); }

/**
 * Demo control: a small button that shows only when the pointer reaches the
 * bottom-left corner. It brings the three problems in, or calms things down.
 */
export function ProblemTrigger() {
  const [alerts] = useAlerts();
  const live = alerts.some(a => a.status === 'open');
  return (
    <div className="problem-trigger" data-lve-skip>
      <button onClick={() => (live ? resetAlerts() : bringProblems())}>
        <Icon name={live ? 'check' : 'bolt'} size={14} /> {live ? 'Calm things down' : 'Bring on the problems'}
      </button>
    </div>
  );
}
export function useAlerts(): [WxAlert[], (list: WxAlert[]) => void] {
  const [list, setList] = useState<WxAlert[]>([]);
  useEffect(() => {
    const load = () => setList(readAlerts());
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener(EVENT, load); window.removeEventListener('storage', load); };
  }, []);
  return [list, writeAlerts];
}

// ------------------------------------------------------------------ one recommendation, whatever raised it
export interface Preview { events: FestivalEvent[]; moved: string[]; notes?: Record<string, string> }
interface Rec {
  title: string;
  sub: string;
  what: string;
  items: { key: string; text: string }[];
  /** The calendar as it would look with the given items unticked. */
  preview: (off: Set<string>) => Preview | null;
  apply: (want: (k: string) => boolean, by: string) => Promise<{ before: FestivalEvent[] | null }>;
}

const dayName = (s: AgentStore, d: DayNumber) => new Date(`${s.agent.f.dates[d]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const channelFor = (p: { channels: string[] }) => (p.channels.includes('app_push') ? 'app_push' : p.channels.includes('sms') ? 'sms' : 'email') as OutboundMessage['channel'];

/** Send messages as one action, through the approval queue (approved here, by the organizer). */
function send(s: AgentStore, id: string, kind: Action['kind'], title: string, messages: OutboundMessage[], by: string) {
  if (!messages.length) return 0;
  const action: Action = { id: `${id}-${Date.now()}`, kind, title, rationale: 'Approved from a recommendation on Today', messages };
  s.agent.queue.push({ action, runId: 'today-rec', status: 'pending' });
  s.agent.approve(action.id, by, 'Recommendation');
  return messages.length;
}

/** Run a schedule change through the agent's grid edit; keep or drop the attendee notices it drafts. */
async function regrid(s: AgentStore, after: FestivalEvent[], by: string, notifyPeople: boolean) {
  const a = s.agent;
  const r = await a.onGridEdit(after, by);
  for (const act of r.actions) {
    if (!a.queue.find(x => x.action.id === act.id && x.status === 'pending')) continue;
    if (act.kind === 'notify_people' && !notifyPeople) a.reject(act.id, by, 'Not part of this recommendation');
    else a.approve(act.id, by, 'Recommendation');
  }
}

function weatherRec(s: AgentStore, kind: WxKind, day: DayNumber): Rec | null {
  const plan = planFor(s, kind, day);
  if (!plan) return null;
  const items = [
    ...(plan.moved.length ? [{ key: 'shift', text: `Start ${plural(plan.moved.length, 'event')} ${plan.delay} min later` }] : []),
    ...(plan.people ? [{ key: 'people', text: `Send ${plural(plan.people, 'person', 'people')} their new time` }] : []),
    { key: 'team', text: `Brief ${plural(plan.staff, 'staff member')}${plan.volunteers ? ` and ${plural(plan.volunteers, 'volunteer')}` : ''}` },
  ];
  return {
    title: `${NAME[kind]} ${fmt(plan.risk.from)} to ${fmt(plan.risk.to)}`,
    sub: `Day ${day} · ${dayName(s, day)} · from the forecast`,
    what: `${plan.starting ? `${plural(plan.starting, 'event')} start${plan.starting === 1 ? 's' : ''} in the ${kind === 'heat' ? 'heat' : kind === 'snow' ? 'snow' : 'storm'}` : 'Nothing starts in this window'}`
      + `${plan.people ? `, with ${plural(plan.people, 'person', 'people')} on the way` : ''}. Starting later ${WHY[kind].replace(/^so /, 'means ')}.`,
    items,
    preview: off => (plan.moved.length && !off.has('shift') ? { events: plan.after, moved: plan.moved } : null),
    apply: async (want, by) => {
      const before = s.agent.f.events.map(e => ({ ...e }));
      const moving = want('shift') && plan.moved.length > 0;
      if (moving) await regrid(s, plan.after, by, want('people'));
      const notes = planWeather(s.agent.f, [plan.risk], `${NAME[kind]} (forecast)`).filter(x =>
        (x.kind === 'notify_staff' || x.kind === 'update_brief') ? want('team')
          : x.kind === 'notify_people' ? want('people') && !moving : false);
      for (const act of notes) send(s, act.id, act.kind, act.title, act.messages ?? [], by);
      return { before: moving ? before : null };
    },
  };
}

/** The mock festival's classic: Pavel Kettering, due on "Selling at Markets", is running late. */
function guestRec(s: AgentStore, day: DayNumber): Rec | null {
  const f = s.agent.f;
  const person = (name: string) => f.people.find(p => p.name === name);
  const lateId = lateGuestId(s);
  const pavel = f.people.find(p => p.id === lateId);
  if (!pavel) return null;
  const ev = f.events.find(e => e.day === day && e.status === 'scheduled' && e.guestIds.includes(pavel.id) && e.kind === 'panel')
    ?? f.events.find(e => e.day === day && e.status === 'scheduled' && e.guestIds.includes(pavel.id));
  if (!ev) return null;
  const venue = f.venues.find(v => v.id === ev.venueId)?.name ?? 'the venue';
  // The backup: a guest already at that venue earlier the same day, not on this panel.
  const backup = [person('Yara Hollis'), ...f.people.filter(p => p.role === 'guest')]
    .find(p => p && p.id !== pavel.id && !ev.guestIds.includes(p.id) && f.events.some(e => e.day === day && e.venueId === ev.venueId && e.guestIds.includes(p.id) && toMinutes(e.end) <= toMinutes(ev.start)));
  const eta = addMinutes(ev.start, 20);
  const others = ev.guestIds.filter(id => id !== pavel.id).map(id => f.people.find(p => p.id === id)).filter(Boolean) as typeof f.people;
  const staff = f.people.filter(p => p.role === 'festival_staff');
  const after = f.events.map(e => (e.id === ev.id && backup ? { ...e, guestIds: [backup.id, ...e.guestIds] } : { ...e }));
  const items = [
    ...(backup ? [{ key: 'open', text: `Open with ${backup.name}, already at ${venue}` }] : []),
    { key: 'guest', text: `Tell ${pavel.name.split(' ')[0]} to go straight to the stage` },
    { key: 'team', text: `Tell ${others.length ? `${plural(others.length, 'panelist')} and ` : ''}${plural(staff.length, 'staff member')}` },
  ];
  return {
    title: `${pavel.name} is running late`,
    sub: `${ev.title} · Day ${day}, ${fmt(ev.start)} · ${venue}`,
    what: `Stuck on the harbor bridge; he now reaches ${venue} at ${fmt(eta)}, 20 min after the start.`,
    items,
    preview: off => (backup && !off.has('open') ? { events: after, moved: [ev.id], notes: { [ev.id]: `${backup.name} opens · ${pavel.name.split(' ')[0]} joins ${fmt(eta)}` } } : null),
    apply: async (want, by) => {
      const before = f.events.map(e => ({ ...e }));
      const opening = want('open') && !!backup;
      if (opening) await regrid(s, after, by, false);
      if (opening && backup) send(s, 'late-backup', 'notify_people', `${backup.name} asked to open "${ev.title}"`, [{ personId: backup.id, channel: channelFor(backup), subject: `Could you open "${ev.title}" at ${fmt(ev.start)}?`,
        body: `${pavel.name} is running late and expects to arrive about ${fmt(eta)}. Could you open "${ev.title}" at ${fmt(ev.start)} in ${venue}? He will join on stage when he arrives.` }], by);
      if (want('guest')) send(s, 'late-guest', 'notify_people', `${pavel.name} told to join on arrival`, [{ personId: pavel.id, channel: channelFor(pavel), subject: `Come straight to the stage at ${venue}`,
        body: `No rush and no need to check in first. ${opening && backup ? `${backup.name} will open "${ev.title}" at ${fmt(ev.start)}. ` : ''}Come straight to the stage at ${venue} when you arrive, about ${fmt(eta)}.` }], by);
      if (want('team')) {
        send(s, 'late-panel', 'notify_people', `Panelists told about ${pavel.name}`, others.map(p => ({ personId: p.id, channel: channelFor(p), subject: `${pavel.name} joins "${ev.title}" late`,
          body: `${pavel.name} expects to arrive about ${fmt(eta)}.${opening && backup ? ` ${backup.name} opens with you at ${fmt(ev.start)}.` : ''}` })), by);
        send(s, 'late-staff', 'notify_staff', `Staff told about ${pavel.name}`, staff.map(p => ({ personId: p.id, channel: 'app_push', subject: `${pavel.name} late for ${ev.title}`,
          body: `${pavel.name} arrives about ${fmt(eta)}. ${opening && backup ? `${backup.name} opens at ${fmt(ev.start)}. ` : ''}Walk him straight to the stage at ${venue}.` })), by);
      }
      return { before: opening ? before : null };
    },
  };
}

function recFor(s: AgentStore, al: WxAlert): Rec | null {
  return al.kind === 'guest' ? guestRec(s, al.day) : weatherRec(s, al.kind, al.day);
}

/**
 * The alerts above the calendar. Each shows what the agent saw; its
 * recommendation opens underneath, and the calendar previews it.
 */
export function WeatherAlerts({ s, user, onOpen, onPreview, onApplied }: {
  s: AgentStore; user: string;
  /** An alert's recommendation opened (the calendar should show its day). */
  onOpen: (day: DayNumber) => void;
  onPreview: (p: Preview | null) => void;
  onApplied: (before: FestivalEvent[], notes: Record<string, string>) => void;
}) {
  const [alerts, setAlerts] = useAlerts();
  const [openId, setOpenId] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // Approve shows once the calendar has finished moving, so the change is seen first.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!openId) return;
    const t = setTimeout(() => setReady(true), 1100);
    return () => clearTimeout(t);
  }, [openId]);
  const shown = alerts.filter(x => x.status === 'open' && s.agent.f.dates[x.day])
    .map(al => ({ al, rec: recFor(s, al) })).filter((x): x is { al: WxAlert; rec: Rec } => !!x.rec)
    .sort((x, y) => x.al.day - y.al.day || (x.al.kind === 'guest' ? -1 : 1));
  const open = shown.find(x => x.al.id === openId) ?? null;

  const show = (id: string | null) => {
    setOpenId(id); setOff(new Set());
    const o = shown.find(x => x.al.id === id);
    if (o) onOpen(o.al.day);
    onPreview(o ? o.rec.preview(new Set()) : null);
  };
  const toggle = (k: string) => {
    const next = new Set(off);
    if (next.has(k)) next.delete(k); else next.add(k);
    setOff(next);
    if (open) onPreview(open.rec.preview(next));
  };
  if (!shown.length) return null;

  const approve = async () => {
    if (!open) return;
    setBusy(true);
    const chosen = new Set(open.rec.items.filter(i => !off.has(i.key)).map(i => i.key));
    const notes = open.rec.preview(off)?.notes ?? {};
    const { before } = await open.rec.apply(k => chosen.has(k), user || 'Organizer');
    s.commit();
    setBusy(false);
    setOpenId(null);
    onPreview(null);
    if (before) onApplied(before, notes);
    setAlerts(alerts.map(x => (x.id === open.al.id ? { ...x, status: 'done' } : x)));
  };

  return (
    <>
      <div className="wx-alerts">
        {shown.map(({ al, rec }) => {
          const isOpen = open?.al.id === al.id;
          return (
            <div key={al.id} className={`wx-alert k-${al.kind}${isOpen ? ' open' : ''}`}>
              <div className="wx-alert-row">
                <span className="wx-alert-ic"><Icon name={al.kind === 'guest' ? 'clock' : 'alert'} size={18} /></span>
                <div className="wx-alert-text"><b>{rec.title}</b><span>{rec.sub}</span></div>
                <button className={isOpen ? '' : 'primary'} onClick={() => show(isOpen ? null : al.id)}>
                  {isOpen ? 'Close preview' : <><Icon name="sparkle" size={15} /> Agent&apos;s recommendation</>}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {open && (() => {
        const count = open.rec.items.filter(i => !off.has(i.key)).length;
        return (
          <aside className="rec-float" aria-label="Agent's recommendation">
            <div className="rec-float-head">
              <span><Icon name="sparkle" size={14} /> Agent&apos;s recommendation</span>
              <button className="ghost small" aria-label="Close" onClick={() => show(null)}><Icon name="x" size={16} /></button>
            </div>
            <b className="rec-float-title">{open.rec.title}</b>
            <p className="wx-what">{open.rec.what}</p>
            <ul className="wx-list">
              {open.rec.items.map(i => (
                <li key={i.key}><label>
                  <input type="checkbox" checked={!off.has(i.key)} onChange={() => toggle(i.key)} />
                  <span>{i.text}</span>
                </label></li>
              ))}
            </ul>
            <div className={`rec-float-foot${ready ? ' ready' : ''}`}>
              <button className="primary big" disabled={!count || busy || !ready} onClick={approve}>{busy ? 'Working…' : `Approve ${count}`}</button>
            </div>
          </aside>
        );
      })()}
    </>
  );
}

/** Guests the agent has flagged as running late (still late after the plan is approved, until a reset). */
export function lateGuestId(s: AgentStore): string | null {
  const f = s.agent.f;
  return (f.people.find(p => p.name === 'Pavel Kettering') ?? f.people.find(p => p.role === 'guest'))?.id ?? null;
}
export function useLateGuests(s: AgentStore): Set<string> {
  const [alerts] = useAlerts();
  const id = alerts.some(a => a.kind === 'guest') ? lateGuestId(s) : null;
  return new Set(id ? [id] : []);
}
