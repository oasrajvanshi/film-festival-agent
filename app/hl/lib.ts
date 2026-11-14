'use client';
// Shared client code for the three apps: data from the ops backend, the
// signed-in person, time formatting, alerts and recommendation previews.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BriefNote, Conditions, Decision, DecisionOption, Flag, Iso, OptionKey, OutboxItem, PlannedAction, ReviewItem, SessionChange, Shift, Timer } from '../../src/backend/domain/types';
import { render } from '../../src/backend/engine/templates';

// ---------------------------------------------------------------- data shapes

export interface Session {
  id: string; day: number; title: string; kind: 'screening' | 'qa' | 'panel' | 'market' | 'activity';
  venueId: string; room?: string; filmId?: string; start: Iso; end: Iso; guestIds: string[]; expected: number; status: 'scheduled' | 'cancelled';
  /** Added by approved decisions. */
  addedSpeakers?: string[]; notes?: string[]; moved?: boolean; was?: { start: Iso; end: Iso };
}
export interface Venue { id: string; name: string; capacity: number }
export interface Guest { id: string; name: string; role: string; badge: string }
export interface Staff { id: string; name: string; team: string; title: string; lead: boolean; channels: string[]; shifts: Shift[] }
export interface Attendee { id: string; name: string; role: string; passType?: string; validDays: number[]; eventIds: string[]; channels: string[] }
export interface Festival {
  source: string;
  info: { name: string; dates: Record<string, string>; timezone: string };
  venues: Venue[]; sessions: Session[]; guests: Guest[]; staff: Staff[]; audience: Attendee[];
  shuttles: { id: string; name: string; stops: string[]; everyMin: number }[];
  teams: Record<string, string>; models: string[];
}
export interface OpsView {
  clock: Iso; decisions: Decision[]; flags: Flag[]; outbox: OutboxItem[]; briefs: Record<string, BriefNote[]>; review: ReviewItem[];
  timers: Timer[]; conditions: Conditions; overrides: Record<string, { start?: Iso; end?: Iso; addedSpeakers?: string[]; notes?: string[] }>;
}

// ---------------------------------------------------------------- fetching

let festCache: Promise<Festival> | null = null;
export function loadFestival(): Promise<Festival> {
  festCache ??= fetch('/api/ops/festival', { cache: 'no-store' }).then(async r => {
    if (!r.ok) { festCache = null; throw new Error((await r.json().catch(() => ({}))).message ?? 'Could not load the festival'); }
    return r.json();
  });
  return festCache;
}

export function useOps(pollMs = 2500) {
  const [fest, setFest] = useState<Festival | null>(null);
  const [state, setState] = useState<OpsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/ops/state', { cache: 'no-store' });
      if (!r.ok) throw new Error('The festival backend is not answering');
      const s = await r.json() as OpsView;
      if (alive.current) { setState(s); setError(null); }
    } catch (e) { if (alive.current) setError((e as Error).message); }
  }, []);
  useEffect(() => {
    alive.current = true;
    loadFestival().then(f => alive.current && setFest(f), e => setError((e as Error).message));
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => { alive.current = false; clearInterval(t); };
  }, [pollMs, refresh]);
  return { fest, state, error, refresh };
}

export async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.message ?? 'Something went wrong'), { code: data.error ?? 'server', status: r.status });
  return data as T;
}

export function decide(d: Decision, option: OptionKey | null, by: string, action: 'approve' | 'reject' = 'approve') {
  return post<{ decision: Decision }>(`/api/ops/decisions/${d.id}`, { action, option, by, version: d.version });
}

export interface DemoState { name: string; title: string; played: string[]; upcoming: { at: string; note: string }[]; clock: Iso }
export const demo = (name: string, action: 'start' | 'next') => post<DemoState>('/api/ops/demo', { name, action });

// ---------------------------------------------------------------- who is using the app

export type Role = 'attendee' | 'team' | 'staff';
export interface Who { role: Role; id: string; channels?: string[] }

