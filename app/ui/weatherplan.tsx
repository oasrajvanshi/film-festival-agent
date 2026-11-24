'use client';
// Weather on the Overview page. The agent watches the forecast in the
// background; when weather threatens the programme, an alert appears above
// the calendar. Opening its recommendation shows one sentence and a
// checklist while the calendar previews the moves; one approval makes it
// the new plan, and the plan before stays one tap away.
//
// The same goes for a key guest who can't make it (the Sundance sample's
// producer, whose flight is cancelled on Day 2): the agent recommends a
// stand-in already in town, a video link for her Q&A, and releasing her seats.
//
// For demos the alerts come from scripted feeds (src/data/sundance2027.ts,
// SCENARIOS): the producer on Day 2 and an upslope snowstorm on Day 3,
// brought in with the button at the bottom left.
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
import { Actor, Doodle } from './actor';
import { boardChanged } from './localkeys';
import { SCENARIOS } from '../../src/data/sundance2027';

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
/** The demo's two problems, brought in from the button on Overview: a producer who can't come, and snow. */
const DEMO_ALERTS: WxAlert[] = [
  { id: `guest-d${SCENARIOS.producer.day}`, kind: 'guest', day: SCENARIOS.producer.day as DayNumber, status: 'open' },
  { id: `snow-d${SCENARIOS.snow.day}`, kind: 'snow', day: SCENARIOS.snow.day as DayNumber, status: 'open' },
];
/** All quiet until someone brings the problems in. */
export function readAlerts(): WxAlert[] {
  try { const v = localStorage.getItem(ALERTS_KEY); return v ? JSON.parse(v) : []; } catch { return []; }
}
function writeAlerts(list: WxAlert[]) {
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify(list)); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
  boardChanged();
}
/** Demo toolbar: the agent "sees" this on that day. */
export function raiseAlert(kind: AlertKind, day: DayNumber) {
  const id = `${kind}-d${day}`;
  writeAlerts([...readAlerts().filter(a => a.id !== id), { id, kind, day, status: 'open' }]);
}
// Every time the organizer opens the app the day starts calm: problems show only after
// "Bring on the problems" is pressed (in this page load).
let broughtOn = false;
export const problemsBroughtOn = () => broughtOn;
export function resetAlerts() { broughtOn = false; writeAlerts([]); }
export function bringProblems() { broughtOn = true; writeAlerts(DEMO_ALERTS.map(a => ({ ...a }))); }

/**
 * Demo control: a small button that shows only when the pointer reaches the
 * bottom-left corner. It brings the three problems in, or calms things down.
 */
