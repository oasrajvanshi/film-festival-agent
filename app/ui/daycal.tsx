'use client';
// Overview's calendar map, in the style of Sienna's prototype: one column per
// venue, the day's events as blocks, a line for "now", and anything flagged
// or just moved picked out in amber.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentStore } from './useAgent';
import { addMinutes, clock as fmt, toMinutes } from '../../src/core/time';
import type { DayNumber, FestivalEvent } from '../../src/core/types';
import '../daycal.css';
import { Faces, eventImage } from './media';
import { useLateGuests } from './weatherplan';

/** Pixels per hour: dense enough to see most of a day at once. */
const HOUR_PX = 58;

/** A time whose "am"/"pm" can be hidden where the hour labels already say it (narrow phone columns). */
const tm = (iso: string) => { const t = fmt(iso); const m = /^(.*?)(\s?[ap]m)$/i.exec(t); return m ? <>{m[1]}<span className="ampm">{m[2]}</span></> : t; };

/**
 * `events` shows a different version of the schedule (a preview or the
 * original plan); `was` maps moved events to their earlier start. With
 * `animate`, moved cards slide between their old and new time every 1.5
 * seconds, over a dashed outline of where they were.
 */
type CalProps = {
  s: AgentStore; day: DayNumber; events?: FestivalEvent[]; was?: Record<string, string>; notes?: Record<string, string>; animate?: boolean;
  /** Changes that don't move an event, animated in the preview loop: 'video' or 'seats:N'. */
  marks?: Record<string, string>;
  /** Only these venues (the map's venue cards). */
  only?: string[];
  /** Only events touching this stretch of the day, in minutes from midnight. */
  window?: [number, number];
  /** Smaller hours and no venue header row (the card around it names the venue). */
  compact?: boolean;
  /** Click an event to see its details; the picked one is outlined. */
  onPick?: (id: string) => void;
  picked?: string | null;
};

/** The venue grid, on every screen size (it scrolls sideways on a phone). */
export function DayCalendar(props: CalProps) {
  return <GridCalendar {...props} />;
}

