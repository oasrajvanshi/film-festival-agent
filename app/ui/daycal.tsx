'use client';
// Today's calendar map, in the style of Sienna's prototype: one column per
// venue, the day's events as blocks, a line for "now", and anything flagged
// or just moved picked out in amber.

import { useMemo } from 'react';
import type { AgentStore } from './useAgent';
import { clock as fmt, toMinutes } from '../../src/core/time';
import type { DayNumber, FestivalEvent } from '../../src/core/types';
import '../daycal.css';

/**
 * `events` shows a different version of the schedule (a preview or the
 * original plan); `was` maps moved events to their earlier start, and those
 * blocks are picked out and slide to their new time.
 */
export function DayCalendar({ s, day, events: over, was }: { s: AgentStore; day: DayNumber; events?: FestivalEvent[]; was?: Record<string, string> }) {
  const f = s.agent.f;
  const events = useMemo(() => (over ?? f.events).filter(e => e.day === day).sort((a, b) => a.start.localeCompare(b.start)), [f, over, day, s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const venues = f.venues.filter(v => events.some(e => e.venueId === v.id));
  if (!events.length) return <div className="empty-note">Nothing scheduled this day.</div>;
  const t0 = Math.floor(Math.min(...events.map(e => toMinutes(e.start))) / 60) * 60;
  const t1 = Math.ceil(Math.max(...events.map(e => toMinutes(e.end))) / 60) * 60;
  const span = Math.max(60, t1 - t0);
  const pct = (iso: string) => ((toMinutes(iso) - t0) / span) * 100;
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => t0 + i * 60);
  const flagged = new Set(s.agent.flags.flatMap(fl => events.filter(e => fl.id.includes(e.id)).map(e => e.id)));
  const now = toMinutes(s.clock);
  const onDay = s.clock.slice(0, 10) === f.dates[day];
  const guests = (ids: string[]) => ids.map(id => f.people.find(p => p.id === id)?.name).filter(Boolean).join(', ');
  return (
    <div className="dcal" style={{ ['--cols' as string]: venues.length, ['--h' as string]: `${Math.max(360, (span / 60) * 64)}px` }}>
      <div className="dcal-head"><span />{venues.map(v => <span key={v.id} title={v.name}>{v.name}</span>)}</div>
      <div className="dcal-body">
        <div className="dcal-hours">{hours.map(m => <b key={m} style={{ top: `${((m - t0) / span) * 100}%` }}>{fmt(`2000-01-01T${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00`).replace(':00', '')}</b>)}</div>
        {hours.map(m => <div key={m} className="dcal-line" style={{ top: `${((m - t0) / span) * 100}%` }} />)}
        {venues.map(v => (
          <div className="dcal-col" key={v.id}>
            {events.filter(e => e.venueId === v.id).map(e => {
              const short = toMinutes(e.end) - toMinutes(e.start) < 45;
              const live = onDay && now >= toMinutes(e.start) && now < toMinutes(e.end);
              return (
                <div key={e.id} className={`dcal-ev k-${e.kind}${short ? ' short' : ''}${flagged.has(e.id) ? ' hot' : ''}${was?.[e.id] ? ' moved' : ''}${e.status === 'cancelled' ? ' off' : ''}${live ? ' live' : ''}`}
                  style={{ top: `${pct(e.start)}%`, height: `calc(${pct(e.end) - pct(e.start)}% - 3px)` }}
                  title={`${e.title}, ${fmt(e.start)} to ${fmt(e.end)}${e.guestIds.length ? `, with ${guests(e.guestIds)}` : ''}`}>
                  <b>{e.title}</b>
                  <small>{was?.[e.id] && <s>{fmt(was[e.id])}</s>}{fmt(e.start)} to {fmt(e.end)}</small>
                  {e.guestIds.length > 0 && <em>{guests(e.guestIds)}</em>}
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
