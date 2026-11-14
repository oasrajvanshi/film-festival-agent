'use client';
// Attendee: your agenda, always the current plan. When something changes you
// see what changed and what to do, on the event itself and in Updates.

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Calendar, Clock, Snow, Swap, User } from '../hl/icons';
import {
  currentPlan, dayLabel, dayOf, fmt, imageFor, initials, messagesForAttendee, readWho, sampleAttendees, saveWho, snowWindow, toMin, useOps,
  type Festival, type Session,
} from '../hl/lib';

type Tab = 'agenda' | 'updates' | 'me';

export default function AttendeeApp() {
  const router = useRouter();
  const { fest, state, error } = useOps(3000);
  const [id, setId] = useState<string | null>(null);
  const [channels, setChannels] = useState<string[] | null>(null);
  const [tab, setTab] = useState<Tab>('agenda');
  const [day, setDay] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [seen, setSeen] = useState<string>('');

  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (t === 'updates' || t === 'me') setTab(t); }, []);
  useEffect(() => { const w = readWho('attendee'); if (w) { setId(w.id); setChannels(w.channels ?? null); } try { setSeen(localStorage.getItem('hl:seen:attendee') ?? ''); } catch { /* none */ } }, []);
  useEffect(() => { if (fest && !id) setId(sampleAttendees(fest)[0]?.id ?? null); }, [fest, id]);
  useEffect(() => { if (fest && state && day === null) setDay(dayOf(fest, state.clock)); }, [fest, state, day]);

  const me = fest?.audience.find(a => a.id === id) ?? null;
  const plan = useMemo(() => fest && state ? currentPlan(fest, state) : [], [fest, state]);
  const msgs = useMemo(() => fest && state && me ? messagesForAttendee(state, fest, me).sort((a, b) => b.at.localeCompare(a.at)) : [], [fest, state, me]);
  const unread = msgs.filter(m => m.at > seen).length;

  if (!fest || !state || !me || day === null) return <main className="phone" style={{ justifyContent: 'center', textAlign: 'center' }}><p className="muted">{error ?? 'Loading your agenda'}</p></main>;

  const mine = plan.filter(s => me.eventIds.includes(s.id) && s.day === day && s.status === 'scheduled').sort((a, b) => toMin(a.start) - toMin(b.start));
  const days = Object.entries(fest.info.dates).map(([d, date]) => ({ d: Number(d), ...dayLabel(date) }));
  const snow = snowWindow(state.conditions);
  const warned = msgs.some(m => m.template === 'weather_notice');
  const openS = plan.find(s => s.id === open);
  const markSeen = () => { const t = state.clock; setSeen(t); try { localStorage.setItem('hl:seen:attendee', t); } catch { /* none */ } };

  return (
    <>
      <div className="photo top" style={{ backgroundImage: 'url(/hl/audience.jpg)' }} />
      <main className="phone">
        <div className="app-head">
          <span className="wordmark">Harbor Lights</span>
          <span className="spacer" />
          <button type="button" className="me" onClick={() => setTab('me')} aria-label="Me">{initials(me.name)}</button>
        </div>

        {tab === 'agenda' && (
          <>
            <div className="hero">
              <div className="display">Your festival</div>
              <p className="muted">{me.name} · {Object.values(fest.info.dates).map(d => dayLabel(d)).map(l => l.n).join(', ')} {dayLabel(fest.info.dates[1]).month}</p>
            </div>
            <div className="days">
              {days.map(x => <button key={x.d} type="button" aria-pressed={x.d === day} onClick={() => setDay(x.d)}><b>{x.n}</b><span>{x.wd}</span></button>)}
            </div>
            <div data-lve-skip>
              {msgs[0] && msgs[0].at > seen && (
                <button type="button" className="glass notice" style={{ marginTop: 16, width: '100%', textAlign: 'left', color: 'inherit' }} onClick={() => { setTab('updates'); markSeen(); }}>
                  <header><span className="icon">{msgs[0].template === 'weather_notice' ? <Snow /> : <Calendar />}</span><div><b>{msgs[0].template === 'weather_notice' ? 'Snow this afternoon' : 'Your plan changed'}</b><small className="time">{fmt(msgs[0].at)}</small></div></header>
                  <p>{msgs[0].text}</p>
                </button>
              )}
              <div className="timeline">
                {mine.map(s => (
                  <div className="tl-item" key={s.id}>
                    <div className="tl-time">{s.was && <s>{fmt(s.was.start, true)}</s>}{fmt(s.start, true)}</div>
                    <button type="button" className={`card${s.moved || s.addedSpeakers ? ' changed' : ''}`} onClick={() => setOpen(s.id)}>
                      <span className="ev-row">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="ev-thumb" src={imageFor(s)} alt="" loading="lazy" />
                        <span><span className="title">{s.title}</span><span className="meta">{venue(fest, s)}</span></span>
                      </span>
                      <Advice fest={fest} s={s} snow={warned && snow && toMin(s.start) >= toMin(snow.start) && toMin(s.start) <= toMin(snow.end) && dayOf(fest, snow.start) === s.day} />
                    </button>
                  </div>
                ))}
                {!mine.length && <p className="empty">Nothing in your plan this day.</p>}
              </div>
            </div>
          </>
        )}

        {tab === 'updates' && (
          <section style={{ marginTop: '18vh' }} data-lve-skip>
            <div className="display" style={{ fontSize: 'clamp(46px, 13vw, 64px)' }}>Updates</div>
            <p className="muted" style={{ marginTop: 6 }}>Only about your plan.</p>
            <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
              {msgs.map(m => (
                <div key={m.id} className="glass notice">
                  <header><span className="icon">{m.template === 'weather_notice' ? <Snow /> : <Calendar />}</span><div><b>{m.template === 'weather_notice' ? 'Snow this afternoon' : 'Your plan changed'}</b><small className="time">{dayLabel(m.at.slice(0, 10)).wd} {fmt(m.at)}</small></div></header>
                  <p>{m.text}</p>
                </div>
              ))}
              {!msgs.length && <p className="empty">No updates. Your plan is as it was.</p>}
            </div>
          </section>
        )}

        {tab === 'me' && (
          <section style={{ marginTop: '18vh', display: 'grid', gap: 14 }}>
            <div className="display" style={{ fontSize: 'clamp(46px, 13vw, 64px)' }}>{me.name}</div>
            <div className="glass list-card">
              <div className="row-line"><span className="muted">Pass</span><b>{(me.passType ?? me.role).replace(/_/g, ' ')}</b></div>
              <div className="row-line"><span className="muted">In your plan</span><b>{me.eventIds.length} events</b></div>
            </div>
            <div className="glass list-card">
              {[['push', 'App notifications'], ['sms', 'Text messages'], ['email', 'Email']].map(([c, label]) => {
                const list = channels ?? me.channels.map(x => x === 'app_push' ? 'push' : x);
                const on = list.includes(c);
                return (
                  <div className="row-line" key={c}><b>{label}</b>
                    <button type="button" className="toggle" role="switch" aria-checked={on} aria-label={label} onClick={() => {
                      const nextList = on ? list.filter(x => x !== c) : [...list, c];
                      setChannels(nextList); saveWho({ role: 'attendee', id: me.id, channels: nextList });
                    }} />
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn block" onClick={() => router.push('/app')}>Switch role</button>
            <button type="button" className="link" style={{ justifySelf: 'center' }} onClick={() => router.push('/start/attendee')}>Not {me.name.split(' ')[0]}? Find your pass</button>
          </section>
        )}

        <nav className="tabs-bottom" aria-label="Sections">
          <button type="button" aria-pressed={tab === 'agenda'} onClick={() => setTab('agenda')}><Calendar width={18} height={18} /> Agenda</button>
          <button type="button" aria-pressed={tab === 'updates'} onClick={() => { setTab('updates'); markSeen(); }}><Bell width={18} height={18} /> Updates{unread > 0 && tab !== 'updates' && <span className="badge">{unread}</span>}</button>
          <button type="button" aria-pressed={tab === 'me'} onClick={() => setTab('me')}><User width={18} height={18} /></button>
        </nav>
      </main>

      {openS && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(null)} />
          <div className="sheet" role="dialog" aria-label={openS.title} data-lve-skip>
            <div className="grab" />
            <div style={{ display: 'grid', gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageFor(openS)} alt="" style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 14 }} />
              <div className="display" style={{ fontSize: 34 }}>{openS.title}</div>
              <div className="glass list-card">
                <div className="row-line"><span className="muted">When</span><b className="time">{openS.was && <s className="muted" style={{ marginRight: 8 }}>{fmt(openS.was.start)}</s>}{fmt(openS.start)} to {fmt(openS.end)}</b></div>
                <div className="row-line"><span className="muted">Where</span><b>{venue(fest, openS)}</b></div>
                {openS.guestIds.length > 0 && <div className="row-line"><span className="muted">Guests</span><b style={{ textAlign: 'right' }}>{guestLine(fest, openS)}</b></div>}
              </div>
              <Advice fest={fest} s={openS} snow={warned && !!snow && dayOf(fest, snow.start) === openS.day && toMin(openS.start) >= toMin(snow.start) && toMin(openS.start) <= toMin(snow.end)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Advice({ fest, s, snow }: { fest: Festival; s: Session; snow: boolean | null | undefined }) {
  const notes: { icon: 'clock' | 'swap' | 'snow'; text: string }[] = [];
  if (s.was) notes.push({ icon: 'clock', text: `Now starts at ${fmt(s.start)} (was ${fmt(s.was.start)}). Your seat is held.` });
  if (s.addedSpeakers?.length) {
    const added = s.addedSpeakers.map(id => fest.guests.find(g => g.id === id)?.name).filter(Boolean).join(', ');
    const replaced = (s.notes ?? []).map(n => n.match(/in place of (.+)$/)?.[1]).find(Boolean);
    notes.push({ icon: 'swap', text: replaced ? `${added} opens. ${replaced} joins when they arrive.` : `${added} joins the stage.` });
  }
  if (snow) notes.push({ icon: 'snow', text: 'Snow on the way here. Leave 15 minutes early; the Harbor Loop shuttle is running late.' });
  if (!notes.length) return null;
  const I = { clock: Clock, swap: Swap, snow: Snow };
  const n = notes[0];
  const Icon = I[n.icon];
  return <div className="note"><Icon /><span>{n.text}</span></div>;
}

function venue(f: Festival, s: Session) { return f.venues.find(v => v.id === s.venueId)?.name ?? s.venueId; }
function guestLine(f: Festival, s: Session) {
  const names = (ids: string[]) => ids.map(id => f.guests.find(g => g.id === id)?.name ?? id);
  return [...names(s.addedSpeakers ?? []), ...names(s.guestIds)].filter((n, i, xs) => xs.indexOf(n) === i).join(', ');
}