function GridCalendar({ s, day, events: over, was, notes, animate, only, window: win, compact, marks, onPick, picked }: CalProps) {
  const f = s.agent.f;
  const HOUR = compact ? 40 : HOUR_PX;
  const onlyKey = only?.join() ?? '';
  const events = useMemo(() => (over ?? f.events)
    .filter(e => e.day === day && (!only || only.includes(e.venueId)))
    .filter(e => !win || (toMinutes(e.end) > win[0] && toMinutes(e.start) < win[1]) || (was?.[e.id] && toMinutes(was[e.id]) < win[1]))
    .sort((a, b) => a.start.localeCompare(b.start)), [f, over, day, s.version, onlyKey, win?.[0], win?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  // Preview loop: false shows the old times, true the new ones.
  const [atNew, setAtNew] = useState(true);
  // Each loop jumps back to the old times without animating, then slides forward: only old → new is ever shown.
  const [snap, setSnap] = useState(false);
  const loopKey = animate ? [...Object.keys(was ?? {}), ...Object.keys(notes ?? {})].join() : '';
  const late = useLateGuests(s);
  useEffect(() => {
    if (!loopKey) { setAtNew(true); setSnap(false); return; }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = () => {
      setSnap(true); setAtNew(false);
      timers.push(setTimeout(() => { setSnap(false); setAtNew(true); }, 80));
    };
    cycle();
    const every = setInterval(cycle, 1500);
    return () => { clearInterval(every); timers.forEach(clearTimeout); };
  }, [loopKey]);

  // Bring the moved hours into view inside the calendar itself; the page stays still.
  const box = useRef<HTMLDivElement>(null);
  const firstMoved = loopKey && was ? Math.min(...Object.values(was).map(toMinutes)) : null;
  useEffect(() => {
    if (firstMoved === null || !box.current) return;
    const all = events.map(e => toMinutes(e.start));
    const start = Math.floor(Math.min(...all, firstMoved) / 60) * 60;
    // On a narrow screen also bring the first moved event's venue column into view.
    const firstId = Object.keys(was ?? {}).sort((x, y) => (was![x] < was![y] ? -1 : 1))[0];
    const ev = events.find(e => e.id === firstId);
    const cols = f.venues.filter(v => events.some(e => e.venueId === v.id)).map(v => v.id);
    const col = box.current.querySelector<HTMLElement>('.dcal-col');
    const left = ev && col ? Math.max(0, cols.indexOf(ev.venueId) * col.offsetWidth - 8) : 0;
    box.current.scrollTo({ top: Math.max(0, ((firstMoved - start) / 60) * HOUR - HOUR), left, behavior: 'smooth' });
  }, [loopKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const venues = f.venues.filter(v => events.some(e => e.venueId === v.id));
  if (!events.length) return <div className="empty-note">Nothing scheduled this day.</div>;
  const oldOf = (e: FestivalEvent) => {
    const w = was?.[e.id];
    if (!w) return null;
    const d = toMinutes(e.start) - toMinutes(w);
    return { start: w, end: addMinutes(e.end, -d) };
  };
  const t0 = Math.floor(Math.min(...events.map(e => Math.min(toMinutes(e.start), toMinutes(oldOf(e)?.start ?? e.start)))) / 60) * 60;
  const t1 = Math.ceil(Math.max(...events.map(e => toMinutes(e.end))) / 60) * 60;
  const span = Math.max(60, t1 - t0);
  const pct = (iso: string) => ((toMinutes(iso) - t0) / span) * 100;
  const place = (a: string, b: string) => ({ top: `${pct(a)}%`, height: `calc(${pct(b) - pct(a)}% - 3px)` });
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => t0 + i * 60);
  const flagged = new Set(s.agent.flags.flatMap(fl => events.filter(e => fl.id.includes(e.id)).map(e => e.id)));
  const now = toMinutes(s.clock);
  const onDay = s.clock.slice(0, 10) === f.dates[day];
  const guests = (ids: string[]) => ids.map(id => f.people.find(p => p.id === id)?.name).filter(Boolean).join(', ');
  return (
    <div ref={box} className={`dcal${animate ? ' previewing' : ''}${snap ? ' snap' : ''}${compact ? ' compact' : ''}`} style={{ ['--cols' as string]: venues.length, ['--hours' as string]: span / 60, ['--h' as string]: `${(span / 60) * HOUR}px` }}>
      {!compact && <div className="dcal-head"><span />{venues.map(v => <span key={v.id} title={v.name}>{v.name}</span>)}</div>}
      <div className="dcal-body">
        <div className="dcal-hours">{hours.map(m => <b key={m} style={{ top: `${((m - t0) / span) * 100}%` }}>{fmt(`2000-01-01T${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00`).replace(':00', '')}</b>)}</div>
        {hours.map(m => <div key={m} className="dcal-line" style={{ top: `${((m - t0) / span) * 100}%` }} />)}
        {venues.map(v => (
          <div className="dcal-col" key={v.id}>
            {animate && events.filter(e => e.venueId === v.id && oldOf(e)).map(e => {
              const o = oldOf(e)!;
              return <div key={`ghost-${e.id}`} className="dcal-ghost" style={place(o.start, o.end)} aria-hidden="true" />;
            })}
            {events.filter(e => e.venueId === v.id).map(e => {
              const mins = toMinutes(e.end) - toMinutes(e.start);
              const short = mins < 45;
              const live = onDay && now >= toMinutes(e.start) && now < toMinutes(e.end);
              const o = oldOf(e);
              const at = animate && o && !atNew ? o : e;
              // Who is on stage: shown on every card (under the title, or beside it on a short one), unless a swap is playing.
              const curEv = f.events.find(x => x.id === e.id);
              const playing = animate && (!!marks?.[e.id] || (!!curEv && e.guestIds.some(g => !curEv.guestIds.includes(g))));
              const people = !playing && e.guestIds.length > 0;
              return (
                <div key={e.id} className={`dcal-ev k-${e.kind}${short ? ' short' : ''}${mins >= 75 ? ' tall' : ''}${flagged.has(e.id) ? ' hot' : ''}${o || notes?.[e.id] ? ' moved' : ''}${e.status === 'cancelled' ? ' off' : ''}${live ? ' live' : ''}${people && !short ? ' has-people' : ''}${onPick ? ' pickable' : ''}${picked === e.id ? ' picked' : ''}`}
                  style={{ ...place(at.start, at.end), ['--img' as string]: `url(${eventImage(e)})` }}
                  role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined}
                  onClick={onPick ? () => onPick(e.id) : undefined}
                  onKeyDown={onPick ? ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(e.id); } } : undefined}
                  title={`${e.title}, ${fmt(e.start)} to ${fmt(e.end)}${e.guestIds.length ? `, with ${guests(e.guestIds)}` : ''}`}>
                  <div className="dcal-main">
                    <div className="dcal-txt">
                      <b>{e.title}</b>
                      <small>{o && <s>{tm(o.start)}</s>}{tm(e.start)}{!short && mins >= 60 ? '' : <> to {tm(e.end)}</>}</small>
                    </div>
                    {(() => {
                      const cur = f.events.find(x => x.id === e.id);
                      const incoming = animate && cur ? e.guestIds.filter(g => !cur.guestIds.includes(g)) : [];
                      const outgoing = incoming.length ? cur!.guestIds.filter(g => late.has(g)) : [];
                      const mark = animate ? marks?.[e.id] : undefined;
                      if (mark === 'video') {
                        // The absent guest's seat on stage becomes a screen: avatar out, video in.
                        const gone = (cur?.guestIds ?? e.guestIds).find(g => late.has(g));
                        const name = gone ? f.people.find(p => p.id === gone)?.name ?? '' : '';
                        const ini = name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
                        return (
                          <span className={`dcal-swap dcal-video ${atNew ? 'is-new' : 'is-old'}`} title={`${name} joins by video`}>
                            <i className="out">{ini}</i>
                            <span className="arr">→</span>
                            <i className="in"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="m15.5 10.5 6-3.5v10l-6-3.5" /></svg></i>
                          </span>
                        );
                      }
                      if (mark?.startsWith('seats:')) {
                        // Held seats lift off the card and go to the waitlist.
                        const n = Math.min(6, Number(mark.slice(6)) || 4);
                        return (
                          <span className={`dcal-seats ${atNew ? 'is-new' : 'is-old'}`} title={`${n} held seats go to the waitlist`}>
                            {Array.from({ length: n }, (_, i) => <i key={i} style={{ ['--k' as string]: i }} />)}
                            <b>+{n}</b>
                          </span>
                        );
                      }
                      if (incoming.length && outgoing.length) {
                        const who = (id: string) => f.people.find(p => p.id === id)?.name ?? '';
                        const ini = (id: string) => who(id).split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
                        return (
                          <span className={`dcal-swap ${atNew ? 'is-new' : 'is-old'}`} title={`${who(incoming[0])} steps in for ${who(outgoing[0])}`}>
                            <i className="out">{ini(outgoing[0])}</i>
                            <span className="arr">→</span>
                            <i className="in">{ini(incoming[0])}</i>
                          </span>
                        );
                      }
                      return short && people ? <Faces s={s} ids={e.guestIds} size={15} max={3} /> : null;
                    })()}
                  </div>
                  {people && !short && <div className="dcal-people"><Faces s={s} ids={e.guestIds} size={19} max={4} /></div>}
                  {notes?.[e.id] && <em className="dcal-note">{notes[e.id]}</em>}
                  {flagged.has(e.id) && <span className="tag">Flag</span>}
                  {e.status === 'cancelled' && <span className="tag">Off</span>}
                </div>
              );
            })}
          </div>
        ))}
        {onDay && now >= t0 && now <= t0 + span && <div className="dcal-now" style={{ top: `${pct(s.clock)}%` }}><i>{fmt(s.clock)}</i></div>}
      </div>
    </div>
  );
}
