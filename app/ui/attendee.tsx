'use client';
// The attendee app, phone only, after the first prototype:
//   Plan     the day as a timeline on a rail: each event, how to get to the
//            next one, a pick for free time, and what changed. When weather
//            puts a trip at risk, a decision card asks: keep it, or stay.
//   Map      the venues, your route for the day, walking times, what's on.
//   Updates  only about your plan.
//   Ask      questions about the festival.
// Your pass sits under your initials, top right.

import { useMemo, useState, type ReactElement } from 'react';
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

type Why = 'Ticket' | 'Saved';
type Plan = { e: FestivalEvent; why: Why };
type Tab = 'plan' | 'map' | 'updates' | 'ask';

const tod = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const hm = (date: string, mins: number) => `${date}T${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const readOriginal = (): FestivalEvent[] => { try { const v = localStorage.getItem('usher-original-plan-v1'); return v ? JSON.parse(v) : []; } catch { return []; } };
const venueName = (f: Festival, id: string) => f.venues.find(v => v.id === id)?.name ?? id;
const walk = (f: Festival, a: string, b: string) => (a === b ? 0 : f.travel?.[a]?.[b] ?? 20);

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

  // Change the plan here at once; on a shared festival the server keeps it (only your own plan).
  const change = (add: string | null, remove: string | null) => {
    if (remove) f.bookings = f.bookings.filter(b => !(b.personId === who.id && b.eventId === remove));
    if (add && !f.bookings.some(b => b.personId === who.id && b.eventId === add)) f.bookings.push({ personId: who.id, eventId: add });
    s.commit(); setV(x => x + 1);
    if (s.shared) s.call('booking', { add, drop: remove }).then(() => s.pull()).catch(() => undefined);
  };

  return (
    <div className={`at at-on-${tab}`}>
      {/* The whole app sits on a cinema photo, darkened so the cards read on top. */}
      <div className="at-photo" aria-hidden="true" style={{ backgroundImage: 'url(/hl/audience.jpg)' }} />
      {viewAs && <div className="viewas-bar"><Icon name="eye" size={16} /> Viewing as {who.name}. <button className="small" onClick={onOut}>Back to organizer</button></div>}
      <header className="at-head">
        <div>
          <div className="at-fest">{s.festivalName}</div>
          <div className="at-sub">{who.name}</div>
        </div>
        <button className="at-me" onClick={() => setMe(true)} aria-label="Your pass" title="Your pass">{who.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('')}</button>
      </header>

      {(tab === 'plan' || tab === 'map') && (
        <div className="at-body at-days-wrap">
          <div className="at-days" role="tablist" aria-label="Day">
            {days.map(d => {
              const date = new Date(`${f.dates[d]}T12:00:00`);
              return (
                <button key={d} role="tab" aria-selected={d === day} className={d === day ? 'on' : ''} onClick={() => setDay(d)}>
                  <b>{date.getDate()}</b><span>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <main className="at-body">
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
        <div className="at-sheet-wrap" onClick={() => setMe(false)}>
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

  const rows: ReactElement[] = [];
  mine.forEach((p, i) => {
    const prev = mine[i - 1];
    if (prev) {
      const trip = walk(f, prev.e.venueId, p.e.venueId);
      const gap = tod(p.e.start) - tod(prev.e.end);
      const inWeather = weather && tod(p.e.start) - trip >= tod(weather.risk.from) - 30 && tod(p.e.start) - trip <= tod(weather.risk.to);
      const pick = gap >= 100 ? pickFor(prev.e.end, p.e.start) : null;
      if (pick) rows.push(
        <div className="at-row at-free" key={`free-${p.e.id}`}>
          <div className="at-time"><span>{fmt(prev.e.end)}</span></div>
          <div className="at-pick">
            <small>Free until {fmt(p.e.start)} · a pick that fits</small>
            <div className="at-pick-row">
              <EventThumb e={pick} size={40} />
              <span><b>{pick.title}</b><em>{fmt(pick.start)} · {venueName(f, pick.venueId)}</em></span>
              <button className="small" onClick={() => change(pick.id, null)}>Add</button>
            </div>
          </div>
        </div>,
      );
      if (gap >= 0) rows.push(
        <div className={`at-trip${inWeather ? ' wx' : ''}`} key={`trip-${p.e.id}`}>
          <span className="at-trip-ic">{trip ? '→' : '•'}</span>
          {trip
            ? <span>{trip} min to {venueName(f, p.e.venueId)} · leave by {fmt(hm(f.dates[day], tod(p.e.start) - trip - (inWeather ? weather!.risk.extraTravelMin : 0) - 5))}{inWeather ? <em> · {weather!.label.toLowerCase()} adds {weather!.risk.extraTravelMin} min, take the shuttle</em> : null}</span>
            : <span>Same venue, stay in your seat</span>}
        </div>,
      );
    }
    const w = was(p.e);
    const off = p.e.status === 'cancelled';
    const clash = prev && p.e.status === 'scheduled' && prev.e.status === 'scheduled' && tod(p.e.start) < tod(prev.e.end) ? prev : null;
    const risky = decision?.p.e.id === p.e.id;
    rows.push(
      <div className={`at-row${w ? ' moved' : ''}${off ? ' off' : ''}${risky ? ' risk' : ''}`} key={p.e.id}>
        <div className="at-time">{w && <s>{fmt(w)}</s>}<span>{fmt(p.e.start)}</span><small>{fmt(p.e.end)}</small></div>
        <div className="at-card">
          <button className="at-card-main" onClick={() => setOpen(p.e)}>
            <EventThumb e={p.e} size={56} />
            <div className="at-card-txt">
              <b>{p.e.title}</b>
              <em>{venueName(f, p.e.venueId)}{p.e.room ? `, ${p.e.room}` : ''}</em>
              <Faces s={s} ids={p.e.guestIds} size={20} />
            </div>
            <span className="at-why">{p.why}</span>
          </button>
          {w && <p className="at-note"><Icon name="clock" size={14} /> Now starts at {fmt(p.e.start)}.{p.why === 'Ticket' ? ' Your seat is held.' : ''}</p>}
          {clash && (
            <div className="at-note warn">
              <span>Overlaps with {clash.e.title}. Keep one:</span>
              <div className="at-keep">
                {clash.why === 'Saved' && <button className="small" onClick={() => change(null, clash.e.id)}>Keep this one</button>}
                {p.why === 'Saved' && <button className="small ghost" onClick={() => change(null, p.e.id)}>Keep {clash.e.title}</button>}
              </div>
            </div>
          )}
          {off && (
            <div className="at-note bad">
              <span><Icon name="x" size={14} /> Cancelled. Pick another that fits your day:</span>
              {swaps(p.e).map(e => (
                <button key={e.id} className="at-swap" onClick={() => change(e.id, p.e.id)}>
                  <EventThumb e={e} size={32} /><span><b>{e.title}</b><em>{fmt(e.start)} · {venueName(f, e.venueId)}</em></span><i>Swap</i>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>,
    );
  });

  return (
    <>
      {decision && (
        <button className="at-decide" onClick={() => setDeciding(true)}>
          <span className="at-decide-ic"><Icon name="alert" size={16} /></span>
          <span><b>Your {fmt(decision.p.e.start)} {decision.p.e.kind === 'panel' ? 'panel' : 'screening'} is at risk</b><em>{weather!.label} from {fmt(weather!.risk.from)} · decide by {fmt(hm(f.dates[day], decision.leave - 15))}</em></span>
          <i>Decide</i>
        </button>
      )}
      <div className="at-dayhead">
        <b>{new Date(`${f.dates[day]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</b>
        <span>{mine.length ? `${mine.length} on your plan` : 'Nothing planned'}</span>
      </div>
      {mine.length === 0 ? <div className="at-empty">Nothing on your plan this day.</div> : <div className="at-list">{rows}</div>}

      {open && (
        <div className="at-sheet-wrap" onClick={() => setOpen(null)}>
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
        <div className="at-sheet-wrap" onClick={() => setDeciding(false)}>
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
/** Where the sample's venues sit on the harbour; any other venue is placed around them. */
const SPOTS: Record<string, [number, number]> = { 'v-harbor': [78, 132], 'v-pier9': [150, 84], 'v-canal': [212, 196], 'v-river': [288, 128] };

function MapView({ s, plans, day }: { s: AgentStore; plans: Plan[]; day: DayNumber }) {
  const f = s.agent.f;
  const spot = (id: string, i: number): [number, number] => SPOTS[id] ?? [70 + (i * 73) % 240, 70 + (i * 57) % 150];
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
  return (
    <>
      <div className="at-map">
        <svg viewBox="0 0 360 260" role="img" aria-label="Map of the festival venues and your route">
          <path className="at-water" d="M0 190 C 60 170, 110 215, 170 232 S 300 238, 360 214 V260 H0z" />
          {[[0, 60, 360, 40], [0, 160, 360, 150], [120, 0, 104, 260], [250, 0, 262, 260]].map(([x1, y1, x2, y2], i) => <line key={i} className="at-street" x1={x1} y1={y1} x2={x2} y2={y2} />)}
          {stops.length > 1 && <polyline className="at-route" points={stops.map((v, i) => spot(v, i).join(',')).join(' ')} />}
          {f.venues.map((v, i) => {
            const [x, y] = spot(v.id, i);
            const n = stops.indexOf(v.id);
            return (
              <g key={v.id} className={`at-pin${pick === v.id ? ' on' : ''}${n >= 0 ? ' mine' : ''}`} onClick={() => setPick(v.id)} transform={`translate(${x} ${y})`}>
                <circle r={n >= 0 ? 13 : 8} />
                {n >= 0 && <text className="at-pin-n" y="4.5" textAnchor="middle">{n + 1}</text>}
                <text className="at-pin-l" y={n >= 0 ? 28 : 22} textAnchor="middle">{v.name}</text>
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
      {inbox.length === 0 && <div className="at-empty">Nothing yet. If a change affects your plan, it shows up here.</div>}
      {inbox.map((m, i) => (
        <div className="at-msg" key={i}>
          <span className="at-alert-ic"><Icon name={/cancel/i.test(m.subject) ? 'x' : /weather|snow|storm|heat/i.test(m.subject) ? 'cloud' : 'calendar'} size={16} /></span>
          <div><b>{m.subject}</b><small>{fmt(m.at)}</small><p>{m.body}</p></div>
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
