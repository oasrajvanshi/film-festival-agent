'use client';
// Staff: your shift today, the live brief for your venue and team, messages
// sent to you, and what changed at your venue. Briefs update on their own
// when the plan changes (they are internal, so the agent may write them).

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Brief, Calendar, Clock, Door, Message, Swap, User } from '../hl/icons';
import { briefsForStaff, currentPlan, dayLabel, dayOf, fmt, imageFor, initials, messagesForStaff, readWho, sampleStaff, toMin, useOps, type Festival, type Session } from '../hl/lib';

type Tab = 'shift' | 'brief' | 'me';

export default function StaffApp() {
  const router = useRouter();
  const { fest, state, error } = useOps(3000);
  const [id, setId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('shift');
  const [seen, setSeen] = useState('');

  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (t === 'brief' || t === 'me') setTab(t); }, []);
  useEffect(() => { const w = readWho('staff'); if (w) setId(w.id); try { setSeen(localStorage.getItem('hl:seen:staff') ?? ''); } catch { /* none */ } }, []);
  useEffect(() => { if (fest && !id) setId(sampleStaff(fest)[0]?.id ?? null); }, [fest, id]);

  const me = fest?.staff.find(s => s.id === id) ?? null;
  const day = fest && state ? dayOf(fest, state.clock) : 1;
  const briefs = useMemo(() => state && me ? briefsForStaff(state, me, day) : [], [state, me, day]);
  const msgs = useMemo(() => state && me ? messagesForStaff(state, me).sort((a, b) => b.at.localeCompare(a.at)) : [], [state, me]);
  const plan = useMemo(() => fest && state ? currentPlan(fest, state) : [], [fest, state]);

  if (!fest || !state || !me) return <main className="phone" style={{ justifyContent: 'center', textAlign: 'center' }}><p className="muted">{error ?? 'Loading your shift'}</p></main>;

  const shifts = me.shifts.filter(s => s.day === day).sort((a, b) => a.start.localeCompare(b.start));
  const later = me.shifts.filter(s => s.day > day).sort((a, b) => a.start.localeCompare(b.start));
  const venues = new Set(shifts.map(s => s.venueId));
  const changedHere = plan.filter(s => s.day === day && venues.has(s.venueId) && (s.moved || s.addedSpeakers?.length)).sort((a, b) => toMin(a.start) - toMin(b.start));
  const nextHere = plan.filter(s => s.day === day && venues.has(s.venueId) && toMin(s.end) > toMin(state.clock) && s.status === 'scheduled').sort((a, b) => toMin(a.start) - toMin(b.start)).slice(0, 4);
  const fresh = [...briefs, ...msgs].filter(x => x.at > seen).length;
  const markSeen = () => { setSeen(state.clock); try { localStorage.setItem('hl:seen:staff', state.clock); } catch { /* none */ } };
  const where = (vid: string) => fest.venues.find(v => v.id === vid)?.name ?? vid;

  return (
    <>
      <div className="photo top" style={{ backgroundImage: 'url(/hl/doorway.jpg)' }} />
      <main className="phone">
        <div className="app-head">
          <span className="wordmark">Harbor Lights</span>
          <span className="spacer" />
          <span className="time small muted">{fmt(state.clock)}</span>
          <button type="button" className="me" onClick={() => setTab('me')} aria-label="Me">{initials(me.name)}</button>
        </div>

        {tab === 'shift' && (
          <div data-lve-skip>
            <div className="hero">
              <div className="display">Your shift</div>
              <p className="muted">{me.name} · {me.title}</p>
            </div>
            <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
              {shifts.map((sh, i) => (
                <div key={i} className="glass notice">
                  <header><span className="icon"><Door /></span><div><b>{where(sh.venueId)}</b><small className="time">{fmt(sh.start)} to {fmt(sh.end)}</small></div></header>
                  <p>{fest.teams[sh.task] ?? sh.task.replace(/_/g, " ")}</p>
                </div>
              ))}
              {!shifts.length && <p className="empty">No shift today.{later[0] ? ` Next: ${dayLabel(later[0].start.slice(0, 10)).wd} ${fmt(later[0].start)} at ${where(later[0].venueId)}.` : ''}</p>}
              {briefs[0] && (
                <button type="button" className="glass notice" style={{ textAlign: 'left', color: 'inherit', borderColor: briefs[0].at > seen ? 'var(--amber)' : undefined }} onClick={() => { setTab('brief'); markSeen(); }}>
                  <header><span className="icon"><Brief /></span><div><b>Latest brief {briefs[0].at > seen && <span className="dot" style={{ marginLeft: 6 }} />}</b><small className="time">{fmt(briefs[0].at)}</small></div></header>
                  <p>{briefs[0].text}</p>
                </button>
              )}
            </div>
            {changedHere.length > 0 && (
              <>
                <h2 className="title" style={{ fontSize: 20, margin: '24px 0 4px' }}>Changed at your venue</h2>
                <div className="timeline" style={{ marginTop: 8 }}>
                  {changedHere.map(s => <Item key={s.id} fest={fest} s={s} />)}
                </div>
              </>
            )}
            <h2 className="title" style={{ fontSize: 20, margin: '24px 0 4px' }}>Coming up here</h2>
            <div className="timeline" style={{ marginTop: 8 }}>
              {nextHere.map(s => <Item key={s.id} fest={fest} s={s} />)}
              {!nextHere.length && <p className="empty">Nothing else today.</p>}
            </div>
          </div>
        )}

        {tab === 'brief' && (
          <section style={{ marginTop: '18vh' }} data-lve-skip>
            <div className="display" style={{ fontSize: 'clamp(46px, 13vw, 64px)' }}>Live brief</div>
            <p className="muted" style={{ marginTop: 6 }}>For {[...venues].map(where).join(', ') || 'your team'}. Updated by the agent when the plan changes.</p>
            <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
              {[...briefs.map(b => ({ kind: 'brief' as const, at: b.at, text: b.text, id: b.key + b.where })), ...msgs.map(m => ({ kind: 'msg' as const, at: m.at, text: m.text, id: m.id }))]
                .sort((a, b) => b.at.localeCompare(a.at)).map(x => (
                  <div key={x.id} className="glass notice">
                    <header><span className="icon">{x.kind === 'brief' ? <Brief /> : <Message />}</span><div><b>{x.kind === 'brief' ? 'Brief' : 'Message to you'}</b><small className="time">{fmt(x.at)}</small></div></header>
                    <p>{x.text}</p>
                  </div>
                ))}
              {!briefs.length && !msgs.length && <p className="empty">Nothing new. Your brief is as planned.</p>}
            </div>
          </section>
        )}

        {tab === 'me' && (
          <section style={{ marginTop: '18vh', display: 'grid', gap: 14 }}>
            <div className="display" style={{ fontSize: 'clamp(46px, 13vw, 64px)' }}>{me.name}</div>
            <div className="glass list-card">
              <div className="row-line"><span className="muted">Team</span><b>{me.title}</b></div>
              {[...shifts, ...later].map((sh, i) => (
                <div className="row-line" key={i}><span className="muted">{dayLabel(sh.start.slice(0, 10)).wd}</span><b className="time small">{fmt(sh.start, true)} to {fmt(sh.end)} · {where(sh.venueId)}</b></div>
              ))}
            </div>
            <button type="button" className="btn block" onClick={() => router.push('/app')}>Switch role</button>
            <button type="button" className="link" style={{ justifySelf: 'center' }} onClick={() => router.push('/start/staff')}>Not {me.name.split(' ')[0]}? Pick your name</button>
          </section>
        )}

        <nav className="tabs-bottom" aria-label="Sections">
          <button type="button" aria-pressed={tab === 'shift'} onClick={() => setTab('shift')}><Calendar width={18} height={18} /> Shift</button>
          <button type="button" aria-pressed={tab === 'brief'} onClick={() => { setTab('brief'); markSeen(); }}><Brief width={18} height={18} /> Brief{fresh > 0 && tab !== 'brief' && <span className="badge">{fresh}</span>}</button>
          <button type="button" aria-pressed={tab === 'me'} onClick={() => setTab('me')}><User width={18} height={18} /></button>
        </nav>
      </main>
    </>
  );
}

function Item({ fest, s }: { fest: Festival; s: Session }) {
  const added = (s.addedSpeakers ?? []).map(id => fest.guests.find(g => g.id === id)?.name).filter(Boolean);
  return (
    <div className="tl-item">
      <div className="tl-time">{s.was && <s>{fmt(s.was.start, true)}</s>}{fmt(s.start, true)}</div>
      <div className={`card${s.moved || added.length ? ' changed' : ''}`}>
        <span className="ev-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ev-thumb" src={imageFor(s)} alt="" loading="lazy" />
          <span><span className="title">{s.title}</span><span className="meta">{fest.venues.find(v => v.id === s.venueId)?.name}</span></span>
        </span>
        {s.was ? <div className="note"><Clock /><span>Moved from {fmt(s.was.start)}. Tell arrivals their seats are held.</span></div>
          : added.length > 0 && <div className="note"><Swap /><span>{added.join(', ')} opens. Bring the late guest in through the stage door.</span></div>}
      </div>
    </div>
  );
}