export function ProblemTrigger({ s }: { s: AgentStore }) {
  const [alerts] = useAlerts();
  const [busy, setBusy] = useState(false);
  const live = alerts.some(a => a.status === 'open');
  return (
    <div className="problem-trigger" data-lve-skip>
      <button disabled={busy} onClick={async () => {
        if (live) { resetAlerts(); return; }
        // Every run starts from the untouched schedule, so a rehearsal never leaves the real demo half-applied.
        setBusy(true);
        try { await s.reset(); } catch { /* still bring the problems on */ } finally { setBusy(false); }
        bringProblems(); logProblems(s); s.commit();
      }}>
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
/** marks: how a change that doesn't move an event is animated, e.g. 'video' or 'seats:4'. */
export interface Preview { events: FestivalEvent[]; moved: string[]; notes?: Record<string, string>; marks?: Record<string, string> }
interface Rec {
  title: string;
  sub: string;
  what: string;
  items: { key: string; text: string }[];
  /** The calendar as it would look with the given items unticked. */
  preview: (off: Set<string>) => Preview | null;
  apply: (want: (k: string) => boolean, by: string) => Promise<{ before: FestivalEvent[] | null }>;
}
/** One of the ways the agent offers to handle a problem, said plainly before any checklist. */
export interface RecOption { key: string; name: string; plain: string; suggested?: boolean; rec: Rec }

const dayName = (s: AgentStore, d: DayNumber) => new Date(`${s.agent.f.dates[d]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const channelFor = (p: { channels: string[] }) => (p.channels.includes('app_push') ? 'app_push' : p.channels.includes('sms') ? 'sms' : 'email') as OutboundMessage['channel'];

/** Send messages as one action, through the approval queue (approved here, by the organizer). */
function send(s: AgentStore, id: string, kind: Action['kind'], title: string, messages: OutboundMessage[], by: string) {
  if (!messages.length) return 0;
  const action: Action = { id: `${id}-${Date.now()}`, kind, title, rationale: 'Approved from a recommendation on Overview', messages };
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

function weatherRec(s: AgentStore, kind: WxKind, day: DayNumber, mode: 'shift' | 'keep' = 'shift'): Rec | null {
  const plan = planFor(s, kind, day);
  if (!plan) return null;
  const shifting = mode === 'shift' && plan.moved.length > 0;
  const items = [
    ...(shifting ? [{ key: 'shift', text: `Start ${plural(plan.moved.length, 'event')} ${plan.delay} min later` }] : []),
    ...(plan.people ? [{ key: 'people', text: shifting ? `Send ${plural(plan.people, 'person', 'people')} their new time` : `Tell ${plural(plan.people, 'person', 'people')} to allow ${plan.risk.extraTravelMin} extra minutes` }] : []),
    ...(kind === 'snow' ? [{ key: 'shuttle', text: SCENARIOS.snow.shuttle }] : []),
    ...(kind === 'snow' && s.agent.f.venues.some(v => v.id === 'v-chautauqua') && plan.after.some(e => e.day === day && e.venueId === 'v-chautauqua') ? [{ key: 'doors', text: SCENARIOS.snow.chautauqua }] : []),
    { key: 'team', text: `Brief ${plural(plan.staff, 'staff member')}${plan.volunteers ? ` and ${plural(plan.volunteers, 'volunteer')}` : ''}` },
  ];
  return {
    title: `${NAME[kind]} ${fmt(plan.risk.from)} to ${fmt(plan.risk.to)}`,
    sub: `Day ${day} · ${dayName(s, day)} · ${kind === 'snow' && hasDemoProblems(s) && day === SCENARIOS.snow.day ? SCENARIOS.snow.detail : 'from the forecast'}`,
    what: `${plan.starting ? `${plural(plan.starting, 'event')} start${plan.starting === 1 ? 's' : ''} in the ${kind === 'heat' ? 'heat' : kind === 'snow' ? 'snow' : 'storm'}` : 'Nothing starts in this window'}`
      + `${plan.people ? `, with ${plural(plan.people, 'person', 'people')} on the way` : ''}. Starting later ${WHY[kind].replace(/^so /, 'means ')}.`,
    items,
    preview: off => (shifting && !off.has('shift') ? { events: plan.after, moved: plan.moved } : null),
    apply: async (want, by) => {
      const before = s.agent.f.events.map(e => ({ ...e }));
      const moving = shifting && want('shift');
      if (moving) await regrid(s, plan.after, by, want('people'));
      const notes = planWeather(s.agent.f, [plan.risk], `${NAME[kind]} (forecast)`).filter(x =>
        (x.kind === 'notify_staff' || x.kind === 'update_brief') ? want('team')
          : x.kind === 'notify_people' ? want('people') && !moving : false);
      // Nothing moves: one plain line on people's phones (what, when, what to do), the details in the message.
      for (const act of notes) send(s, act.id, act.kind, act.title, (act.messages ?? []).map(m => act.kind === 'notify_people'
        ? { ...m, subject: `${NAME[kind]} ${fmt(plan.risk.from)} to ${fmt(plan.risk.to)}: allow ${plan.risk.extraTravelMin} extra minutes${kind === 'snow' ? ', more buses running' : ''}` } : m), by);
      if (kind === 'snow' && want('shuttle')) {
        const ops = s.agent.f.people.filter(p => p.role === 'festival_staff' && /operations|transport/.test(p.staffRole ?? ''));
        send(s, 'snow-shuttle', 'notify_staff', 'Shuttle runs more often through the snow', ops.map(p => ({ personId: p.id, channel: 'app_push', subject: SCENARIOS.snow.shuttle,
          body: `${NAME[kind]} ${fmt(plan.risk.from)} to ${fmt(plan.risk.to)}. ${SCENARIOS.snow.shuttleBody}` })), by);
      }
      if (kind === 'snow' && want('doors')) {
        const house = s.agent.f.people.filter(p => p.role === 'festival_staff' && /house_manager|operations/.test(p.staffRole ?? ''));
        send(s, 'snow-doors', 'notify_staff', 'Chautauqua opens its doors early', house.map(p => ({ personId: p.id, channel: 'app_push', subject: 'Chautauqua: doors 15 min early',
          body: `${NAME[kind]} ${fmt(plan.risk.from)} to ${fmt(plan.risk.to)}. Chautauqua's line is outdoors with no indoor waiting: open the house 15 minutes earlier than usual for each screening in the window and keep the steps salted.` })), by);
      }
      return { before: moving ? before : null };
    },
  };
}

