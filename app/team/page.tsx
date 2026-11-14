'use client';
// Festival team: the operations tool. The calendar is the main view. When
// something happens the agent has already prepared a recommendation: one
// sentence on what happened, then a checklist of what it will do. Ticking a
// line previews it on the calendar; approving makes it the new plan.

import './ops.css';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Decision } from '../../src/backend/domain/types';
import { Brief, Calendar as CalIcon, Check, Clock, Close, Message } from '../hl/icons';
import {
  changesOf, checkLabel, currentPlan, dayLabel, dayOf, decide, demo, explain, fmt, groupAlerts, guestOf, imageFor, initials, previewPlan, readWho, snowWindow, toMin, useOps,
  type Alert, type DemoState, type Festival, type OpsView, type Session,
} from '../hl/lib';

type View = 'calendar' | 'decisions' | 'sent' | 'activity';
const START = 8 * 60, END = 22 * 60 + 30, PPM = 1.25;

export default function Team() {
  const router = useRouter();
  const { fest, state, error, refresh } = useOps(2500);
  const [me, setMe] = useState('p-001');
  const [view, setView] = useState<View>('calendar');
  const [day, setDay] = useState<number | null>(null);
  const [mode, setMode] = useState<'current' | 'original'>('current');
  const [openId, setOpenId] = useState<string | null>(null);
  const [single, setSingle] = useState<Alert | null>(null);
  const [keep, setKeep] = useState<string[]>([]);
  const [unchecked, setUnchecked] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: boolean } | null>(null);
  const [demoState, setDemoState] = useState<DemoState | null>(null);
  const [working, setWorking] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const [forcePhone, setForcePhone] = useState(false);
  const openRef = useRef<((a: Alert) => void) | null>(null);
  const linked = useRef(false);

  useEffect(() => {
    const w = readWho('team'); if (w) setMe(w.id);
    const v = new URLSearchParams(window.location.search).get('view');
    const dv = new URLSearchParams(window.location.search).get('device');
    if (dv === 'phone' || (!dv && (() => { try { return localStorage.getItem('hl:team-device') === 'phone'; } catch { return false; } })())) setForcePhone(true);
    if (v === 'decisions' || v === 'sent' || v === 'activity') setView(v);
    fetch('/api/ops/demo', { cache: 'no-store' }).then(r => r.json()).then((d: DemoState & { name: string | null }) => { if (d.name) setDemoState(d); }).catch(() => undefined);
  }, []);
  useEffect(() => { if (fest && state && day === null) setDay(dayOf(fest, state.clock)); }, [fest, state, day]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  const alerts = useMemo(() => fest && state ? groupAlerts(fest, state, keep) : [], [fest, state, keep]);
  useEffect(() => {
    if (linked.current || !alerts.length || day === null || !openRef.current) return;
    const want = new URLSearchParams(window.location.search).get('alert');
    const a = want && alerts.find(x => x.id === want || x.id.startsWith(want));
    if (a) { linked.current = true; openRef.current(a); }
  }, [alerts, day]);

  // A decision opened from the Decisions list follows the live state too.
  const active = useMemo(() => {
    if (single && state) {
      const ds = single.decisions.map(d => state.decisions.find(x => x.id === d.id) ?? d);
      return { ...single, decisions: ds };
    }
    return alerts.find(a => a.id === openId) ?? null;
  }, [single, state, alerts, openId]);
  const base = useMemo(() => !fest ? [] : mode === 'original' ? fest.sessions : currentPlan(fest, state), [fest, state, mode]);
  const changes = useMemo(() => !active || mode === 'original' ? [] : active.decisions.filter(d => d.status === 'open' && !unchecked[d.id])
    .flatMap(d => changesOf(d.options.find(o => o.key === d.agentRecommendation.key))), [active, unchecked, mode]);
  const shown = useMemo(() => previewPlan(base, changes), [base, changes]);
  const changed = useMemo(() => new Set(changes.map(c => c.sessionId)), [changes]);
  const atRisk = useMemo(() => {
    const ids = new Set<string>();
    for (const a of alerts) for (const d of a.decisions.filter(x => x.status === 'open')) {
      const sid = d.key.split(':')[2];
      if (d.scenario === 'guest' && sid?.startsWith('e-')) ids.add(sid);
      for (const o of d.options) for (const c of changesOf(o)) ids.add(c.sessionId);
    }
    return ids;
  }, [alerts]);

  if (error && !fest) return <Fallback text={error} />;
  if (!fest || !state || day === null) return <Fallback text="Loading the festival" />;
  const meP = fest.staff.find(s => s.id === me);

  const openAlert = (a: Alert) => {
    setSingle(null); setOpenId(a.id); setPicked(null); setMode('current'); setUnchecked({}); setView('calendar');
    setKeep(a.decisions.map(d => d.id));
    const first = a.decisions.flatMap(d => changesOf(d.options.find(o => o.key === d.agentRecommendation.key)))[0];
    const sid = first?.sessionId ?? a.decisions[0]?.key.split(':')[2];
    const s = sid && fest.sessions.find(x => x.id === sid);
    if (s) setDay(s.day);
  };
  openRef.current = openAlert;
  const openDecision = (d: Decision) => {
    const gid = guestOf(d);
    setOpenId(null); setUnchecked({}); setPicked(null);
    setSingle({ id: `dec:${d.id}`, kind: d.scenario === 'weather' ? 'weather' : 'guest', level: 'amber', title: d.title, sub: '', decisions: [d], guestId: gid });
  };
  const closePanel = () => { setOpenId(null); setSingle(null); setKeep([]); setUnchecked({}); };

  const approve = async () => {
    if (!active) return;
    const ds = active.decisions.filter(d => d.status === 'open' && !unchecked[d.id]);
    setBusy(true);
    let ok = 0; const problems: string[] = [];
    for (const d of ds) {
      try { await decide(d, d.agentRecommendation.key, me); ok++; }
      catch (e) { problems.push((e as Error & { code?: string }).code === 'conflict' ? 'Someone else changed this first. Showing the latest.' : (e as Error).message); }
    }
    await refresh();
    setBusy(false);
    if (problems.length) setToast({ text: problems[0] });
    else if (ok) setToast({ text: 'Approved. This is the new plan.', undo: true });
  };

  const runDemo = async (name: string, action: 'start' | 'next') => {
    setWorking(true); closePanel();
    try { const r = await demo(name, action); setDemoState(r); await refresh(); if (action === 'start') setDay(dayOf(fest, r.clock)); }
    catch (e) { setToast({ text: (e as Error).message }); }
    setWorking(false);
  };

  const focusOn = (id: string) => {
    const s = shown.find(x => x.id === id);
    if (s && s.day !== day) setDay(s.day);
    setFocus(id); setTimeout(() => setFocus(null), 2400);
    setTimeout(() => document.querySelectorAll(`[data-ev="${id}"]`).forEach(el => (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })), 60);
  };

  const days = Object.entries(fest.info.dates).map(([d, date]) => ({ d: Number(d), date, ...dayLabel(date) }));
  const today = days.find(x => x.d === day)!;
  const daySessions = shown.filter(s => s.day === day && s.status === 'scheduled');
  const clockDay = dayOf(fest, state.clock);
  const openCount = state.decisions.filter(d => d.status === 'open').length;
  const longDate = new Date(`${today.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const panelOpen = !!active;
  const openAlerts = alerts.filter(a => a.decisions.some(d => d.status === 'open') || a.kind === 'review').length;
  const summary = openAlerts ? `${openAlerts} ${openAlerts === 1 ? 'thing needs' : 'things need'} you. The agent has a plan for each.` : 'Nothing needs you. The agent is watching the weather, flights and shuttle.';

  const rec = active && (
    <RecPanel fest={fest} state={state} alert={active} unchecked={unchecked} setUnchecked={setUnchecked} onFocus={focusOn} onApprove={approve} busy={busy} onClose={closePanel} />
  );
  const daySeg = (
    <div className="o-seg" role="group" aria-label="Festival day">
      {days.map(x => <button key={x.d} type="button" aria-pressed={x.d === day} onClick={() => setDay(x.d)}>Day {x.d}<small>{x.wd} {x.n}</small></button>)}
    </div>
  );
  const planSeg = (
    <div className="o-seg" role="group" aria-label="Plan">
      <button type="button" aria-pressed={mode === 'current'} onClick={() => setMode('current')}>Current plan</button>
      <button type="button" aria-pressed={mode === 'original'} onClick={() => setMode('original')}>Original</button>
    </div>
  );
  const inbox = (
    <section className="o-inbox o-card" aria-label="Needs your decision" data-lve-skip>
      <header>{summary}</header>
      {alerts.length ? alerts.map(a => {
        const left = minutesLeft(a, state.clock);
        const open = a.decisions.filter(d => d.status === 'open').length;
        const pill = a.kind === 'review' ? <span className="o-pill">Message</span> : !open ? <span className="o-pill green">Done</span> : a.level === 'red' ? <span className="o-pill red"><span className="dot" />Urgent</span> : <span className="o-pill amber"><span className="dot" />Due soon</span>;
        return (
          <div key={a.id} className={`o-row ${open ? a.level : ''}`} aria-current={a.id === openId}>
            {pill}
            <span className="ic">{a.kind === 'review' ? <Message /> : a.kind === 'weather' ? <SnowIcon /> : <Clock />}</span>
            <span className="tx"><b>{a.title}</b></span>
            <span className="due">{left !== null && open ? <><b>{left}</b> min left</> : ''}</span>
            <button type="button" className={`btn small${open && a.kind !== 'review' ? ' primary' : ''}`} onClick={() => openAlert(a)}>{a.kind === 'review' ? 'Read' : open ? 'Review' : 'View'}</button>
          </div>
        );
      }) : <div className="o-empty-inbox"><Check /> Nothing needs you right now. The agent is watching the weather, flights and shuttle.</div>}
    </section>
  );

  return (
    <div className={`ops${forcePhone ? ' force-phone' : ''}`}>
      {/* ------------------------------------------------ desktop */}
      <div className="o-shell">
        <aside className="o-side" aria-label="Navigation">
          <div className="o-brand"><span className="wordmark">Harbor Lights</span><small>Festival operations</small></div>
          <nav className="o-nav">
            <button type="button" aria-current={view === 'calendar' ? 'page' : undefined} onClick={() => setView('calendar')}><CalIcon />Calendar</button>
            <button type="button" aria-current={view === 'decisions' ? 'page' : undefined} onClick={() => setView('decisions')}><Check />Decisions{openCount > 0 && <span className="count">{openCount}</span>}</button>
            <button type="button" aria-current={view === 'sent' ? 'page' : undefined} onClick={() => setView('sent')}><Message />Sent messages</button>
            <button type="button" aria-current={view === 'activity' ? 'page' : undefined} onClick={() => setView('activity')}><Brief />Activity</button>
          </nav>
          <div className="o-side-label">Demo</div>
          <DemoBox state={demoState} working={working} onRun={runDemo} />
          <button type="button" className="o-user" onClick={() => router.push('/start/team')}>
            <span className="o-avatar">{meP ? initials(meP.name) : '?'}</span>
            <span><b>{meP?.name}</b><small>{meP?.title}</small></span>
          </button>
        </aside>

        <main className="o-main">
          <div className="o-toolbar">
            <div><h1>{view === 'calendar' ? `Day ${day}` : view === 'decisions' ? 'Decisions' : view === 'sent' ? 'Sent messages' : 'Activity'}</h1>{view === 'calendar' && <span className="sub">{longDate}</span>}</div>
            <span className="spacer" />
            {view === 'calendar' && <>{daySeg}{planSeg}</>}
            <span className="o-clock"><Clock />Festival time <b>{fmt(state.clock)}</b></span>
          </div>

          {view === 'calendar' ? (
            <>
              {inbox}
              <div className={`o-work${panelOpen || picked ? ' with-panel' : ''}`} data-lve-skip>
                <Calendar fest={fest} state={state} day={day} sessions={daySessions} changed={changed} atRisk={changes.length ? new Set() : atRisk}
                  previewing={!!changes.length} focus={focus} showNow={clockDay === day} onPick={id => { setPicked(id); closePanel(); }} picked={picked} mode={mode} />
                {panelOpen && <aside className="o-panel o-card" aria-label="Recommendation">{rec}</aside>}
                {!panelOpen && picked && <EventPanel fest={fest} s={shown.find(x => x.id === picked)!} onClose={() => setPicked(null)} />}
              </div>
            </>
          ) : (
            <div className={`o-work${panelOpen ? ' with-panel' : ''}`} data-lve-skip>
              <div className="o-card" style={{ overflow: 'auto', minHeight: 0 }}>
                {view === 'decisions' && <DecisionsTable fest={fest} state={state} onOpen={openDecision} />}
                {view === 'sent' && <SentTable state={state} />}
                {view === 'activity' && <ActivityTable state={state} />}
              </div>
              {panelOpen && <aside className="o-panel o-card" aria-label="Recommendation">{rec}</aside>}
            </div>
          )}
        </main>
      </div>

      {/* ------------------------------------------------ phone */}
      <div className={forcePhone ? 'o-device' : 'o-device-off'}><div className={forcePhone ? 'o-device-scroll' : 'o-device-off'}>
      <div className="o-m">
        <div className="o-m-head">
          <span className="wordmark">Harbor Lights</span>
          <span className="spacer" />
          <span className="o-clock"><b>{fmt(state.clock)}</b></span>
          <button type="button" className="o-avatar" style={{ border: 0 }} onClick={() => router.push('/start/team')}>{meP ? initials(meP.name) : '?'}</button>
        </div>
        <div className="o-m-body" data-lve-skip>
          {view === 'calendar' && (
            <>
              <p className="o-hello"><b>{summary.split('. ')[0]}.</b> {summary.split('. ').slice(1).join('. ')}</p>
              <div className="o-days" role="group" aria-label="Festival day">
                {days.map(x => <button key={x.d} type="button" aria-pressed={x.d === day} onClick={() => setDay(x.d)}><b>Day {x.d}</b><span>{x.wd} {x.n}</span></button>)}
              </div>

              <section className="o-sec" aria-label="Needs you">
                <header><span className="o-sec-ic red"><Clock /></span><b>Needs you</b>{alerts.length > 0 && <span className="o-pill red">{alerts.length}</span>}</header>
                {alerts.length ? alerts.map(a => {
                  const left = minutesLeft(a, state.clock);
                  const open = a.decisions.filter(d => d.status === 'open').length;
                  return (
                    <button key={a.id} type="button" className="o-sec-row" onClick={() => openAlert(a)}>
                      <span className={`bar ${a.kind === 'review' ? 'grey' : !open ? 'green' : a.level}`} />
                      <span className="tx"><b>{a.title}</b><small>{a.kind === 'review' ? 'Message' : !open ? 'Done' : 'The agent has a plan'}</small></span>
                      {left !== null && open > 0 && <span className={`o-pill ${a.level === 'red' ? 'red' : 'amber'}`}>{left} min</span>}
                      <Chevron />
                    </button>
                  );
                }) : <p className="o-sec-empty">Nothing needs you right now.</p>}
              </section>

              <section className="o-sec" aria-label="Schedule">
                <header><span className="o-sec-ic"><CalIcon /></span><b>Schedule</b><span className="spacer" />
                  <div className="o-seg small" role="group" aria-label="Plan">
                    <button type="button" aria-pressed={mode === 'current'} onClick={() => setMode('current')}>Current</button>
                    <button type="button" aria-pressed={mode === 'original'} onClick={() => setMode('original')}>Original</button>
                  </div>
                </header>
                {(() => {
                  const earlier = clockDay === day ? daySessions.filter(s => toMin(s.end) <= toMin(state.clock) && !changed.has(s.id)).length : 0;
                  return earlier > 0 && <button type="button" className="o-sec-more" onClick={() => setShowEarlier(!showEarlier)}>{showEarlier ? 'Hide earlier' : `Earlier today · ${earlier}`}</button>;
                })()}
                {daySessions.sort((a, b) => toMin(a.start) - toMin(b.start)).map(s => {
                  const past = clockDay === day && toMin(s.end) <= toMin(state.clock) && !changed.has(s.id);
                  if (past && !showEarlier) return null;
                  const risk = !changes.length && atRisk.has(s.id);
                  const moved = changed.has(s.id) || s.moved;
                  return (
                    <button key={s.id} type="button" data-ev={s.id} className={`o-sched${past ? ' past' : ''}${moved ? ' moved' : ''}${risk ? ' risk' : ''}`} onClick={() => setPicked(s.id)}>
                      <span className="tm">{s.was && <s>{fmt(s.was.start, true)}</s>}{fmt(s.start, true)}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="o-thumb" src={imageFor(s)} alt="" loading="lazy" />
                      <span className="tx"><b>{s.title}</b><small>{fest.venues.find(v => v.id === s.venueId)?.name}</small><Who fest={fest} s={s} onlyChanges /></span>
                      {risk ? <span className="o-pill red">At risk</span> : s.was ? <span className="o-pill amber">+{toMin(s.start) - toMin(s.was.start)}</span> : null}
                    </button>
                  );
                })}
              </section>
            </>
          )}
          {view === 'decisions' && <><div className="o-m-title"><h1>Decisions</h1></div><div className="o-card"><DecisionsList fest={fest} state={state} onOpen={openDecision} /></div></>}
          {view === 'sent' && <><div className="o-m-title"><h1>Sent messages</h1></div><div className="o-card"><SentList state={state} /></div></>}
          {view === 'activity' && <><div className="o-m-title"><h1>Activity</h1></div><div className="o-card"><ActivityList state={state} /></div></>}
          <DemoBox state={demoState} working={working} onRun={runDemo} />
        </div>
        <nav className="o-tabs" aria-label="Sections">
          <button type="button" aria-current={view === 'calendar' ? 'page' : undefined} onClick={() => setView('calendar')}><CalIcon />Calendar</button>
          <button type="button" aria-current={view === 'decisions' ? 'page' : undefined} onClick={() => setView('decisions')}><Check />Decisions{openCount > 0 && <span className="count">{openCount}</span>}</button>
          <button type="button" aria-current={view === 'sent' ? 'page' : undefined} onClick={() => setView('sent')}><Message />Sent</button>
          <button type="button" aria-current={view === 'activity' ? 'page' : undefined} onClick={() => setView('activity')}><Brief />Activity</button>
        </nav>
        {active && (
          <>
            <div className="sheet-backdrop" onClick={closePanel} />
            <div className="sheet" role="dialog" aria-label="Recommendation" data-lve-skip><div className="grab" />{rec}</div>
          </>
        )}
        {!active && picked && (
          <>
            <div className="sheet-backdrop" onClick={() => setPicked(null)} />
            <div className="sheet" role="dialog" aria-label="Event"><div className="grab" /><EventBody fest={fest} s={shown.find(x => x.id === picked)!} /></div>
          </>
        )}
      </div>
      </div></div>

      {toast && (
        <div className="toast" role="status">
          {toast.text}
          {toast.undo && <button type="button" onClick={() => { setMode('original'); setToast(null); setView('calendar'); }}>See the original</button>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- recommendation: one sentence, then a checklist

function RecPanel({ fest, state, alert, unchecked, setUnchecked, onFocus, onApprove, busy, onClose }: {
  fest: Festival; state: OpsView; alert: Alert; unchecked: Record<string, boolean>; setUnchecked: (u: Record<string, boolean>) => void;
  onFocus: (id: string) => void; onApprove: () => void; busy: boolean; onClose: () => void;
}) {
  const open = alert.decisions.filter(d => d.status === 'open');
  const ticked = open.filter(d => !unchecked[d.id]).length;
  return (
    <>
      <div className="o-rec-head">
        <p className="o-rec-sentence">{explain(fest, state, alert)}</p>
        <button type="button" className="o-x" onClick={onClose} aria-label="Close"><Close /></button>
      </div>
      <div className="o-panel-body">
        {alert.kind === 'review' && alert.review ? (
          <blockquote className="o-quote">{alert.review.text}</blockquote>
        ) : (
          <ul className="o-checklist">
            {alert.decisions.map(d => {
              const done = d.status !== 'open';
              const key = done ? (d.chosen?.key ?? d.agentRecommendation.key) : d.agentRecommendation.key;
              const on = done ? d.status === 'executed' && !!d.chosen?.key : !unchecked[d.id];
              const moves = changesOf(d.options.find(o => o.key === key));
              return (
                <li key={d.id}>
                  <label className={`o-check${done ? ' done' : ''}`}>
                    <input type="checkbox" checked={on} disabled={done} onChange={() => {
                      setUnchecked({ ...unchecked, [d.id]: !unchecked[d.id] });
                      if (moves[0]) onFocus(moves[0].sessionId);
                    }} />
                    <span className="box">{on && <Check />}</span>
                    <span className="lbl">{checkLabel(d, key)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {alert.kind !== 'review' && (
        <div className="o-panel-foot">
          {open.length ? (
            <button type="button" className="btn primary block" disabled={busy || !ticked} onClick={onApprove}>{busy ? 'Approving' : `Approve ${ticked}`}</button>
          ) : <button type="button" className="btn block" onClick={onClose}>Done</button>}
        </div>
      )}
    </>
  );
}

function minutesLeft(a: Alert, clock: string): number | null {
  const open = a.decisions.filter(d => d.status === 'open').map(d => d.deadline).sort()[0];
  return open ? Math.max(0, toMin(open) - toMin(clock)) : null;
}

// ---------------------------------------------------------------- calendar

function Calendar({ fest, state, day, sessions, changed, atRisk, previewing, focus, showNow, onPick, picked, mode }: {
  fest: Festival; state: OpsView; day: number; sessions: Session[]; changed: Set<string>; atRisk: Set<string>; previewing: boolean; focus: string | null;
  showNow: boolean; onPick: (id: string) => void; picked: string | null; mode: 'current' | 'original';
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nowTop = (toMin(state.clock) - START) * PPM;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = Math.max(0, (showNow ? nowTop : (12 * 60 - START) * PPM) - 160);
  }, [day]); // eslint-disable-line react-hooks/exhaustive-deps
  const venues = fest.venues;
  const hours = Array.from({ length: Math.floor((END - START) / 60) + 1 }, (_, i) => START + i * 60);
  const height = (END - START) * PPM;
  const snow = snowWindow(state.conditions);
  const snowOn = snow && dayOf(fest, snow.start) === day && mode === 'current';
  const nowMin = toMin(state.clock);
  let order = 0;
  return (
    <section className="o-cal o-card" style={{ ['--cols' as string]: venues.length }} aria-label="Festival calendar">
      <div className="o-cal-head"><div />{venues.map(v => <div key={v.id}>{v.name}</div>)}</div>
      <div className="o-cal-scroll" ref={scroller}>
        <div className="o-cal-grid" style={{ height }}>
          <div className="o-hours">{hours.map(h => <span key={h} style={{ top: (h - START) * PPM }}>{fmt(`2000-01-01T${String(Math.floor(h / 60)).padStart(2, '0')}:00`).replace(':00', '')}</span>)}</div>
          {hours.map(h => <div key={h} className="o-line" style={{ top: (h - START) * PPM }} />)}
          {snowOn && <div className="o-snow" style={{ top: (toMin(snow.start) - START) * PPM, height: (toMin(snow.end) - toMin(snow.start)) * PPM }}><span>Snow</span></div>}
          {venues.map(v => (
            <div className="o-col" key={v.id}>
              {sessions.filter(s => s.venueId === v.id && s.was).map(s => (
                <div key={`g-${s.id}`} className="o-ghost" style={{ top: (toMin(s.was!.start) - START) * PPM, height: Math.max(22, (toMin(s.was!.end) - toMin(s.was!.start)) * PPM - 4) }} />
              ))}
              {sessions.filter(s => s.venueId === v.id).map(s => {
                const top = (toMin(s.start) - START) * PPM;
                const h = Math.max(22, (toMin(s.end) - toMin(s.start)) * PPM - 4);
                const isChanged = changed.has(s.id);
                const delay = isChanged ? (order++) * 140 : 0;
                const shift = s.was ? toMin(s.start) - toMin(s.was.start) : 0;
                const past = showNow && toMin(s.end) <= nowMin && !isChanged;
                const tall = h >= 56;
                const cls = ['o-ev', `k-${s.kind}`, h < 40 ? 'short' : '', tall ? 'with-img' : '', isChanged || (s.moved && mode === 'current') ? 'changed' : '',
                  atRisk.has(s.id) ? 'risk' : '', previewing && !isChanged ? 'dimmed' : '', past ? 'past' : '', focus === s.id ? 'pulse' : ''].filter(Boolean).join(' ');
                return (
                  <button key={s.id} type="button" data-ev={s.id} className={cls}
                    style={{ top, height: h, transitionDelay: `${delay}ms`, outline: picked === s.id ? '2px solid var(--o-ink)' : undefined }} onClick={() => onPick(s.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {tall && <img className="o-thumb" src={imageFor(s)} alt="" loading="lazy" />}
                    <span className="t">{s.title}</span>
                    <span className="m"><span className="time">{fmt(s.start, true)} to {fmt(s.end)}</span>
                      {shift !== 0 && mode === 'current' && <span className="o-pill amber">{shift > 0 ? '+' : ''}{shift} min</span>}
                      {!shift && atRisk.has(s.id) && <span className="o-pill red">At risk</span>}
                    </span>
                    <Who fest={fest} s={s} onlyChanges />
                  </button>
                );
              })}
            </div>
          ))}
          {showNow && nowTop > 0 && nowTop < height && <div className="o-now" style={{ top: nowTop }} data-t={fmt(state.clock, true)} />}
        </div>
      </div>
      <div className="o-cal-foot">
        <span><i className="o-key k-screening" />Screening</span>
        <span><i className="o-key k-panel" />Panel</span>
        <span><i className="o-key k-qa" />Q&amp;A</span>
        <span><i className="o-key k-market" />Market, reception</span>
        <span><i className="o-key risk" />At risk</span>
        <span><i className="o-key changed" />Changed</span>
      </div>
    </section>
  );
}

/** Speakers only when the plan changed them: "Yara Hollis opens, Pavel Kettering joins later". */
function Who({ fest, s, onlyChanges = false }: { fest: Festival; s: Session; onlyChanges?: boolean }) {
  const name = (id: string) => fest.guests.find(g => g.id === id)?.name ?? id;
  const added = s.addedSpeakers ?? [];
  if (onlyChanges && !added.length) return null;
  const replaced = (s.notes ?? []).map(n => n.match(/in place of (.+)$/)?.[1]).find(Boolean);
  if (added.length) return <span className="who"><b>{added.map(name).join(', ')}</b> opens{replaced ? `, ${replaced} joins later` : ''}</span>;
  return s.guestIds.length ? <span className="who">{s.guestIds.map(name).join(', ')}</span> : null;
}

function EventBody({ fest, s }: { fest: Festival; s: Session }) {
  if (!s) return null;
  return (
    <div className="o-event">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageFor(s)} alt="" />
      <h2>{s.title}</h2>
      <p>{s.was && <s>{fmt(s.was.start)} </s>}{fmt(s.start)} to {fmt(s.end)}, {fest.venues.find(v => v.id === s.venueId)?.name}</p>
      <Who fest={fest} s={s} />
    </div>
  );
}

function EventPanel({ fest, s, onClose }: { fest: Festival; s: Session; onClose: () => void }) {
  return (
    <aside className="o-panel o-card" aria-label="Event">
      <div className="o-rec-head" style={{ justifyContent: 'flex-end', borderBottom: 0, paddingBottom: 0 }}><button type="button" className="o-x" onClick={onClose} aria-label="Close"><Close /></button></div>
      <div className="o-panel-body"><EventBody fest={fest} s={s} /></div>
    </aside>
  );
}

// ---------------------------------------------------------------- decisions, sent messages, activity

function statusPill(d: Decision) {
  if (d.status === 'open') return <span className="o-pill red"><span className="dot" />Open</span>;
  if (d.status === 'executed') return d.chosen?.via === 'deadline' ? <span className="o-pill amber">Ran by default</span> : <span className="o-pill green">Approved</span>;
  if (d.status === 'rejected') return <span className="o-pill">Declined</span>;
  return <span className="o-pill">Not needed</span>;
}
const decLabel = (d: Decision) => checkLabel(d, d.chosen?.key ?? d.agentRecommendation.key);

function DecisionsTable({ fest, state, onOpen }: { fest: Festival; state: OpsView; onOpen: (d: Decision) => void }) {
  if (!state.decisions.length) return <p className="o-empty">No decisions yet. Play a scenario to see one arrive.</p>;
  return (
    <table className="o-table">
      <thead><tr><th style={{ width: 130 }}>Status</th><th>Decision</th><th style={{ width: 170 }}>Team</th><th style={{ width: 90 }}>Time</th></tr></thead>
      <tbody>{state.decisions.map(d => (
        <tr key={d.id} className="click" onClick={() => onOpen(d)}><td>{statusPill(d)}</td><td><b>{decLabel(d)}</b></td><td>{fest.teams[d.owner] ?? d.owner}</td><td className="time">{fmt(d.createdAt, true)}</td></tr>
      ))}</tbody>
    </table>
  );
}
function DecisionsList({ fest, state, onOpen }: { fest: Festival; state: OpsView; onOpen: (d: Decision) => void }) {
  if (!state.decisions.length) return <p className="o-empty">No decisions yet.</p>;
  return <div className="o-list">{state.decisions.map(d => <button type="button" key={d.id} onClick={() => onOpen(d)}><span className="top">{statusPill(d)}<span>{fest.teams[d.owner]}</span></span><b>{decLabel(d)}</b></button>)}</div>;
}

const sentRows = (s: OpsView) => s.outbox.filter((o, i, xs) => xs.findIndex(x => x.key === o.key && x.to === o.to && x.text === o.text) === i);
function SentTable({ state }: { state: OpsView }) {
  const rows = sentRows(state);
  if (!rows.length) return <p className="o-empty">Nothing has been sent.</p>;
  return (
    <table className="o-table">
      <thead><tr><th style={{ width: 90 }}>Time</th><th style={{ width: 260 }}>To</th><th>Message</th></tr></thead>
      <tbody>{rows.map(o => <tr key={o.id}><td className="time">{fmt(o.at, true)}</td><td><b>{o.to}</b></td><td className="msg">{o.text}</td></tr>)}</tbody>
    </table>
  );
}
function SentList({ state }: { state: OpsView }) {
  const rows = sentRows(state);
  if (!rows.length) return <p className="o-empty">Nothing has been sent.</p>;
  return <div className="o-list">{rows.map(o => <div key={o.id}><span className="top"><b>{o.to}</b><span className="time">{fmt(o.at, true)}</span></span><p>{o.text}</p></div>)}</div>;
}

const KINDS = new Set(['trigger', 'decision', 'approval', 'act', 'timer', 'blocked', 'review']);
const activityRows = (s: OpsView) => [...((s as OpsView & { audit?: { seq: number; at: string; kind: string; summary: string }[] }).audit ?? [])].filter(a => KINDS.has(a.kind)).reverse();
function ActivityTable({ state }: { state: OpsView }) {
  const rows = activityRows(state);
  if (!rows.length) return <p className="o-empty">No activity yet.</p>;
  return (
    <table className="o-table">
      <thead><tr><th style={{ width: 90 }}>Time</th><th>What happened</th></tr></thead>
      <tbody>{rows.map(a => <tr key={a.seq}><td className="time">{fmt(a.at, true)}</td><td>{a.summary}</td></tr>)}</tbody>
    </table>
  );
}
function ActivityList({ state }: { state: OpsView }) {
  const rows = activityRows(state);
  if (!rows.length) return <p className="o-empty">No activity yet.</p>;
  return <div className="o-list">{rows.map(a => <div key={a.seq}><span className="top"><span className="time">{fmt(a.at, true)}</span></span><p>{a.summary}</p></div>)}</div>;
}

// ---------------------------------------------------------------- demo

function DemoBox({ state, working, onRun }: { state: DemoState | null; working: boolean; onRun: (name: string, a: 'start' | 'next') => void }) {
  const next = state?.upcoming[0];
  return (
    <div className="o-demo" data-lve-skip>
      {working ? <span className="working"><i /> The agent is working</span> : state ? (
        <>
          <b>{state.name === 'snow' ? 'Snow day' : 'Late guest'}</b>
          {next ? <span>Next: {next.note}</span> : <span>End of the scenario.</span>}
          <div className="row">
            {next && <button type="button" className="btn small primary" onClick={() => onRun(state.name, 'next')}>Play next</button>}
            <button type="button" className="btn small" onClick={() => onRun(state.name === 'snow' ? 'guest-late' : 'snow', 'start')}>{state.name === 'snow' ? 'Late guest' : 'Snow day'}</button>
          </div>
        </>
      ) : (
        <>
          <span>Play a scenario to see the agent at work.</span>
          <div className="row">
            <button type="button" className="btn small" onClick={() => onRun('snow', 'start')}>Snow day</button>
            <button type="button" className="btn small" onClick={() => onRun('guest-late', 'start')}>Late guest</button>
          </div>
        </>
      )}
    </div>
  );
}

function Chevron() {
  return <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}

function SnowIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /></svg>;
}

function Fallback({ text }: { text: string }) {
  return <div className="ops" style={{ display: 'grid', placeItems: 'center' }}><p className="muted">{text}</p></div>;
}
