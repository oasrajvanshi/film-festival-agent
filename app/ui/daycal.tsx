'use client';
// Overview's calendar map, in the style of Sienna's prototype: one column per
// venue, the day's events as blocks, a line for "now", and anything flagged
// or just moved picked out in amber.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentStore } from './useAgent';
import { addMinutes, clock as fmt, toMinutes } from '../../src/core/time';
import type { DayNumber, FestivalEvent } from '../../src/core/types';
import '../daycal.css';
import { EventThumb, Faces } from './media';
import { useLateGuests } from './weatherplan';

/** Pixels per hour: dense enough to see most of a day at once. */
const HOUR = 58;

/** A time whose "am"/"pm" can be hidden where the hour labels already say it (narrow phone columns). */
const tm = (iso: string) => { const t = fmt(iso); const m = /^(.*?)(\s?[ap]m)$/i.exec(t); return m ? <>{m[1]}<span className="ampm">{m[2]}</span></> : t; };

/**
 * `events` shows a different version of the schedule (a preview or the
 * original plan); `was` maps moved events to their earlier start. With
 * `animate`, moved cards slide between their old and new time every 1.5
 * seconds, over a dashed outline of where they were.
 */
type CalProps = { s: AgentStore; day: DayNumber; events?: FestivalEvent[]; was?: Record<string, string>; notes?: Record<string, string>; animate?: boolean };

/** The venue grid, on every screen size (it scrolls sideways on a phone). */
export function DayCalendar(props: CalProps) {
  return <GridCalendar {...props} />;
}

function GridCalendar({ s, day, events: over, was, notes, animate }: {
  s: AgentStore; day: DayNumber; events?: FestivalEvent[]; was?: Record<string, string>; notes?: Record<string, string>; animate?: boolean;
}) {
  const f = s.agent.f;
  const events = useMemo(() => (over ?? f.events).filter(e => e.day === day).sort((a, b) => a.start.localeCompare(b.start)), [f, over, day, s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  // Preview loop: false shows the old times, true the new ones.
  const [atNew, setAtNew] = useState(true);
  // Each loop jumps back to the old times without animating, then slides forward: only old → new is ever shown.
  const [snap, setSnap] = useState(false);
  const loopKey = animate ? [...Object.keys(was ?? {}), ...Object.keys(notes ?? {})].join() : '';
  const late = useLateGuests(s);
  // Phones: while a recommendation previews, show only the hours around the changes, so the
  // checklist and the moving events fit on one screen.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = matchMedia('(max-width: 760px)');
    const on = () => setNarrow(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
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
  let t0 = Math.floor(Math.min(...events.map(e => Math.min(toMinutes(e.start), toMinutes(oldOf(e)?.start ?? e.start)))) / 60) * 60;
  let t1 = Math.ceil(Math.max(...events.map(e => toMinutes(e.end))) / 60) * 60;
  const changed = events.filter(e => oldOf(e) || notes?.[e.id]);
  const focus = narrow && !!loopKey && changed.length > 0;
  if (focus) {
    t0 = Math.max(t0, Math.floor(Math.min(...changed.map(e => Math.min(toMinutes(e.start), toMinutes(oldOf(e)?.start ?? e.start)))) / 60) * 60 - 60);
    t1 = Math.min(t1, Math.ceil(Math.max(...changed.map(e => toMinutes(e.end))) / 60) * 60 + 60);
  }
  const span = Math.max(60, t1 - t0);
  const pct = (iso: string) => ((toMinutes(iso) - t0) / span) * 100;
  const place = (a: string, b: string) => ({ top: `${pct(a)}%`, height: `calc(${pct(b) - pct(a)}% - 3px)` });
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => t0 + i * 60);
  const flagged = new Set(s.agent.flags.flatMap(fl => events.filter(e => fl.id.includes(e.id)).map(e => e.id)));
  const now = toMinutes(s.clock);
  const onDay = s.clock.slice(0, 10) === f.dates[day];
  const guests = (ids: string[]) => ids.map(id => f.people.find(p => p.id === id)?.name).filter(Boolean).join(', ');
  return (
    <div ref={box} className={`dcal${animate ? ' previewing' : ''}${focus ? ' focus' : ''}${snap ? ' snap' : ''}`} style={{ ['--cols' as string]: venues.length, ['--hours' as string]: span / 60, ['--h' as string]: `${(span / 60) * HOUR}px` }}>
      <div className="dcal-head"><span />{venues.map(v => <span key={v.id} title={v.name}>{v.name}</span>)}</div>
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
              return (
                <div key={e.id} className={`dcal-ev k-${e.kind}${short ? ' short' : ''}${mins >= 75 ? ' tall' : ''}${flagged.has(e.id) ? ' hot' : ''}${o || notes?.[e.id] ? ' moved' : ''}${e.status === 'cancelled' ? ' off' : ''}${live ? ' live' : ''}`}
                  style={place(at.start, at.end)}
                  title={`${e.title}, ${fmt(e.start)} to ${fmt(e.end)}${e.guestIds.length ? `, with ${guests(e.guestIds)}` : ''}`}>
                  <div className="dcal-main">
                    {!short && <EventThumb e={e} size={26} />}
                    <div className="dcal-txt">
                      <b>{e.title}</b>
                      <small>{o && <s>{tm(o.start)}</s>}{tm(e.start)}{!short && mins >= 60 ? '' : <> to {tm(e.end)}</>}</small>
                    </div>
                    {(() => {
                      const cur = f.events.find(x => x.id === e.id);
                      const incoming = animate && cur ? e.guestIds.filter(g => !cur.guestIds.includes(g)) : [];
                      const outgoing = incoming.length ? e.guestIds.filter(g => late.has(g)) : [];
                      if (incoming.length && outgoing.length) {
                        const who = (id: string) => f.people.find(p => p.id === id)?.name ?? '';
                        const ini = (id: string) => who(id).split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
                        return (
                          <span className={`dcal-swap ${atNew ? 'is-new' : 'is-old'}`} title={`${who(incoming[0])} opens, ${who(outgoing[0])} joins later`}>
                            <i className="out">{ini(outgoing[0])}</i>
                            <span className="arr">→</span>
                            <i className="in">{ini(incoming[0])}</i>
                          </span>
                        );
                      }
                      return !short && e.guestIds.length > 0 ? <Faces s={s} ids={e.guestIds} size={18} max={3} /> : null;
                    })()}
                  </div>
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