/** Two ways through bad weather: move the events in it a little later, or keep the times and help people get there. */
function weatherOptions(s: AgentStore, kind: WxKind, day: DayNumber): RecOption[] {
  const plan = planFor(s, kind, day);
  const shift = weatherRec(s, kind, day, 'shift');
  const keep = weatherRec(s, kind, day, 'keep');
  if (!plan || !shift || !keep) return [];
  const help = kind === 'snow' ? 'Extra buses run on the HOP and CHAT routes' : 'The team is briefed';
  return [
    ...(plan.moved.length ? [{ key: 'shift', name: `Start the afternoon ${plan.delay} min later`, suggested: true, rec: shift,
      plain: `${plural(plan.moved.length, 'event')} in the ${kind === 'heat' ? 'heat' : kind} begin ${plan.delay} minutes later, so people have time to get there. ${help}.` }] : []),
    { key: 'keep', name: 'Keep the times, help people get there', suggested: !plan.moved.length, rec: keep,
      plain: `Nothing moves. ${help}${kind === 'snow' ? ', Chautauqua opens its doors early,' : ''} and ${plural(plan.people, 'person', 'people')} are told to allow ${plan.risk.extraTravelMin} extra minutes.` },
  ];
}

/**
 * The sample's people problem: a key producer can't make it at all. Her flight is
 * cancelled, so the agent recommends a stand-in already in town for her talk,
 * bringing her into the premiere Q&A by video, releasing her held seats, and
 * telling everyone on stage and behind it.
 */