export function readWho(role: Role): Who | null {
  try {
    const raw = localStorage.getItem(`hl:who:${role}`);
    return raw ? JSON.parse(raw) as Who : null;
  } catch { return null; }
}
export function saveWho(w: Who) {
  try { localStorage.setItem(`hl:who:${w.role}`, JSON.stringify(w)); localStorage.setItem('hl:role', w.role); } catch { /* private mode: session only */ }
}

/** A sample attendee whose plan the scenarios touch, for a first open without onboarding. */
export function sampleAttendees(f: Festival): Attendee[] {
  const touched = ['e-003', 'e-056', 'e-023', 'e-040', 'e-004'];
  return [...f.audience].map(a => ({ a, score: a.eventIds.filter(e => touched.includes(e)).length * 10 + a.eventIds.filter(e => f.sessions.find(s => s.id === e)?.day === 1).length }))
    .sort((x, y) => y.score - x.score).map(x => x.a);
}
export function sampleStaff(f: Festival): Staff[] {
  // Volunteers on shift on day 1, door teams first (the snow and delay briefs reach them).
  const vols = f.staff.filter(s => !s.lead && s.shifts.some(sh => sh.day === 1));
  const order = ['door', 'usher', 'info_desk', 'projection', 'security', 'runner'];
  const first = (s: Staff) => s.shifts.filter(sh => sh.day === 1).map(sh => sh.start).sort()[0] ?? '';
  return vols.sort((a, b) => ((order.indexOf(a.team) + 1 || 99) - (order.indexOf(b.team) + 1 || 99)) || first(a).localeCompare(first(b)) || a.name.localeCompare(b.name));
}
export const TEAM_LEADS = ['p-001', 'p-002', 'p-008', 'p-005'];

// ---------------------------------------------------------------- time

