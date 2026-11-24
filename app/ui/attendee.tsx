'use client';
// The attendee app, phone only, after the first prototype:
//   Plan     the day as a timeline on a rail: each event, how to get to the
//            next one, a pick for free time, and what changed. When weather
//            puts a trip at risk, a decision card asks: keep it, or stay.
//   Map      the venues, your route for the day, walking times, what's on.
//   Updates  only about your plan.
//   Ask      questions about the festival.
// Your pass sits under your initials, top right.

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import qrcode from 'qrcode-generator';
import type { AgentStore } from './useAgent';
import type { Who } from '../../src/access/profiles';
import type { DayNumber, Festival, FestivalEvent } from '../../src/core/types';
import { festivalDays } from '../../src/core/types';
import { clock as fmt } from '../../src/core/time';
import { PASS_LABELS, qrFor } from '../../src/rules/access';
import { assessWeather, scenarioHours, type WeatherRisk } from '../../src/agent/weather';
import { EventThumb, Faces, eventImage } from './media';
import { Icon } from './icons';
import { Ask } from './panels';
import { MyArrival } from './presence';
import { useAlerts } from './weatherplan';
import { SCENARIOS } from '../../src/data/sundance2027';
import { Mascot } from './mascot';
import { CityBase, DayStrip, frameFor, usePlaced } from './venuemap';
import { PushBanner, UPDATE_ICON, UPDATE_LABEL, updateKind, useArrivals, useTheme } from './live';

type Why = 'Ticket' | 'Saved';
type Plan = { e: FestivalEvent; why: Why };
type Tab = 'plan' | 'map' | 'updates' | 'ask';