function absentRec(s: AgentStore, day: DayNumber, mode: 'swap' | 'video' = 'swap'): Rec | null {
  const f = s.agent.f;
  const sc = SCENARIOS.producer;
  const prod = f.people.find(p => p.id === lateGuestId(s));
  if (!prod) return null;
  const first = prod.name.split(' ')[0];
  const mine = f.events.filter(e => e.day === day && e.status === 'scheduled' && e.guestIds.includes(prod.id)).sort((a, b) => a.start.localeCompare(b.start));
  if (!mine.length) return null;
  const talk = mine.find(e => e.kind === 'panel');
  const qa = mine.find(e => e.kind === 'qa');
  const premiere = qa ? f.events.find(e => e.kind === 'screening' && e.filmId === qa.filmId && e.end === qa.start) : mine.find(e => e.kind === 'screening');
  const venue = (e?: FestivalEvent) => f.venues.find(v => v.id === e?.venueId)?.name ?? 'the venue';
  const nameOf = (id: string) => f.people.find(p => p.id === id)?.name ?? '';
  // The stand-in: the named co-producer if in town, otherwise a guest already on the programme that day.
  const inTown = (p?: { id: string }) => !!p && f.events.some(e => e.day === day && e.guestIds.includes(p.id));
  const named = f.people.find(p => p.name === sc.backup);
  const backup = talk ? [named, ...f.people.filter(p => p.role === 'guest')]
    .find(p => p && p.id !== prod.id && !talk.guestIds.includes(p.id) && inTown(p)) : undefined;
  if (mode === 'swap' && !(talk && backup)) return null;
  const swap = mode === 'swap';
  const qaRest = qa ? qa.guestIds.filter(id => id !== prod.id).map(nameOf).filter(Boolean) : [];
  const held = premiere?.seatsHeld ? Math.min(4, premiere.seatsHeld) : 4;
  const others = talk ? talk.guestIds.filter(id => id !== prod.id).map(id => f.people.find(p => p.id === id)).filter(Boolean) as typeof f.people : [];
  const staff = f.people.filter(p => p.role === 'festival_staff');
  // Everyone with her talk, premiere or Q&A on their plan (tickets and saved events), and the volunteers working them.
  const hers = [talk, premiere, qa].filter(Boolean) as FestivalEvent[];
  const audience = [...new Set([...f.tickets, ...f.bookings].filter(b => hers.some(e => e.id === b.eventId)).map(b => b.personId))]
    .map(id => f.people.find(p => p.id === id)).filter(p => p && (p.role === 'attendee' || p.role === 'industry' || p.role === 'press')) as typeof f.people;
  const crew = [...new Set(f.shifts.filter(x => hers.some(e => e.venueId === x.venueId && overlaps(x.start, x.end, e.start, e.end))).map(x => x.personId))];
  const items = [
    ...(swap && talk && backup ? [{ key: 'swap', text: `${backup.name} takes ${first}'s seat at "${talk.title}"` }] : []),
    ...(swap && qa && qaRest.length ? [{ key: 'qa', text: `${qaRest.join(' and ')} take the ${fmt(qa.start)} Q&A without her` }] : []),
    ...(!swap && talk ? [{ key: 'videoTalk', text: `${first} joins "${talk.title}" at ${fmt(talk.start)} by video` }] : []),
    ...(!swap && qa ? [{ key: 'video', text: `${first} joins the ${fmt(qa.start)} Q&A by video` }] : []),
    ...(premiere ? [{ key: 'seats', text: `Release her ${held} held seats to the waitlist` }] : []),
    ...(audience.length ? [{ key: 'people', text: `Tell ${plural(audience.length, 'person', 'people')} with her talk or premiere in their plan` }] : []),
    { key: 'team', text: `Tell ${others.length ? `${plural(others.length, 'panelist')}, ` : ''}the moderator, ${plural(staff.length, 'staff member')}${crew.length ? ` and ${plural(crew.length, 'volunteer')}` : ''}` },
  ];
  const plan = (off: Set<string>) => {
    const after = f.events.map(e => ({ ...e, guestIds: [...e.guestIds] }));
    const notes: Record<string, string> = {};
    const marks: Record<string, string> = {};
    const moved: string[] = [];
    const ev = (id?: string) => after.find(e => e.id === id);
    if (swap && talk && backup && !off.has('swap')) {
      const t = ev(talk.id)!;
      t.guestIds = [backup.id, ...t.guestIds.filter(g => g !== prod.id)];
      notes[talk.id] = `${backup.name} replaces ${first}`; moved.push(talk.id);
    }
    if (swap && qa && qaRest.length && !off.has('qa')) {
      const q = ev(qa.id)!;
      q.guestIds = q.guestIds.filter(g => g !== prod.id);
      notes[qa.id] = `${qaRest.join(' and ')} take the Q&A`; moved.push(qa.id);
    }
    if (!swap && talk && !off.has('videoTalk')) { notes[talk.id] = `${first} joins by video`; marks[talk.id] = 'video'; moved.push(talk.id); }
    if (!swap && qa && !off.has('video')) { notes[qa.id] = `${first} joins by video`; marks[qa.id] = 'video'; moved.push(qa.id); }
    if (premiere && !off.has('seats')) {
      const p = ev(premiere.id)!;
      p.seatsHeld = Math.max(0, (p.seatsHeld ?? held) - held);
      notes[premiere.id] = `${held} held seats to the waitlist`; marks[premiere.id] = `seats:${held}`; moved.push(premiere.id);
    }
    return { after, notes, marks, moved };
  };
  return {
    title: `${prod.name} can't make it`,
    sub: `${sc.cause} · Day ${day} · ${dayName(s, day)}`,
    what: `${first} produced "${f.films.find(x => x.id === (qa ?? premiere)?.filmId)?.title ?? 'her film'}". ${sc.why}`,
    items,
    preview: off => { const p = plan(off); return p.moved.length ? { events: p.after, moved: p.moved, notes: p.notes, marks: p.marks } : null; },
    apply: async (want, by) => {
      const before = f.events.map(e => ({ ...e, guestIds: [...e.guestIds] }));
      const off = new Set(items.map(i => i.key).filter(k => !want(k)));
      const p = plan(off);
      const swapping = swap && want('swap') && !!talk && !!backup;
      const qaSwap = swap && want('qa') && !!qa && qaRest.length > 0;
      const talkVideo = !swap && want('videoTalk') && !!talk;
      const qaVideo = !swap && want('video') && !!qa;
      const regridding = swapping || qaSwap || want('seats');
      if (regridding) await regrid(s, p.after, by, false);
      const lands = fmt(sc.lands);
      if (swapping && backup && talk) send(s, 'absent-backup', 'notify_people', `${backup.name} asked to take ${first}'s seat`, [{ personId: backup.id, channel: channelFor(backup), subject: `Could you join "${talk.title}" at ${fmt(talk.start)}?`,
        body: `${prod.name} can't reach Boulder today (${sc.cause.toLowerCase()}). Could you take her seat at "${talk.title}", ${fmt(talk.start)} at ${venue(talk)}? Guest relations will meet you at the stage door 20 minutes before.` }], by);
      const videoLine = [talkVideo && talk ? `"${talk.title}" at ${fmt(talk.start)}` : '', qaVideo && qa ? `the ${fmt(qa.start)} Q&A at ${venue(qa)}` : ''].filter(Boolean).join(' and ');
      send(s, 'absent-guest', 'notify_people', `${prod.name} told the new plan`, [{ personId: prod.id, channel: channelFor(prod), subject: 'We have today covered',
        body: `Sorry about the flight. ${swapping && backup && talk ? `${backup.name} takes your seat at "${talk.title}". ` : ''}${qaSwap ? `${qaRest.join(' and ')} take the ${fmt(qa!.start)} Q&A. ` : ''}${videoLine ? `We'll bring you into ${videoLine} by video; the AV team will send a link and test it an hour before. ` : ''}Your car is moved to meet the ${lands} arrival at DEN.` }], by);
      if (want('people')) {
        send(s, 'absent-people', 'notify_people', `${audience.length} people told about ${prod.name}`, audience.map(p => {
          const mineHere = hers.filter(e => [...f.tickets, ...f.bookings].some(b => b.personId === p.id && b.eventId === e.id));
          const lines = mineHere.map(e => e.kind === 'panel'
            ? (swapping && backup ? `"${e.title}" at ${fmt(e.start)} goes ahead with ${backup.name} in her seat.` : talkVideo ? `"${e.title}" at ${fmt(e.start)} goes ahead; she joins by video from New York.` : `"${e.title}" at ${fmt(e.start)} goes ahead without her.`)
            : e.kind === 'qa' || e === premiere ? (qaVideo ? `The ${fmt((qa ?? e).start)} Q&A after "${f.films.find(x => x.id === e.filmId)?.title ?? e.title}" goes ahead; she joins by video from New York.` : qaSwap ? `The ${fmt((qa ?? e).start)} Q&A goes ahead with ${qaRest.join(' and ')}.` : `"${e.title}" goes ahead as planned.`) : '');
          // One line says it all (who, which event, when, where); the details are in the message.
          const firstHere = mineHere.sort((a, b) => a.start.localeCompare(b.start))[0];
          const byVideo = firstHere && ((firstHere.kind === 'panel' && talkVideo) || (firstHere.kind !== 'panel' && qaVideo));
          return { personId: p.id, channel: channelFor(p), subject: byVideo ? `${prod.name} joins by video at ${venue(firstHere)}, ${fmt(firstHere.start)}` : `${prod.name} can't make it to ${venue(firstHere)} at ${fmt(firstHere.start)}`,
            body: `${prod.name}'s flight from New York was cancelled. ${[...new Set(lines)].filter(Boolean).join(' ')} Nothing else in your plan changes.` };
        }), by);
      }
      if (want('team')) {
        if (crew.length) send(s, 'absent-brief', 'update_brief', `Briefs updated for ${crew.length} volunteers`, crew.map(id => ({ personId: id, channel: 'volunteer_brief' as const, subject: `${prod.name} not in Boulder today`,
          body: `${talk && swapping && backup ? `"${talk.title}" (${fmt(talk.start)}): ${backup.name} replaces ${prod.name}. ` : ''}${talk && talkVideo ? `"${talk.title}" (${fmt(talk.start)}): ${first} joins on screen by video. ` : ''}${premiere && want('seats') ? `${fmt(premiere.start)} premiere: ${held} more seats go to the e-Waitlist line at start time. ` : ''}${qa && qaVideo ? `${fmt(qa.start)} Q&A: ${first} joins on screen by video; keep the house lights at half.` : ''}${qa && qaSwap ? `${fmt(qa.start)} Q&A: ${qaRest.join(' and ')} on stage.` : ''}` })), by);
        if (talk) send(s, 'absent-panel', 'notify_people', `Panelists told about ${prod.name}`, others.map(p => ({ personId: p.id, channel: channelFor(p), subject: `${prod.name} can't make "${talk.title}" in person`,
          body: `${prod.name}'s flight was cancelled.${swapping && backup ? ` ${backup.name} joins you on stage at ${fmt(talk.start)}.` : talkVideo ? ` She joins the panel by video at ${fmt(talk.start)}.` : ''}` })), by);
        send(s, 'absent-staff', 'notify_staff', `Staff told about ${prod.name}`, staff.map(p => ({ personId: p.id, channel: 'app_push', subject: `${prod.name} not in Boulder today`,
          body: `${sc.cause}. ${swapping && backup && talk ? `${backup.name} takes her seat at "${talk.title}" (${fmt(talk.start)}, ${venue(talk)}). ` : ''}${videoLine ? `Video link for ${videoLine}: AV test an hour before. ` : ''}${premiere && want('seats') ? `${held} held seats at ${fmt(premiere.start)} go to the waitlist. ` : ''}Driver moved to the ${lands} DEN arrival.` })), by);
      }
      return { before: regridding ? before : null };
    },
  };
}

/** Two ways when a guest can't come: someone already in town steps in, or the guest joins by video. */
function absentOptions(s: AgentStore, day: DayNumber): RecOption[] {
  const f = s.agent.f;
  const swap = absentRec(s, day, 'swap');
  const video = absentRec(s, day, 'video');
  const prod = f.people.find(p => p.id === lateGuestId(s));
  if (!prod) return [];
  const first = prod.name.split(' ')[0];
  const mine = f.events.filter(e => e.day === day && e.status === 'scheduled' && e.guestIds.includes(prod.id));
  const talk = mine.find(e => e.kind === 'panel');
  const qa = mine.find(e => e.kind === 'qa');
  const backupName = swap?.items.find(i => i.key === 'swap')?.text.split(' takes ')[0] ?? SCENARIOS.producer.backup;
  const qaRest = qa ? qa.guestIds.filter(id => id !== prod.id).map(id => f.people.find(p => p.id === id)?.name).filter(Boolean) as string[] : [];
  const when = [talk ? `the ${fmt(talk.start)} talk` : '', qa ? `the ${fmt(qa.start)} Q&A` : ''].filter(Boolean).join(' and ');
  return [
    ...(swap ? [{ key: 'swap', name: `${backupName.split(' ')[0]} steps in`, suggested: true, rec: swap,
      plain: `${backupName}, already in Boulder for the premiere, takes ${first}'s seat at ${talk ? `the ${fmt(talk.start)} talk` : 'her talk'}.${qa && qaRest.length ? ` The ${fmt(qa.start)} Q&A goes ahead with ${qaRest.join(' and ')}.` : ''}` }] : []),
    ...(video ? [{ key: 'video', name: `${first} joins by video`, suggested: !swap, rec: video,
      plain: `${first} stays on the program and joins ${when || 'her events'} on screen from New York. Nobody is replaced.` }] : []),
  ];
}

/** The ways the agent offers for one problem, its suggestion first. */
export function optionsFor(s: AgentStore, al: WxAlert): RecOption[] {
  return al.kind === 'guest' ? absentOptions(s, al.day) : weatherOptions(s, al.kind, al.day);
}

/** The agent's suggested way (the first option): used for titles and the log. */
function recFor(s: AgentStore, al: WxAlert): Rec | null {
  return optionsFor(s, al)[0]?.rec ?? null;
}

/**
 * The alerts above the calendar. Each shows what the agent saw. Its recommendation opens in two
 * steps: first the ways to handle it, said plainly (the agent's suggestion marked); then, for the
 * way picked, the checklist of what will happen, nothing ticked until a person ticks it.
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
  // The way picked for each problem, and the changes ticked (keys "<alert id>:<item key>").
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [on, setOn] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // A moment after approving: what got done, with a small cheerful figure, then it fades.
  const [done, setDone] = useState<{ changes: number; sent: number } | null>(null);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(null), 5000); return () => clearTimeout(t); }, [done]);
  // On a phone the checklist stays folded behind "View changes" so opening a fix barely moves the page.
  const [listOpen, setListOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = matchMedia('(max-width: 760px)');
    const set = () => setPhone(m.matches);
    set();
    m.addEventListener('change', set);
    return () => m.removeEventListener('change', set);
  }, []);
  const listShown = !phone || listOpen;
  const shown = alerts.filter(x => x.status === 'open' && s.agent.f.dates[x.day])
    .map(al => ({ al, options: optionsFor(s, al) })).filter(x => x.options.length > 0)
    .sort((x, y) => x.al.day - y.al.day || (x.al.kind === 'guest' ? -1 : 1));
  const SHORT: Record<AlertKind, string> = { guest: 'Guest', storm: 'Storm', snow: 'Snow', heat: 'Heat' };
  // "Fix them all" works through every open problem at once: a way for each, one checklist.
  const problems = openId === 'all' ? shown : shown.filter(x => x.al.id === openId);
  const picked = problems.map(p => ({ ...p, opt: p.options.find(o => o.key === choice[p.al.id]) }));
  const allPicked = picked.length > 0 && picked.every(p => !!p.opt);
  const items = allPicked ? picked.flatMap(({ al, opt }) => opt!.rec.items.map(i => ({ key: `${al.id}:${i.key}`, text: problems.length > 1 ? `${SHORT[al.kind]}: ${i.text}` : i.text }))) : [];
  const count = items.filter(i => on.has(i.key)).length;

  /** The calendar with what is ticked so far (nothing ticked: nothing moves yet). */
  const previewOf = (pk: typeof picked, ticked: Set<string>): Preview | null => {
    const cur = s.agent.f.events;
    const merged = new Map(cur.map(e => [e.id, { ...e }]));
    const moved = new Set<string>(); const notes: Record<string, string> = {}; const marks: Record<string, string> = {};
    for (const { al, opt } of pk) {
      if (!opt) continue;
      const off = new Set(opt.rec.items.map(i => i.key).filter(k => !ticked.has(`${al.id}:${k}`)));
      const p = opt.rec.preview(off);
      if (!p) continue;
      for (const id of p.moved) {
        const nxt = p.events.find(e => e.id === id); const base = cur.find(e => e.id === id);
        if (!nxt || !base) continue;
        const m = merged.get(id)!;
        if (nxt.start !== base.start) { m.start = nxt.start; m.end = nxt.end; }
        if (nxt.guestIds.join() !== base.guestIds.join()) m.guestIds = nxt.guestIds;
        if (nxt.seatsHeld !== base.seatsHeld) m.seatsHeld = nxt.seatsHeld;
        moved.add(id);
      }
      Object.assign(notes, p.notes ?? {}); Object.assign(marks, p.marks ?? {});
    }
    return moved.size ? { events: [...merged.values()], moved: [...moved], notes, marks } : null;
  };

  const show = (id: string | null) => {
    setOpenId(id); setChoice({}); setOn(new Set()); setListOpen(false);
    const first = id === 'all' ? shown[0] : shown.find(x => x.al.id === id);
    if (first) onOpen(first.al.day);
    onPreview(null);
    // On a phone the recommendation sits in the page above the calendar: bring both into view.
    if (first && matchMedia('(max-width: 760px)').matches) setTimeout(() => document.querySelector('.rec-float')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const pick = (alId: string, key: string | null) => {
    const next = { ...choice };
    if (key) next[alId] = key; else delete next[alId];
    setChoice(next); setOn(new Set()); onPreview(null);
    const day = shown.find(x => x.al.id === alId)?.al.day;
    if (key && day) onOpen(day);
  };
  const tick = (ticked: Set<string>) => { setOn(ticked); onPreview(previewOf(picked, ticked)); };
  const toggle = (k: string) => { const next = new Set(on); if (next.has(k)) next.delete(k); else next.add(k); tick(next); };
  const all = items.length > 0 && count === items.length;
  const doneNote = done && (
    <aside className="rec-done" role="status">
      <Doodle name="done" className="rec-done-doodle" />
      <div><b>All set.</b>
        <span><Actor kind="human" label={`You approved ${done.changes}`} /> <Actor kind="agent" label={`Usher sent ${done.sent.toLocaleString('en-US')} messages`} /></span></div>
    </aside>
  );
  if (!shown.length || !problemsBroughtOn()) return doneNote || null;

  const approve = async () => {
    if (!allPicked || !count) return;
    setBusy(true);
    // The agent visibly works for a moment first; the changes are applied and saved together
    // right after, so nothing read from the server in between can undo them.
    await new Promise(r => setTimeout(r, 3300));
    const chosen = new Set(on);
    const sentBefore = s.agent.outbox.length;
    const notes = previewOf(picked, chosen)?.notes ?? {};
    let before: FestivalEvent[] | null = null;
    // Approving is instant: the wording was already checked, so the model isn't asked to rephrase again.
    await s.agent.withoutModel(async () => {
      // One after another, each re-planned on the live agent on top of the last, so they never undo each other.
      for (const { al, opt } of picked) {
        const live = optionsFor(s, al).find(o => o.key === opt!.key)?.rec ?? opt!.rec;
        const r = await live.apply(k => chosen.has(`${al.id}:${k}`), user || 'Organizer');
        before = before ?? r.before;
      }
    });
    for (const { al, opt } of picked) {
      const mine = opt!.rec.items.filter(i => chosen.has(`${al.id}:${i.key}`));
      s.agent.log.add(`approved-${al.id}-${Date.now()}`, 'approval', `${user || 'Organizer'} chose "${opt!.name}" for "${opt!.rec.title}" and approved ${mine.length} of ${opt!.rec.items.length} changes (${mine.map(i => i.text).join('; ')})`);
    }
    s.commit();
    setBusy(false);
    setOpenId(null);
    onPreview(null);
    setDone({ changes: chosen.size, sent: s.agent.outbox.length - sentBefore });
    if (before) onApplied(before, notes);
    const doneIds = new Set(picked.map(p => p.al.id));
    setAlerts(alerts.map(x => (doneIds.has(x.id) ? { ...x, status: 'done' } : x)));
  };

  return (
    <>
      {doneNote}
      {/* Each problem on its own; with two or more, one button under them all handles them together. */}
      <div className={`wx-alerts${openId === 'all' ? ' all-open' : ''}`}>
        {shown.map(({ al, options }) => {
          const isOpen = openId === al.id || openId === 'all';
          const rec = options[0].rec;
          return (
            <div key={al.id} className={`wx-alert k-${al.kind}${isOpen ? ' open' : ''}`}>
              <div className="wx-alert-row">
                <span className="wx-alert-ic"><Icon name={al.kind === 'guest' ? 'clock' : 'alert'} size={18} /></span>
                <div className="wx-alert-text"><b>{rec.title}</b><span><Actor kind="agent" label="Flagged by Usher" /> {rec.sub}</span></div>
                <button className={openId === al.id ? '' : 'primary agent-btn'} onClick={() => show(openId === al.id ? null : al.id)}>
                  {openId === al.id ? 'Close' : <><Icon name="sparkle" size={15} /> <span className="lbl-long">Agent&apos;s recommendation</span><span className="lbl-short">Fix it</span></>}
                </button>
              </div>
            </div>
          );
        })}
        {shown.length >= 2 && (
          <div className="wx-all-foot">
            <button className={`wx-all-btn${openId === 'all' ? ' on' : ''}`} onClick={() => show(openId === 'all' ? null : 'all')}>
              <Icon name="sparkle" size={15} /> {openId === 'all' ? 'Close' : 'Fix them all'}
            </button>
          </div>
        )}
      </div>

      {problems.length > 0 && (
        <aside className={`rec-float${listShown ? ' list-open' : ''}${phone ? '' : ' desk'}${allPicked ? ' step-list' : ' step-ways'}`} aria-label="Agent's recommendation">
          <div className="rec-head"><Actor kind="agent" label="Usher's recommendation" /></div>
          {!allPicked ? (
            <div className="rec-ways">
              <Doodle name="options" className="rec-doodle" />
              <p className="rec-q">{problems.length > 1 ? 'Pick a way for each problem.' : 'Two ways to handle this. Pick one:'}</p>
              {problems.map(({ al, options }) => (
                <div key={al.id} className="rec-prob">
                  {problems.length > 1 && <b className="rec-prob-t">{options[0].rec.title}</b>}
                  {options.map(o => (
                    <button key={o.key} className={`rec-opt${choice[al.id] === o.key ? ' on' : ''}`} onClick={() => pick(al.id, o.key)}>
                      <span className="rec-opt-name">{o.name}{o.suggested && <Actor kind="agent" label="Suggested" />}</span>
                      <span className="rec-opt-plain">{o.plain}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <>
              <button className="rec-back ghost small" onClick={() => { setChoice({}); setOn(new Set()); onPreview(null); }}>‹ Other ways</button>
              <div className="rec-picked">{picked.map(p => <b key={p.al.id}>{p.opt!.name}</b>)}</div>
              {listShown && (
                <>
                  <label className="rec-all">
                    <input type="checkbox" checked={all} ref={el => { if (el) el.indeterminate = count > 0 && !all; }}
                      onChange={() => tick(all ? new Set() : new Set(items.map(i => i.key)))} />
                    <span>Select all</span>
                  </label>
                  <ul className="wx-list" id="rec-changes">
                    {items.map(i => (
                      <li key={i.key}><label>
                        <input type="checkbox" checked={on.has(i.key)} onChange={() => toggle(i.key)} />
                        <span>{i.text}</span>
                      </label></li>
                    ))}
                  </ul>
                </>
              )}
              <div className="rec-foot">
              <div className="rec-bar">
                {phone && (
                  <button className="rec-view ghost small" aria-expanded={listOpen} aria-controls="rec-changes" onClick={() => setListOpen(!listOpen)}>
                    <Icon name="sparkle" size={14} /> {listOpen ? 'Hide changes' : 'View changes'}
                  </button>
                )}
                <button className={`small rec-approve human-btn${count ? ' ready' : ''}`} disabled={!count || busy} onClick={approve}>
                  <Icon name="person" size={14} /> {busy ? 'Usher is working…' : count ? `Approve ${count}` : 'Approve'}
                </button>
              </div>
              <p className="rec-who"><Actor kind="human" label="You decide" /> <Actor kind="agent" label="Usher does the rest" /></p>
              </div>
            </>
          )}
        </aside>
      )}
    </>
  );
}

/** What the agent saw and worked out for the scripted problems, in its log (the Log page shows it live). */
function logProblems(s: AgentStore) {
  const log = s.agent.log;
  for (const al of DEMO_ALERTS) {
    const rec = recFor(s, al);
    if (!rec) continue;
    const run = `scripted-${al.id}-${Date.now()}`;
    if (al.kind === 'guest') {
      log.add(run, 'trigger', `Flight feed: ${SCENARIOS.producer.flight.replace(/ \(.*\)$/, '')} is cancelled. On board: ${SCENARIOS.producer.name}, producer`);
      log.add(run, 'understand', `${rec.title}. ${SCENARIOS.producer.why}`);
    } else {
      const plan = planFor(s, al.kind as WxKind, al.day);
      log.add(run, 'trigger', `Weather forecast for Boulder: ${rec.title.toLowerCase()} on ${dayName(s, al.day)}${al.kind === 'snow' ? `, ${SCENARIOS.snow.detail.replace(/, from the forecast$/, '')}` : ''}`);
      if (plan) log.add(run, 'understand', `${plan.starting} events start in the ${al.kind}; ${plan.people} people have plans then; ${plan.volunteers} volunteers are on shift`);
    }
    log.add(run, 'decide', `Recommendation ready: ${rec.items.map(i => i.text).join('; ')}`);
    log.add(run, 'ask', `Waiting for the organizer to approve the recommendation for "${rec.title}"`);
  }
  s.commit();
}

/** Guests the agent has flagged as running late (still late after the plan is approved, until a reset). */
export function lateGuestId(s: AgentStore): string | null {
  const f = s.agent.f;
  return (f.people.find(p => p.name === SCENARIOS.producer.name) ?? f.people.find(p => p.role === 'guest'))?.id ?? null;
}
/** The scripted problems belong to the sample festival only. */
export const hasDemoProblems = (s: AgentStore) => s.agent.f.people.some(p => p.name === SCENARIOS.producer.name);
export function useLateGuests(s: AgentStore): Set<string> {
  const [alerts] = useAlerts();
  const id = alerts.some(a => a.kind === 'guest') ? lateGuestId(s) : null;
  return new Set(id ? [id] : []);
}
