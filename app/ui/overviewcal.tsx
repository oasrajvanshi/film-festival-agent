'use client';
// The whole festival at a glance, for the onboarding Check step: one strip
// per day, one row per venue, every event placed along the hours. Small on
// purpose, so the organizer can see what came through from their schedule.

import type { Festival } from '../../src/core/types';
import { festivalDays } from '../../src/core/types';
import { clock as fmt } from '../../src/core/time';

/** Minutes since midnight, whatever the date. */
const tod = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
/** An end time, counted past midnight when it falls before the start. */
const todEnd = (start: string, end: string) => { const v = tod(end); return v < tod(start) ? v + 1440 : v; };

export function OverviewCalendar({ f }: { f: Festival }) {
  const days = festivalDays(f).filter(d => f.events.some(e => e.day === d));
  const all = f.events.filter(e => days.includes(e.day));
  if (!all.length) return null;
  const t0 = Math.floor(Math.min(...all.map(e => tod(e.start))) / 60) * 60;
  const t1 = Math.ceil(Math.max(...all.map(e => todEnd(e.start, e.end))) / 60) * 60;
  const span = Math.max(60, t1 - t0);
  const x = (iso: string) => ((tod(iso) - t0) / span) * 100;
  const xEnd = (a: string, b: string) => ((todEnd(a, b) - t0) / span) * 100;
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => t0 + i * 60).filter((_, i) => i % 2 === 0);
  const label = (m: number) => `${(Math.floor(m / 60) % 12) || 12}${Math.floor(m / 60) < 12 ? 'a' : 'p'}`;
  const venues = f.venues.filter(v => all.some(e => e.venueId === v.id));
  return (
    <div className="ocal">
      <div className="ocal-hours"><span />{<div>{hours.map(m => <b key={m} style={{ left: `${((m - t0) / span) * 100}%` }}>{label(m)}</b>)}</div>}</div>
      {days.map(d => (
        <div className="ocal-day" key={d}>
          <div className="ocal-dname">Day {d} · {new Date(`${f.dates[d]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          {venues.map(v => (
            <div className="ocal-row" key={v.id}>
              <span className="ocal-venue" title={v.name}>{v.name}</span>
              <div className="ocal-track">
                {hours.map(m => <i key={m} className="ocal-tick" style={{ left: `${((m - t0) / span) * 100}%` }} />)}
                {all.filter(e => e.day === d && e.venueId === v.id).map(e => (
                  <span key={e.id} className={`ocal-ev k-${e.kind}${e.status === 'cancelled' ? ' off' : ''}`}
                    style={{ left: `${x(e.start)}%`, width: `calc(${xEnd(e.start, e.end) - x(e.start)}% - 2px)` }}
                    title={`${e.title}, ${fmt(e.start)} to ${fmt(e.end)}`}>{e.title}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