const tod = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const hm = (date: string, mins: number) => `${date}T${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const readOriginal = (): FestivalEvent[] => { try { const v = localStorage.getItem('usher-original-plan-v1'); return v ? JSON.parse(v) : []; } catch { return []; } };
/** What changed about an event besides its time (a stand-in, a video guest), as the organizer approved it. */
const readNotes = (): Record<string, string> => { try { const v = localStorage.getItem('usher-plan-notes-v1'); return v ? JSON.parse(v) : {}; } catch { return {}; } };
const venueName = (f: Festival, id: string) => f.venues.find(v => v.id === id)?.name ?? id;
const walk = (f: Festival, a: string, b: string) => (a === b ? 0 : f.travel?.[a]?.[b] ?? 20);

// A sheet's backdrop closes it, but not on the same tap that opened it
// (a touch can arrive as a second click on the backdrop drawn under the finger).
let sheetOpenedAt = 0;
const opened = () => { sheetOpenedAt = Date.now(); };
const settled = (close: () => void) => () => { if (Date.now() - sheetOpenedAt > 400) close(); };

const VENUE_TONES = ['#d49a5c', '#8fa0c4', '#93b27e', '#c97b9a', '#b9a36b', '#7fb0b5'];
const venueTone = (f: AgentStore['agent']['f'], id: string) => VENUE_TONES[Math.max(0, f.venues.findIndex(v => v.id === id)) % VENUE_TONES.length];

function MapIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></svg>;
}

/** The person's plan: tickets and saved events, in time order. */
function usePlan(s: AgentStore, who: Who, v: number) {
  const f = s.agent.f;
  return useMemo(() => {
    const out: Plan[] = [];
    const add = (eid: string, why: Why) => { const e = f.events.find(x => x.id === eid); if (e && !out.some(p => p.e.id === eid)) out.push({ e, why }); };
    for (const t of f.tickets) if (t.personId === who.id) add(t.eventId, 'Ticket');
    for (const b of f.bookings) if (b.personId === who.id) add(b.eventId, 'Saved');
    return out.sort((a, b) => a.e.start.localeCompare(b.e.start));
  }, [f, who.id, s.version, v]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Problems the festival team knows about but hasn't fixed yet (no plan approved), when they touch
 * this person's plan: a guest who may not make it, or weather on a day they have plans. Shown as a
 * heads-up so people hear about the risk early; the approved change replaces it.
 */
interface OpenRisk { id: string; day: DayNumber; line: string }
function useOpenRisks(s: AgentStore, plans: Plan[]): OpenRisk[] {
  const [alerts] = useAlerts();
  const f = s.agent.f;
  return useMemo(() => alerts.filter(a => a.status === 'open').flatMap((a): OpenRisk[] => {
    const mine = plans.filter(p => p.e.day === a.day && p.e.status === 'scheduled').sort((x, y) => x.e.start.localeCompare(y.e.start));
    if (a.kind === 'guest') {
      const guest = f.people.find(p => p.name === SCENARIOS.producer.name);
      const hit = guest && mine.find(p => p.e.guestIds.includes(guest.id));
      return guest && hit ? [{ id: a.id, day: a.day, line: `${guest.name} may not make it to ${venueName(f, hit.e.venueId)} at ${fmt(hit.e.start)}` }] : [];
    }
    if (!mine.length) return [];
    const risk = assessWeather(scenarioHours(f.dates[a.day], a.kind as 'storm' | 'snow' | 'heat'))[0];
    if (!risk) return [];
    const what = a.kind === 'snow' ? 'Snow' : a.kind === 'storm' ? 'Thunderstorms' : 'Heat';
    const when = new Date(`${f.dates[a.day]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return [{ id: a.id, day: a.day, line: `${what} forecast ${when}, ${fmt(risk.from)} to ${fmt(risk.to)}` }];
  }), [alerts, plans, f]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function AttendeeApp({ s, who, onOut, viewAs }: { s: AgentStore; who: Who; onOut: () => void; viewAs?: boolean }) {
  const [tab, setTab] = useState<Tab>('plan');
  const [me, setMe] = useState(false);
  const [v, setV] = useState(0); // bump after a change to the plan
  const plans = usePlan(s, who, v);
  const f = s.agent.f;
  const days = festivalDays(f);
  const today = (Number(Object.entries(f.dates).find(([, d]) => s.clock.startsWith(d))?.[0]) || days[0]) as DayNumber;
  const [day, setDay] = useState<DayNumber>(plans.some(p => p.e.day === today) ? today : (days.find(d => plans.some(p => p.e.day === d)) ?? days[0]));
  const inbox = s.agent.outbox.filter(d => d.personId === who.id);
  const [seen, setSeen] = useState(0);
  const unread = Math.max(0, inbox.length - seen);
  const go = (t: Tab) => { setTab(t); if (t === 'updates') setSeen(inbox.length); window.scrollTo({ top: 0 }); };
  // Live: an update approved on the organizer's screen arrives here as a push, and the newest one waits on the Plan.
  const [arrived, clearArrived] = useArrivals(inbox);
  const [pushes, setPushes] = useState<typeof inbox>([]);
  useEffect(() => { if (arrived.length) { setPushes(arrived); clearArrived(); setLatestOpen(true); } }, [arrived.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [latestOpen, setLatestOpen] = useState(true);
  const latest = inbox[inbox.length - 1];
  const [theme, setTheme] = useTheme();
  // Open problems the team is still working on: a card each on the Plan, and a push when one appears.
  const risks = useOpenRisks(s, plans);
  const [hidden, setHidden] = useState<string[]>([]);
  const [riskPush, setRiskPush] = useState<{ subject: string; body: string; actionId: string }[]>([]);
  const knownRisks = useRef<Set<string> | null>(null);
  const openedAt = useRef(Date.now());
  useEffect(() => {
    const ids = new Set(risks.map(r => r.id));
    // What is already open as the app loads (alerts arrive a moment after) is shown, not pushed.
    if (knownRisks.current === null || Date.now() - openedAt.current < 4000) { knownRisks.current = ids; return; }
    const fresh = risks.filter(r => !knownRisks.current!.has(r.id));
    knownRisks.current = ids;
    if (fresh.length) {
      setHidden(h => h.filter(id => !fresh.some(r => r.id === id)));
      // The banner headlines the last one: a person (who may not make it) reads stronger than weather.
      const order = [...fresh].sort((a, b) => Number(a.id.startsWith('guest')) - Number(b.id.startsWith('guest')));
      setRiskPush(order.map(r => ({ subject: r.line, body: 'The festival team is on it and will update you as soon as possible.', actionId: `risk-${r.id}` })));
      try { if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) navigator.vibrate?.(60); } catch { /* not supported */ }
    }
  }, [risks.map(r => r.id).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Change the plan here at once; on a shared festival the server keeps it (only your own plan).
  const change = (add: string | null, remove: string | null) => {
    if (remove) f.bookings = f.bookings.filter(b => !(b.personId === who.id && b.eventId === remove));
    if (add && !f.bookings.some(b => b.personId === who.id && b.eventId === add)) f.bookings.push({ personId: who.id, eventId: add });
    s.commit(); setV(x => x + 1);
    if (s.shared) s.call('booking', { add, drop: remove }).then(() => s.pull()).catch(() => undefined);
  };

  return (
    <div className={`at at-on-${tab}${theme === 'light' ? ' light' : ''}`}>
      <PushBanner msgs={pushes} onOpen={() => go('updates')} onDone={() => setPushes([])} />
      {!pushes.length && <PushBanner kind="risk" msgs={riskPush} onOpen={() => { go('plan'); const r = risks.find(x => riskPush.some(m => m.actionId === `risk-${x.id}`)); if (r) setDay(r.day); }} onDone={() => setRiskPush([])} />}
      {/* The whole app sits on a cinema photo, darkened so the cards read on top. */}
      <div className="at-photo" aria-hidden="true" style={{ backgroundImage: 'url(/hl/audience.jpg)' }} />
      {viewAs && <div className="viewas-bar"><Icon name="eye" size={16} /> Viewing as {who.name}. <button className="small" onClick={onOut}>Back to organizer</button></div>}
      <header className="at-head">
        <div>
          <div className="at-fest">{s.festivalName}</div>
          <div className="at-sub">{who.name}</div>
        </div>
        <button className="at-theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'} title={theme === 'light' ? 'Dark mode' : 'Light mode'}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={16} /></button>
        <button className="at-me" onClick={() => { opened(); setMe(true); }} aria-label="Your pass" title="Your pass">{who.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('')}</button>
      </header>

      {(tab === 'plan' || tab === 'map') && (
        <div className="at-body at-days-wrap">
          {/* The same day buttons as the organizer's: weekday over date, a bar for how full your day is. */}
          <DayStrip s={s} day={day} onDay={setDay} events={plans.map(p => p.e)} />
        </div>
      )}

      <main className="at-body">
        {tab === 'plan' && risks.filter(r => !hidden.includes(r.id)).map(r => (
          <div key={r.id} className="at-latest one risk">
            <span className="at-latest-ic k-risk"><Icon name={UPDATE_ICON.risk} size={14} /></span>
            {/* Not solved yet: say so, and that the team is on it. Tap to see that day. */}
            <button className="at-latest-line" onClick={() => setDay(r.day)}>
              <b>{r.line}</b>
              <small>The festival team is on it · update coming asap</small>
            </button>
            <button className="at-latest-x" aria-label="Dismiss" onClick={() => setHidden(h => [...h, r.id])}><Icon name="x" size={14} /></button>
          </div>
        ))}
        {tab === 'plan' && latest && latestOpen && (
          <div className="at-latest one">
            <span className={`at-latest-ic k-${updateKind(latest)}`}><Icon name={UPDATE_ICON[updateKind(latest)]} size={14} /></span>
            {/* One line here; the full message waits in Updates. */}
            <button className="at-latest-line" onClick={() => go('updates')}>
              <b>{latest.subject}</b>
              <small>{fmt(latest.at)} · Details in Updates ›</small>
            </button>
            <button className="at-latest-x" aria-label="Dismiss" onClick={() => setLatestOpen(false)}><Icon name="x" size={14} /></button>
          </div>
        )}
        {tab === 'plan' && <PlanView s={s} who={who} plans={plans} day={day} change={change} />}
        {tab === 'map' && <MapView s={s} plans={plans} day={day} />}
        {tab === 'updates' && <Updates s={s} who={who} />}
        {tab === 'ask' && <div className="at-ask"><h1 className="at-h1">Ask</h1><Ask s={s} user={who.name} go={() => undefined} /></div>}
      </main>

      <nav className="at-nav" aria-label="Sections">
        {([['plan', 'Plan'], ['map', 'Map'], ['updates', 'Updates'], ['ask', 'Ask']] as const).map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>
            {id === 'map' ? <MapIcon /> : <Icon name={id === 'plan' ? 'calendar' : id === 'updates' ? 'inbox' : 'chat'} size={18} />}
            <span>{label}</span>
            {id === 'updates' && unread > 0 && <i className="at-badge">{unread}</i>}
          </button>
        ))}
      </nav>

      {me && (
        <div className="at-sheet-wrap" onClick={settled(() => setMe(false))}>
          <div className="at-sheet" onClick={e => e.stopPropagation()}>
            <i className="at-grab" />
            <Pass s={s} who={who} />
            <MyArrival s={s} who={who} />
            {!viewAs && <button className="at-signout" onClick={onOut}><Icon name="logout" size={16} /> Sign out</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- plan
/** Weather the agent has raised for this day (demo alerts on this device). */
function useRisk(s: AgentStore, day: DayNumber): { risk: WeatherRisk; label: string } | null {
  const [alerts] = useAlerts();
  const al = alerts.find(a => a.day === day && a.kind !== 'guest');
  if (!al) return null;
  const risk = assessWeather(scenarioHours(s.agent.f.dates[day], al.kind as 'storm' | 'snow' | 'heat'))[0];
  if (!risk) return null;
  return { risk, label: al.kind === 'storm' ? 'Thunderstorms' : al.kind === 'snow' ? 'Snow' : 'Heat' };
}

function PlanView({ s, who, plans, day, change }: { s: AgentStore; who: Who; plans: Plan[]; day: DayNumber; change: (add: string | null, remove: string | null) => void }) {
  const f = s.agent.f;
  const original = useMemo(() => readOriginal(), [s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeNotes = useMemo(() => Object.fromEntries(Object.entries(readNotes()).filter(([, n]) => n !== 'Changed' && !/held seats/.test(n))), [s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<FestivalEvent | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [kept, setKept] = useState<Record<string, boolean>>({});
  const mine = plans.filter(p => p.e.day === day);
  const inPlan = new Set(plans.map(p => p.e.id));
  const weather = useRisk(s, day);
  const was = (e: FestivalEvent) => { const o = original.find(x => x.id === e.id); return o && o.start !== e.start ? o.start : null; };
  const isOpen = (e: FestivalEvent) => e.status === 'scheduled' && !inPlan.has(e.id) && (e.kind === 'screening' || e.kind === 'panel') && !e.restriction;
  const swaps = (c: FestivalEvent) => f.events.filter(e => e.day === c.day && isOpen(e) && Math.abs(tod(e.start) - tod(c.start)) <= 60).slice(0, 2);
  const pickFor = (from: string, to: string) => f.events
    .filter(e => e.day === day && isOpen(e) && tod(e.start) >= tod(from) + 15 && tod(e.end) <= tod(to) - 20)
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  // The decision: a trip that falls in the weather window, with a way to stay put instead.
  const decision = (() => {
    if (!weather) return null;
    for (let i = 0; i < mine.length; i++) {
      const p = mine[i]; const prev = mine[i - 1];
      if (!prev || p.e.status !== 'scheduled' || kept[p.e.id]) continue;
      const trip = walk(f, prev.e.venueId, p.e.venueId);
      // Same rule as the travel row: arrive 5 minutes early, plus what the weather adds.
      const leave = tod(p.e.start) - trip - weather.risk.extraTravelMin - 5;
      if (!trip || leave < tod(weather.risk.from) - 45 || leave > tod(weather.risk.to)) continue;
      const stay = f.events.find(e => e.day === day && e.venueId === prev.e.venueId && isOpen(e) && Math.abs(tod(e.start) - tod(p.e.start)) <= 75 && tod(e.start) >= tod(prev.e.end) - 5);
      if (!stay) continue;
      return { p, prev, trip, extra: weather.risk.extraTravelMin, leave, stay };
    }
    return null;
  })();

  // The plan as a phone calendar's schedule list: hour headings, one row per event
  // (time, venue colour, picture, title, venue, guests), and what to do between them.
  const rows: ReactElement[] = [];
  const hourLabel = (iso: string) => { const h = Number(iso.slice(11, 13)); return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`; };
  let lastHour = '';
  mine.forEach((p, i) => {
    const prev = mine[i - 1];
    const hour = hourLabel(p.e.start);
    if (hour !== lastHour) lastHour = hour;
    if (prev) {
      const trip = walk(f, prev.e.venueId, p.e.venueId);
      const gap = tod(p.e.start) - tod(prev.e.end);
      const inWeather = weather && tod(p.e.start) - trip >= tod(weather.risk.from) - 30 && tod(p.e.start) - trip <= tod(weather.risk.to);
      const pick = gap >= 100 ? pickFor(prev.e.end, p.e.start) : null;
      if (pick) rows.push(
        <div className="apl-pick" key={`free-${p.e.id}`}>
          <small>Free {fmt(prev.e.end)} to {fmt(p.e.start)} · a pick that fits</small>
          <div className="apl-pick-row">
            <EventThumb e={pick} size={36} />
            <span><b>{pick.title}</b><em>{fmt(pick.start)} · {venueName(f, pick.venueId)}</em></span>
            <button className="small" onClick={() => change(pick.id, null)}>Add</button>
          </div>
        </div>,
      );
      if (gap >= 0 && trip) rows.push(
        <div className={`apl-trip${inWeather ? ' wx' : ''}`} key={`trip-${p.e.id}`}>
          {trip} min to {venueName(f, p.e.venueId)} · leave by {fmt(hm(f.dates[day], tod(p.e.start) - trip - (inWeather ? weather!.risk.extraTravelMin : 0) - 5))}
          {inWeather ? <em> · {weather!.label.toLowerCase()} adds {weather!.risk.extraTravelMin} min, take the shuttle</em> : null}
        </div>,
      );
    }
    const w = was(p.e);
    const off = p.e.status === 'cancelled';
    const clash = prev && p.e.status === 'scheduled' && prev.e.status === 'scheduled' && tod(p.e.start) < tod(prev.e.end) ? prev : null;
    const risky = decision?.p.e.id === p.e.id;
    const changed = changeNotes[p.e.id];
    const note = off ? 'Cancelled' : clash ? `Overlaps ${clash.e.title}` : changed ? changed : w ? (p.why === 'Ticket' ? `Now ${fmt(p.e.start)} · seat held` : `Now ${fmt(p.e.start)}`) : '';
    rows.push(
      <button key={p.e.id} className={`msch-ev${w || changed ? ' moved' : ''}${off ? ' off' : ''}${risky ? ' risk' : ''}${clash ? ' clash' : ''}`}
        style={{ ['--vc' as string]: venueTone(f, p.e.venueId) }} onClick={() => { opened(); setOpen(p.e); }}>
        <span className="msch-time">{w && <s>{fmt(w)}</s>}<b>{fmt(p.e.start)}</b><small>{fmt(p.e.end)}</small></span>
        <EventThumb e={p.e} size={40} />
        <span className="msch-txt">
          <b>{p.e.title}</b>
          <span>{venueName(f, p.e.venueId)}{p.e.room ? `, ${p.e.room}` : ''} · {p.why}</span>
          {note && <em>{note}</em>}
        </span>
        {p.e.guestIds.length > 0 && <Faces s={s} ids={p.e.guestIds} size={20} max={3} />}
      </button>,
    );
    if (clash) rows.push(
      <div className="apl-act" key={`keep-${p.e.id}`}>
        <span>Keep one</span>
        {clash.why === 'Saved' && <button className="small" onClick={() => change(null, clash.e.id)}>{p.e.title}</button>}
        {p.why === 'Saved' && <button className="small" onClick={() => change(null, p.e.id)}>{clash.e.title}</button>}
      </div>,
    );
    if (off) rows.push(
      <div className="apl-act swap" key={`swap-${p.e.id}`}>
        <span>Swap for</span>
        {swaps(p.e).map(e => <button key={e.id} className="small" onClick={() => change(e.id, p.e.id)}>{e.title} · {fmt(e.start)}</button>)}
      </div>,
    );
  });

  return (
    <>
      {decision && (
        <button className="at-decide" onClick={() => { opened(); setDeciding(true); }}>
          <span className="at-decide-ic"><Icon name="alert" size={16} /></span>
          <span><b>Your {fmt(decision.p.e.start)} {decision.p.e.kind === 'panel' ? 'panel' : 'screening'} is at risk</b><em>{weather!.label} from {fmt(weather!.risk.from)} · decide by {fmt(hm(f.dates[day], decision.leave - 15))}</em></span>
          <i>Decide</i>
        </button>
      )}
      {mine.length === 0 ? <div className="at-empty">Nothing on your plan this day.</div> : <div className="msch apl">{rows}</div>}

      {open && (
        <div className="at-sheet-wrap" onClick={settled(() => setOpen(null))}>
          <div className="at-sheet" onClick={e => e.stopPropagation()}>
            <i className="at-grab" />
            <div className="at-ev-hero" style={{ backgroundImage: `url(${eventImage(open)})` }} />
            <h2 className="at-h2">{open.title}</h2>
            <p className="at-lede">{fmt(open.start)} to {fmt(open.end)} · {venueName(f, open.venueId)}{open.room ? `, ${open.room}` : ''}</p>
            {open.guestIds.length > 0 && <div className="at-ev-guests"><Faces s={s} ids={open.guestIds} size={26} max={6} /><span>{open.guestIds.map(id => f.people.find(p => p.id === id)?.name).filter(Boolean).join(', ')}</span></div>}
            {(() => { const film = f.films.find(x => x.id === open.filmId); return film ? <p className="at-ev-about">{film.section} · directed by {film.director} · {film.runtimeMin} min</p> : null; })()}
            {plans.find(p => p.e.id === open.id)?.why === 'Saved' && <button className="at-signout" onClick={() => { change(null, open.id); setOpen(null); }}>Remove from my plan</button>}
          </div>
        </div>
      )}

      {deciding && decision && (
        <div className="at-sheet-wrap" onClick={settled(() => setDeciding(false))}>
          <div className="at-sheet" onClick={e => e.stopPropagation()}>
            <i className="at-grab" />
            <h2 className="at-h2">Keep your {fmt(decision.p.e.start)} {decision.p.e.kind === 'panel' ? 'panel' : 'screening'}?</h2>
            <p className="at-lede">{weather!.label} from {fmt(weather!.risk.from)} to {fmt(weather!.risk.to)}</p>
            <button className="at-opt" onClick={() => { setKept({ ...kept, [decision.p.e.id]: true }); setDeciding(false); }}>
              <b>Keep {decision.p.e.title}</b>
              <span>Leave {venueName(f, decision.prev.e.venueId)} by {fmt(hm(f.dates[day], decision.leave))} · {decision.trip} min, take the shuttle</span>
              <em>{weather!.label} can add {decision.extra} min</em>
            </button>
            <button className="at-opt" onClick={() => { change(decision.stay.id, decision.p.why === 'Saved' ? decision.p.e.id : null); setDeciding(false); }}>
              <b>Stay at {venueName(f, decision.prev.e.venueId)}</b>
              <span>{decision.stay.title} at {fmt(decision.stay.start)} instead · no travel</span>
            </button>
            <p className="at-lede" style={{ textAlign: 'center' }}>No answer keeps {decision.p.e.title}.</p>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- map
function MapView({ s, plans, day }: { s: AgentStore; plans: Plan[]; day: DayNumber }) {
  const f = s.agent.f;
  // The venues on the city's own streets; the frame fits them, with room for names.
  const placed = usePlaced(f.venues);
  const fr = frameFor(placed.filter(p => p.v.lat != null).map(p => [p.x, p.y]), 300, 260 / 360, 360);
  const spot = (id: string): [number, number] => { const p = placed.find(x => x.v.id === id); return p ? [p.x, p.y] : [fr.x0 + 40, fr.y1 - 40]; };
  const mine = plans.filter(p => p.e.day === day && p.e.status === 'scheduled');
  const stops = mine.map(p => p.e.venueId).filter((v, i, a) => i === 0 || a[i - 1] !== v);
  const [pick, setPick] = useState<string | null>(stops[0] ?? null);
  const onDay = s.clock.slice(0, 10) === f.dates[day];
  const now = tod(s.clock);
  const sel = f.venues.find(v => v.id === pick);
  const here = sel ? mine.filter(p => p.e.venueId === sel.id) : [];
  const nowOn = sel && onDay ? f.events.find(e => e.venueId === sel.id && e.status === 'scheduled' && tod(e.start) - 30 <= now && now < tod(e.end)) : null;
  const firstStop = sel ? stops.indexOf(sel.id) : -1;
  const from = firstStop > 0 ? stops[firstStop - 1] : null;
  const u = fr.u;
  return (
    <>
      <div className="at-map">
        <svg viewBox={fr.vb} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map of the festival venues and your route">
          <CityBase {...fr} />
          {stops.length > 1 && <polyline className="at-route" points={stops.map(v => spot(v).join(',')).join(' ')} />}
          {f.venues.map(v => {
            const [x, y] = spot(v.id);
            const n = stops.indexOf(v.id);
            const left = x > (fr.x0 + fr.x1) / 2 + (fr.x1 - fr.x0) * 0.2;
            return (
              <g key={v.id} className={`at-pin${pick === v.id ? ' on' : ''}${n >= 0 ? ' mine' : ''}`} onClick={() => setPick(v.id)} transform={`translate(${x} ${y}) scale(${u})`}>
                <circle r={n >= 0 ? 11 : 6} />
                {n >= 0 && <text className="at-pin-n" y="4" textAnchor="middle">{n + 1}</text>}
                {(n >= 0 || pick === v.id) && <text className="at-pin-l" x={left ? -15 : 15} y="4" textAnchor={left ? 'end' : 'start'}>{v.name}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      {sel && (
        <div className="at-venue">
          <b>{sel.name}</b>
          <span className="at-lede">{sel.address}{from ? ` · ${walk(f, from, sel.id)} min from ${venueName(f, from)}` : ''}</span>
          {nowOn && <p className="at-venue-now">Now: {nowOn.title}</p>}
          {here.length > 0 && <div className="at-venue-list">{here.map(p => <div key={p.e.id}><EventThumb e={p.e} size={36} /><span><b>{p.e.title}</b><em>{fmt(p.e.start)} to {fmt(p.e.end)}</em></span></div>)}</div>}
          {here.length === 0 && !nowOn && <p className="at-lede">Nothing on your plan here this day.</p>}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- updates
function Updates({ s, who }: { s: AgentStore; who: Who }) {
  const inbox = [...s.agent.outbox.filter(d => d.personId === who.id)].reverse();
  return (
    <div className="at-updates">
      <h1 className="at-h1">Updates</h1>
      <p className="at-lede">Only about your plan.</p>
      {inbox.length === 0 && <div className="at-empty"><Mascot pose="headsup" className="at-doodle" />Nothing yet. If a change affects your plan, it shows up here.</div>}
      {inbox.map((m, i) => (
        <div className="at-msg" key={i}>
          <span className={`at-alert-ic k-${updateKind(m)}`} title={UPDATE_LABEL[updateKind(m)]}><Icon name={UPDATE_ICON[updateKind(m)]} size={16} /></span>
          <div><b>{m.subject}</b><small>{fmt(m.at)}</small><p>{m.body}</p>
</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- pass
function Pass({ s, who }: { s: AgentStore; who: Who }) {
  const f = s.agent.f;
  const pass = f.passes.find(p => p.personId === who.id);
  const code = qrFor(who.id);
  const svg = useMemo(() => { const q = qrcode(0, 'M'); q.addData(code); q.make(); return q.createSvgTag({ cellSize: 6, margin: 1, scalable: true }); }, [code]);
  const all = pass && pass.validDays.length >= Object.keys(f.dates).length;
  return (
    <div className="at-ticket">
      <div className="at-ticket-top">
        <div className="at-fest">{f.name}</div>
        <div className="at-ticket-kind">{pass ? PASS_LABELS[pass.type] : 'Ticket holder'}</div>
        <div className="at-ticket-name">{who.name}</div>
      </div>
      <div className="at-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="at-ticket-foot">
        <span>{pass ? (all ? 'All days' : `Day ${pass.validDays.join(', ')}`) : ''}</span>
        <code>{code}</code>
      </div>
      <p className="at-lede" style={{ textAlign: 'center', marginTop: 10 }}>Show this at any door. One code covers your pass and every ticket.</p>
    </div>
  );
}