export const toMin = (iso: Iso) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
export function fmt(iso: Iso, short = false): string {
  const h = Number(iso.slice(11, 13)), m = iso.slice(14, 16);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return short ? `${h12}:${m}` : `${h12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}
export function dayLabel(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return { wd: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), n: d.getUTCDate(), month: d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) };
}
export function dayOf(f: Festival, iso: Iso): number {
  const e = Object.entries(f.info.dates).find(([, d]) => iso.startsWith(d));
  return e ? Number(e[0]) : 1;
}
export function inMinutes(n: number): string {
  if (n < 60) return `${n} min`;
  const h = Math.round(n / 30) / 2;
  return `${h % 1 ? h.toFixed(1) : h} hour${h === 1 ? '' : 's'}`;
}
export const initials = (name: string) => name.split(/\s+/).map(p => p[0]).slice(0, 2).join('');
export const firstName = (name: string) => name.split(' ')[0];

// ---------------------------------------------------------------- plan

/** The plan as it stands: sheet times plus approved changes. */
export function currentPlan(f: Festival, s: OpsView | null): Session[] {
  return f.sessions.map(x => {
    const o = s?.overrides[x.id];
    if (!o) return x;
    const start = o.start ?? x.start, end = o.end ?? x.end;
    return { ...x, start, end, addedSpeakers: o.addedSpeakers, notes: o.notes, moved: start !== x.start, was: start !== x.start ? { start: x.start, end: x.end } : undefined };
  });
}

/** The plan with proposed changes laid over it (for the recommendation preview). */
export function previewPlan(plan: Session[], changes: SessionChange[]): Session[] {
  if (!changes.length) return plan;
  return plan.map(x => {
    const cs = changes.filter(c => c.sessionId === x.id);
    if (!cs.length) return x;
    let out = { ...x };
    for (const c of cs) {
      if (c.start && c.start !== out.start) out = { ...out, was: out.was ?? { start: out.start, end: out.end }, start: c.start, end: c.end ?? out.end, moved: true };
      if (c.addSpeaker) out = { ...out, addedSpeakers: [...new Set([...(out.addedSpeakers ?? []), c.addSpeaker])] };
      if (c.note) out = { ...out, notes: [...(out.notes ?? []), c.note] };
    }
    return out;
  });
}

export function changesOf(o: DecisionOption | undefined): SessionChange[] {
  return (o?.actions ?? []).filter(a => a.kind === 'schedule_change' && a.change).map(a => a.change!);
}

// ---------------------------------------------------------------- alerts

export interface Alert {
  id: string;
  kind: 'weather' | 'guest' | 'review';
  level: 'amber' | 'red';
  title: string;
  sub: string;
  decisions: Decision[];
  review?: ReviewItem;
  guestId?: string;
}

export function snowWindow(c: Conditions | undefined) {
  const hours = (c?.forecast?.hourly ?? []).filter(h => h.snowIn >= 0.1).sort((a, b) => a.hour.localeCompare(b.hour));
  if (!hours.length) return null;
  const total = Math.round((c!.forecast!.hourly.reduce((n, h) => n + h.snowIn, 0)) * 10) / 10;
  const last = hours[hours.length - 1].hour;
  return { start: hours[0].hour, end: `${last.slice(0, 11)}${String(Number(last.slice(11, 13)) + 1).padStart(2, '0')}:00`, total };
}

export function weatherTitle(s: OpsView): { title: string; sub: string } {
  const w = snowWindow(s.conditions);
  const late = Object.entries(s.conditions.shuttleDelays).filter(([, d]) => d > 0).map(([, d]) => `Harbor Loop ${d} min late`);
  if (!w) return { title: 'Weather change', sub: late.join(' · ') };
  const until = toMin(w.start) - toMin(s.clock);
  const title = until > 0 ? `Snow coming in ${inMinutes(until)}` : `Snow since ${fmt(w.start)}`;
  return { title, sub: [`About ${w.total} in, ${fmt(w.start)} to ${fmt(w.end)}`, ...late].join(' · ') };
}

export function guestOf(d: Decision): string | undefined {
  return d.key.startsWith('guest:') ? d.key.split(':')[1] : undefined;
}

export function groupAlerts(f: Festival, s: OpsView, keep: string[] = []): Alert[] {
  const live = s.decisions.filter(d => d.status === 'open' || keep.includes(d.id));
  const alerts: Alert[] = [];
  const weather = live.filter(d => d.scenario === 'weather');
  if (weather.length) {
    const t = weatherTitle(s);
    alerts.push({ id: 'weather', kind: 'weather', level: 'amber', title: t.title, sub: t.sub, decisions: weather.sort((a, b) => a.deadline.localeCompare(b.deadline)) });
  }
  const byGuest = new Map<string, Decision[]>();
  for (const d of live.filter(x => x.scenario === 'guest')) {
    const g = guestOf(d) ?? d.id;
    byGuest.set(g, [...(byGuest.get(g) ?? []), d]);
  }
  for (const [gid, ds] of byGuest) {
    const name = f.guests.find(g => g.id === gid)?.name ?? 'A guest';
    const certain = ds.some(d => /will miss/.test(d.why));
    const session = ds[0].why.match(/"([^"]+)"/)?.[1];
    const eta = ds[0].why.match(/ETA ([^,]+)/)?.[1];
    const call = ds[0].why.match(/(\d{1,2}:\d{2} [ap]m) call/)?.[1];
    alerts.push({
      id: `guest:${gid}`, kind: 'guest', level: certain ? 'red' : 'amber', guestId: gid,
      title: certain ? `${name} is running late` : `${name} may be late`,
      sub: [session && `"${session}"`, call && `call ${call}`, eta && `ETA ${eta}`].filter(Boolean).join(' · '),
      decisions: ds,
    });
  }
  for (const r of s.review) {
    alerts.push({ id: `review:${r.id}`, kind: 'review', level: 'amber', title: 'A message needs a person', sub: `From ${r.from} · ${r.reason}`, decisions: [], review: r });
  }
  return alerts;
}

// ---------------------------------------------------------------- change rows (the links in the panel)

export interface ChangeRow { key: string; icon: 'move' | 'swap' | 'people' | 'message' | 'bus' | 'brief' | 'clock'; text: string; small?: string; msg?: string; internal?: boolean; sessionId?: string }

function textOf(a: PlannedAction): string | undefined {
  try { return a.template ? render(a.template, a.vars) : undefined; } catch { return undefined; }
}

export function changeRows(f: Festival, plan: Session[], o: DecisionOption): ChangeRow[] {
  const rows: ChangeRow[] = [];
  const byKind = (k: PlannedAction['kind']) => o.actions.filter(a => a.kind === k);
  for (const [i, a] of byKind('schedule_change').entries()) {
    const c = a.change!;
    const s = plan.find(x => x.id === c.sessionId);
    if (c.start && s) rows.push({ key: `m${i}`, icon: 'move', text: `"${s.title}" ${fmt(s.start)} → ${fmt(c.start)}`, small: f.venues.find(v => v.id === s.venueId)?.name, sessionId: s.id });
    else if (c.addSpeaker) rows.push({ key: `s${i}`, icon: 'swap', text: `${f.guests.find(g => g.id === c.addSpeaker)?.name ?? 'Backup'} joins "${s?.title ?? ''}"`, small: c.note, sessionId: c.sessionId });
    else rows.push({ key: `n${i}`, icon: 'move', text: a.summary, small: c.note, sessionId: c.sessionId });
  }
  const casts = byKind('broadcast');
  if (casts.length) {
    const people = casts.reduce((n, a) => n + Number(a.summary.match(/(\d+)/)?.[1] ?? 0), 0);
    rows.push({ key: 'b', icon: 'people', text: casts.length === 1 ? casts[0].summary : `Tell ${people} people in ${casts.length} audiences`, small: casts.length > 1 ? casts.map(a => a.summary.replace(/^Tell \d+ people with /, '').replace(/ in their plan$/, '')).join(', ') : undefined, msg: textOf(casts[0]) });
  }
  for (const [i, a] of byKind('message_guest').entries()) rows.push({ key: `g${i}`, icon: 'message', text: a.summary, msg: textOf(a) });
  for (const [i, a] of byKind('vendor_order').entries()) rows.push({ key: `v${i}`, icon: 'bus', text: a.summary, small: a.vendor ? `$${a.vendor.cost}` : undefined, msg: textOf(a) });
  const internal = [...byKind('staff_heads_up'), ...byKind('update_brief')];
  if (internal.length) rows.push({ key: 'i', icon: 'brief', internal: true, text: internal.length === 1 ? internal[0].summary : `${internal.length} staff briefs`, small: internal.length > 1 ? [...new Set(internal.map(a => a.summary))].join(', ') : 'Staff only', msg: textOf(internal[0]) });
  for (const [i, a] of byKind('watch').entries()) rows.push({ key: `w${i}`, icon: 'clock', internal: true, text: a.summary, small: 'Nothing goes out' });
  return rows;
}

export function ownerName(f: Festival, team: string) { return f.teams[team] ?? team; }

export function canApprove(f: Festival, staffId: string, owner: string) {
  const s = f.staff.find(x => x.id === staffId);
  return !!s && s.lead && (s.team === owner || s.team === 'operations' || s.team === 'director');
}

export function recommendedBy(d: Decision): string {
  const r = d.agentRecommendation;
  return r.via === 'llm' ? `Recommended by ${r.model ?? 'the model'}, checked by the rules` : 'Recommended by the rules';
}

// ---------------------------------------------------------------- messages for a person

export function messagesForAttendee(s: OpsView, f: Festival, a: Attendee): OutboxItem[] {
  const days = new Set([...a.validDays, ...a.eventIds.map(e => f.sessions.find(x => x.id === e)?.day).filter((d): d is number => !!d)]);
  return s.outbox.filter(o => o.kind === 'broadcast' && (
    (o.address.startsWith('segment:day:') && days.has(Number(o.address.slice(12)))) ||
    (o.address.startsWith('segment:event:') && a.eventIds.includes(o.address.slice(14)))))
    .filter((o, i, xs) => xs.findIndex(x => x.key === o.key && x.text === o.text) === i);
}

export function messagesForStaff(s: OpsView, person: Staff): OutboxItem[] {
  return s.outbox.filter(o => o.to.startsWith(`${person.name} (`));
}

export function briefsForStaff(s: OpsView, person: Staff, day: number): (BriefNote & { where: string })[] {
  const keys = new Set<string>([person.team, person.id]);
  for (const sh of person.shifts.filter(x => x.day === day)) keys.add(`${person.team}@${sh.venueId}`);
  return Object.entries(s.briefs).filter(([k]) => keys.has(k)).flatMap(([k, ns]) => ns.map(n => ({ ...n, where: k })))
    .sort((a, b) => b.at.localeCompare(a.at));
}

// ---------------------------------------------------------------- one image per event

const TALK_IMAGES = ['talk-stage', 'talk-speaker'];
/** Each film has its own still; Q&As use their film's; talks, the market and receptions share a few. */
export function imageFor(s: Pick<Session, 'kind' | 'filmId' | 'title' | 'id'>): string {
  if (s.filmId) return `/hl/ev/${s.filmId}.jpg`;
  if (s.kind === 'qa') return '/hl/ev/talk-qa.jpg';
  if (s.kind === 'market') return '/hl/ev/market.jpg';
  if (s.kind === 'activity') return '/hl/ev/reception.jpg';
  const n = [...s.title].reduce((h, c) => h + c.charCodeAt(0), 0);
  return `/hl/ev/${TALK_IMAGES[n % TALK_IMAGES.length]}.jpg`;
}

// ---------------------------------------------------------------- one sentence, then a checklist

const sessionOf = (f: Festival, d: Decision) => f.sessions.find(s => s.id === d.key.split(':')[2]);

/** What happened, in one plain sentence. */
export function explain(f: Festival, s: OpsView, a: Alert): string {
  if (a.kind === 'review' && a.review) return `An unknown number sent this message. The agent did not act on it and nothing was sent.`;
  if (a.kind === 'weather') {
    const w = snowWindow(s.conditions);
    const late = Object.values(s.conditions.shuttleDelays).find(d => d > 0);
    const snow = w ? `Snow is expected from ${fmt(w.start)} to ${fmt(w.end)}` : 'The weather is changing';
    return late ? `${snow}, and the Harbor Loop shuttle is already ${late} minutes late.` : `${snow}.`;
  }
  const d = a.decisions[0];
  const name = f.guests.find(g => g.id === a.guestId)?.name ?? 'A guest';
  const ses = sessionOf(f, d);
  const venue = ses ? f.venues.find(v => v.id === ses.venueId)?.name : undefined;
  const eta = d.why.match(/ETA (\d{1,2}:\d{2})(?: [ap]m)? to (\d{1,2}:\d{2} [ap]m)/);
  const when = eta ? `between ${eta[1]} and ${eta[2]}` : 'late';
  if (/will miss/.test(d.why) && ses) return `${name} is stuck on the way and will reach ${venue} ${when}, after "${ses.title}" starts at ${fmt(ses.start)}.`;
  if (ses) return `${name} may reach ${venue} ${when}, close to the start of "${ses.title}" at ${fmt(ses.start)}.`;
  return d.why;
}

/** One checklist line for a decision: what approving it will do. */
export function checkLabel(d: Decision, key: OptionKey): string {
  const o = d.options.find(x => x.key === key) ?? d.options[0];
  if (d.key.startsWith('weather:notice')) return key === 'A' ? `Send the snow notice to ${o.cost.people} pass holders` : 'Hold the snow notice until the snow starts';
  if (d.key.startsWith('weather:shuttle')) return key === 'A' ? 'Skip the extra bus for now, keep watching the shuttle' : `Order an extra bus on ${o.title.replace(/^Add one bus on /, '')}`;
  if (d.key.startsWith('weather:hold') && key === 'A') return `${o.title}, and tell the ${o.cost.people} people who planned to go`;
  return o.title.replace(/; /g, ', ');
}
