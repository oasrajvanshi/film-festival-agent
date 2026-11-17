'use client';
// Overview's map mode: the festival's venues on a street map of the city.
// Tap a venue to open its agenda for any festival day. When a plan changes
// (a recommendation's preview, or an approved plan), every venue with a
// change opens at once, each with its own calendar showing the moves.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { AgentStore } from './useAgent';
import type { DayNumber, FestivalEvent, Venue } from '../../src/core/types';
import { festivalDays } from '../../src/core/types';
import { clock as fmt, toMinutes } from '../../src/core/time';
import { useLateGuests } from './weatherplan';
import { EventThumb, Faces } from './media';
import { Icon } from './icons';
import {
  MAP_H, project, MAP_RES, MAP_MINOR, MAP_MAJOR, MAP_HWY, MAP_PED, MAP_WATER, MAP_CAMPUS, MAP_PARK, MAP_LABELS,
} from '../../src/data/boulder-map';
import { SHUTTLE_LOOP, MAP_NOTES } from '../../src/data/sundance2027';
import '../venuemap.css';

type Props = {
  s: AgentStore; day: DayNumber; onDay: (d: DayNumber) => void;
  /** A different version of the schedule (a preview or the original plan). */
  events?: FestivalEvent[];
  was: Record<string, string>; notes: Record<string, string>; animate: boolean; marks?: Record<string, string>;
  /** Open an event's details (under the map). */
  onPick?: (id: string) => void;
};

const dateOf = (iso: string) => new Date(`${iso}T12:00:00`);
const kindLabel: Record<FestivalEvent['kind'], string> = { screening: 'Screening', qa: 'Q&A', panel: 'Talk', market: 'Industry', activity: 'Event' };

/**
 * A viewBox around some points, with room for labels, never closer than `minW`
 * map units across, at the given height:width. `u` is one screen pixel in map
 * units when the map is drawn about `px` pixels wide, so lines and type keep
 * their size at any zoom.
 */
export function frameFor(points: [number, number][], minW: number, aspect: number, px: number) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padX = Math.max(60, (x1 - x0) * 0.16), padY = Math.max(50, (y1 - y0) * 0.18);
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
  const wantH = (x1 - x0) * aspect;
  if (y1 - y0 < wantH) { const c = (y0 + y1) / 2; y0 = c - wantH / 2; y1 = c + wantH / 2; }
  else { const wantW = (y1 - y0) / aspect; const c = (x0 + x1) / 2; x0 = c - wantW / 2; x1 = c + wantW / 2; }
  return { x0, y0, x1, y1, vb: `${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}`, u: (x1 - x0) / px };
}

/** The city under the venues: parks, campus, the creek, streets and their names. */
export function CityBase({ x0, y0, x1, y1, u }: { x0: number; y0: number; x1: number; y1: number; u: number }) {
  return (
    <g className="m-city" style={{ ['--u' as string]: u }}>
      <rect x={x0 - 400} y={y0 - 400} width={x1 - x0 + 800} height={y1 - y0 + 800} className="m-bg" />
      <path d={MAP_PARK} className="m-park" />
      <path d={MAP_CAMPUS} className="m-campus" />
      <path d={MAP_WATER} className="m-water" strokeWidth={2.2 * u} />
      <path d={MAP_RES} className="m-res" strokeWidth={1 * u} />
      <path d={MAP_MINOR} className="m-minor" strokeWidth={1.5 * u} />
      <path d={MAP_MAJOR} className="m-major" strokeWidth={2.8 * u} />
      <path d={MAP_HWY} className="m-hwy" strokeWidth={3.6 * u} />
      <path d={MAP_PED} className="m-ped" strokeWidth={4 * u} strokeDasharray={`${3 * u} ${2.5 * u}`} />
      {MAP_LABELS.map(l => (
        <text key={l.name} className="m-label" x={l.x} y={l.y} fontSize={9.5 * u} transform={`rotate(${l.a} ${l.x} ${l.y})`} dy={-3 * u} textAnchor="middle">{l.name.toUpperCase()}</text>
      ))}
      {MAP_NOTES.map(n => {
        const [x, y] = project(n.lat, n.lng);
        return <text key={n.text} className={`m-note ${n.kind}`} x={x} y={y} fontSize={(n.kind === 'area' ? 11 : 9.5) * u} textAnchor="middle">{n.text.toUpperCase()}</text>;
      })}
    </g>
  );
}

/** Venues placed on the map; any without coordinates are set in a row along the bottom. */
export function usePlaced(venues: Venue[]) {
  return useMemo(() => venues.map((v, i) => {
    const [x, y] = v.lat != null && v.lng != null ? project(v.lat, v.lng) : [80 + i * 70, MAP_H - 60];
    return { v, x, y };
  }), [venues]);
}

export function VenueMap({ s, day, onDay, events: over, was, notes, animate, marks, onPick }: Props) {
  const f = s.agent.f;
  const events = over ?? f.events;
  const placed = usePlaced(f.venues);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const today = events.filter(e => e.day === day);
  const count = (id: string) => today.filter(e => e.venueId === id && e.status === 'scheduled').length;

  // Venues with a change this day, in map order (west to east), numbered.
  const changedIds = new Set(today.filter(e => was[e.id] || notes[e.id]).map(e => e.venueId));
  const changed = placed.filter(p => changedIds.has(p.v.id)).sort((a, b) => a.x - b.x);
  const number = new Map(changed.map((p, i) => [p.v.id, i + 1]));
  const showChanges = changed.length > 0 && !picked;
  // A new set of changes (a recommendation opened): close any open venue so every changed venue shows at once.
  const changedKey = changed.map(p => p.v.id).join() + (animate ? ':preview' : '');
  useEffect(() => { if (changedKey) setPicked(null); }, [changedKey]);

  // The frame follows the map pane's own shape, so the venues fill it whether it is wide or tall.
  const pane = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 700, h: 504 });
  const [room, setRoom] = useState(1000);
  useEffect(() => {
    const el = pane.current, box = outer.current;
    if (!el || !box) return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth && el.clientHeight) setSize({ w: el.clientWidth, h: el.clientHeight });
      setRoom(box.clientWidth);
    });
    ro.observe(el); ro.observe(box);
    return () => ro.disconnect();
  }, []);
  // With changes on a wide map, each changed venue gets its own window on the map: the venues sit
  // in the middle and the windows in a column on each side, joined to their pin by a line.
  const popups = showChanges && room >= 760;
  const CARD_W = 252, GAP = 12, SIDE = CARD_W + 28;
  // Each window lists its changes one row each; its height follows how many rows it has.
  const rowsAt = (id: string) => changeRows(today, id, was, notes, marks, f).length;
  const cardH = (id: string) => windowHeight(Math.min(MAX_ROWS, rowsAt(id)) , rowsAt(id) > MAX_ROWS);
  const inner = popups ? size.w - 2 * SIDE : size.w;
  const fr = frameFor(placed.filter(p => p.v.lat != null).map(p => [p.x, p.y]), 330, size.h / inner, inner);
  const scale = (fr.x1 - fr.x0) / inner; // map units per pixel
  const x0 = popups ? fr.x0 - SIDE * scale : fr.x0, x1 = popups ? fr.x1 + SIDE * scale : fr.x1, y0 = fr.y0, y1 = fr.y1;
  const vb = `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`;
  const u = popups ? scale : fr.u;
  const px = (x: number, y: number) => [(x - x0) / scale, (y - y0) / scale] as const;
  const windows = popups ? placeWindows(changed.map(p => ({ id: p.v.id, at: px(p.x, p.y), h: cardH(p.v.id) })), size, CARD_W, GAP) : [];
  // Room for every window: the map grows to fit them.
  const colH = (side: string) => windows.filter(w => w.side === side).reduce((n, w) => n + w.h + GAP, GAP);
  const wantH = popups ? Math.max(520, colH('l'), colH('r')) : 0;

  const loop = SHUTTLE_LOOP.map(id => placed.find(p => p.v.id === id)).filter(Boolean) as { x: number; y: number }[];
  const pick = (id: string | null) => setPicked(id);
  const key = (id: string) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(picked === id ? null : id); } };
  const sel = picked ? f.venues.find(v => v.id === picked) ?? null : null;

  return (
    <div ref={outer} className={`vmap${showChanges && !popups ? ' has-changes' : ''}${popups ? ' popups' : ''}`}>
      <div className="vmap-map" ref={pane} style={popups ? { height: wantH } : undefined}>
        <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Map of ${f.venues.length} festival venues`} style={{ ['--u' as string]: u }}>
          <CityBase x0={x0} y0={y0} x1={x1} y1={y1} u={u} />
          {loop.length > 1 && (
            <polyline className="m-loop" points={[...loop, loop[0]].map(p => `${p.x},${p.y}`).join(' ')} strokeWidth={1.6 * u} strokeDasharray={`${5 * u} ${4 * u}`} />
          )}
          {placed.map(({ v, x, y }) => {
            const n = count(v.id);
            const ch = number.get(v.id);
            const on = picked === v.id;
            const r = (n ? 9 : 6.5) * u;
            const left = x > (x0 + x1) / 2 + (x1 - x0) * 0.22;
            return (
              <g key={v.id} className={`m-pin${on ? ' on' : ''}${ch ? ' changed' : ''}${n ? '' : ' quiet'}${hover === v.id ? ' hover' : ''}`}
                transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-pressed={on}
                aria-label={`${v.name}: ${n} event${n === 1 ? '' : 's'} this day${ch ? ', changed' : ''}`}
                onClick={() => pick(on ? null : v.id)} onKeyDown={key(v.id)}
                onMouseEnter={() => setHover(v.id)} onMouseLeave={() => setHover(null)}>
                {ch && <circle className="m-ring" r={r * 2.1} strokeWidth={1.5 * u} />}
                <circle className="m-dot" r={r} strokeWidth={1.6 * u} />
                {ch ? <text className="m-num" y={3.4 * u} fontSize={9.5 * u} textAnchor="middle">{ch}</text>
                  : n ? <text className="m-num" y={3.4 * u} fontSize={8.5 * u} textAnchor="middle">{n}</text> : null}
                <text className="m-name" x={(left ? -1 : 1) * (r + 5 * u)} y={3.6 * u} fontSize={11 * u} textAnchor={left ? 'end' : 'start'}>{v.name}</text>
              </g>
            );
          })}
        </svg>
        {popups && (
          <>
            <svg className="vpop-lines" viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
              {windows.map(w => {
                const ex = w.side === 'l' ? w.x + CARD_W : w.x;
                const ey = w.y + 18;
                const mx = (ex + w.at[0]) / 2;
                return <path key={w.id} d={`M${w.at[0]} ${w.at[1]} C ${mx} ${w.at[1]}, ${mx} ${ey}, ${ex} ${ey}`} />;
              })}
            </svg>
            {windows.map(w => {
              const v = f.venues.find(x => x.id === w.id)!;
              const i = number.get(w.id)!;
              const rows = changeRows(today, v.id, was, notes, marks, f);
              return (
                <section key={w.id} className={`vpop side-${w.side}`} style={{ left: w.x, top: w.y, width: CARD_W, ['--i' as string]: i - 1 }}>
                  <button className="vmap-card-h" onClick={() => pick(v.id)} title="Open this venue's agenda">
                    <i>{i}</i><b>{v.name}</b><span>{rows.length} {rows.length === 1 ? 'change' : 'changes'}</span>
                  </button>
                  <ChangeList s={s} rows={rows} animate={animate} onPick={onPick} />
                </section>
              );
            })}
            <div className="vpop-title"><b>{changed.length === 1 ? 'Changes at 1 venue' : `Changes at ${changed.length} venues`}</b><span>{animate ? 'Preview · approve to make it the plan' : 'New plan · old times crossed out'}</span></div>
          </>
        )}
        <div className="vmap-legend" aria-hidden="true">
          <span><i className="lg-dot" /> Venue · events this day</span>
          {loop.length > 1 && <span><i className="lg-loop" /> Festival shuttle</span>}
          {changed.length > 0 && <span><i className="lg-ch" /> Changed</span>}
        </div>
        <div className="vmap-credit">© OpenStreetMap contributors</div>
      </div>

      {!popups && <aside className="vmap-side">
        {sel ? <VenueAgenda s={s} v={sel} day={day} events={events} onPick={onPick} was={was} notes={notes} back={changed.length ? () => pick(null) : null} onClose={() => pick(null)} changedCount={changed.length} />
          : showChanges ? (
            <div className="vmap-changes">
              <div className="vmap-h">
                <b>{changed.length === 1 ? 'Changes at 1 venue' : `Changes at ${changed.length} venues`}</b>
                <span>{animate ? 'Preview: each venue shows its moves. Approve to make it the plan.' : 'The new plan, with the old times crossed out.'}</span>
              </div>
              <div className="vmap-deck">
                {changed.map(({ v }, i) => {
                  const rows = changeRows(today, v.id, was, notes, marks, f);
                  return (
                    <section className="vmap-card" key={v.id} style={{ ['--i' as string]: i }}>
                      <button className="vmap-card-h" onClick={() => pick(v.id)} title="Open this venue's agenda">
                        <i>{i + 1}</i><b>{v.name}</b><span>{rows.length} {rows.length === 1 ? 'change' : 'changes'}</span>
                      </button>
                      <ChangeList s={s} rows={rows} animate={animate} onPick={onPick} />
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <VenueList s={s} day={day} events={events} onPick={pick} hover={hover} setHover={setHover} />
          )}
      </aside>}
    </div>
  );
}

/**
 * Windows for the changed venues: venues west of centre get a window in the
 * left column, the rest on the right, each as close to its pin's height as the
 * others allow. Overflow on one side moves to the other.
 */
function placeWindows(items: { id: string; at: readonly [number, number]; h: number }[], size: { w: number; h: number }, w: number, gap: number) {
  const sum = (list: typeof items) => list.reduce((n, i) => n + i.h + gap, gap);
  const left = items.filter(i => i.at[0] < size.w / 2).sort((a, b) => a.at[1] - b.at[1]);
  const right = items.filter(i => i.at[0] >= size.w / 2).sort((a, b) => a.at[1] - b.at[1]);
  // Balance the two columns by height.
  while (left.length > 1 && sum(left) - sum(right) > left[left.length - 1].h + gap) right.push(left.pop()!);
  while (right.length > 1 && sum(right) - sum(left) > right[right.length - 1].h + gap) left.push(right.pop()!);
  const H = Math.max(520, size.h, sum(left), sum(right));
  const column = (list: typeof items, side: 'l' | 'r') => {
    list.sort((a, b) => a.at[1] - b.at[1]);
    const ys = list.map(i => Math.min(H - i.h - gap, Math.max(gap, i.at[1] - 24)));
    for (let k = 1; k < ys.length; k++) ys[k] = Math.max(ys[k], ys[k - 1] + list[k - 1].h + gap);
    for (let k = ys.length - 1; k >= 0; k--) { const lim = k === ys.length - 1 ? H - list[k].h - gap : ys[k + 1] - list[k].h - gap; ys[k] = Math.max(gap, Math.min(ys[k], lim)); }
    return list.map((i, k) => ({ ...i, side, x: side === 'l' ? gap : size.w - w - gap, y: ys[k] }));
  };
  return [...column(left, 'l'), ...column(right, 'r')];
}

// ---------------------------------------------------------------- one row per change
const MAX_ROWS = 4;
const ROW_H = 46, HEAD_H = 37, MORE_H = 24;
const windowHeight = (rows: number, more: boolean) => HEAD_H + rows * ROW_H + (more ? MORE_H : 0) + 6;

interface ChangeRow { e: FestivalEvent; was?: string; note?: string; mark?: string; withQa: boolean }

/** A venue's changes this day, one row each; a Q&A that simply moves with its screening rides on the screening's row. */
function changeRows(today: FestivalEvent[], venueId: string, was: Record<string, string>, notes: Record<string, string>, marks: Record<string, string> | undefined, f: AgentStore['agent']['f']): ChangeRow[] {
  const mine = today.filter(e => e.venueId === venueId && (was[e.id] || notes[e.id])).sort((a, b) => a.start.localeCompare(b.start));
  const out: ChangeRow[] = [];
  for (const e of mine) {
    const parent = e.kind === 'qa' ? mine.find(x => x.kind === 'screening' && x.filmId === e.filmId && x.end === e.start) : undefined;
    if (parent && !notes[e.id] && !marks?.[e.id]) { const r = out.find(x => x.e.id === parent.id); if (r) { r.withQa = true; continue; } }
    out.push({ e, was: was[e.id], note: notes[e.id], mark: marks?.[e.id], withQa: false });
  }
  void f;
  return out;
}

/** The preview loop shared by every window: old for a moment, then the new plan, every 1.5 s. */
function useLoop(on: boolean) {
  const [atNew, setAtNew] = useState(true);
  useEffect(() => {
    if (!on) { setAtNew(true); return; }
    const ts: ReturnType<typeof setTimeout>[] = [];
    const cycle = () => { setAtNew(false); ts.push(setTimeout(() => setAtNew(true), 450)); };
    cycle();
    const id = setInterval(cycle, 1800);
    return () => { clearInterval(id); ts.forEach(clearTimeout); };
  }, [on]);
  return atNew;
}

/** A window's rows: picture, the full title, old → new time or what changed, and a small animated badge. */
function ChangeList({ s, rows, animate, onPick }: { s: AgentStore; rows: ChangeRow[]; animate: boolean; onPick?: (id: string) => void }) {
  const atNew = useLoop(animate);
  const f = s.agent.f;
  const lateIds = useLateGuests(s);
  const shown = rows.slice(0, MAX_ROWS);
  const initials = (id?: string) => (f.people.find(p => p.id === id)?.name ?? '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div className={`vchg${atNew ? ' is-new' : ' is-old'}`}>
      {shown.map(({ e, was: w, note, mark, withQa }) => {
        const cur = f.events.find(x => x.id === e.id);
        const incoming = cur ? e.guestIds.filter(g => !cur.guestIds.includes(g)) : [];
        const outgoing = cur ? cur.guestIds.filter(g => lateIds.has(g) && !e.guestIds.includes(g)) : [];
        const mins = w ? toMinutes(e.start) - toMinutes(w) : 0;
        let fx: ReactNode = null;
        if (mark === 'video') fx = <span className="fx-swap"><i className="out">{initials(cur?.guestIds.find(g => lateIds.has(g)))}</i><b>→</b><i className="in cam"><Icon name="video" size={11} /></i></span>;
        else if (mark?.startsWith('seats:')) { const n = Math.min(6, Number(mark.slice(6)) || 4); fx = <span className="fx-seats">{Array.from({ length: n }, (_, k) => <i key={k} style={{ ['--k' as string]: k }} />)}<b>+{n}</b></span>; }
        else if (incoming.length && outgoing.length) fx = <span className="fx-swap"><i className="out">{initials(outgoing[0])}</i><b>→</b><i className="in">{initials(incoming[0])}</i></span>;
        else if (w) fx = <span className="fx-move" title={`${mins > 0 ? '+' : ''}${mins} min`}><i /><b>{mins > 0 ? '+' : ''}{mins}′</b></span>;
        return (
          <div key={e.id} className={`vchg-row k-${e.kind}${onPick ? ' pickable' : ''}`} title={`${e.title}${note ? ` · ${note}` : ''}`} onClick={onPick ? () => onPick(e.id) : undefined}>
            <EventThumb e={e} size={30} />
            <span className="vchg-t">
              <b>{e.title}</b>
              <small>
                {w ? <><s>{fmt(w)}</s><span className="arr">→</span><em>{fmt(e.start)}</em>{withQa ? ' · with Q&A' : ''}</> : <>{fmt(e.start)} · <em>{note}</em></>}
              </small>
            </span>
            <span className="vchg-fx">{fx}</span>
          </div>
        );
      })}
      {rows.length > MAX_ROWS && <div className="vchg-more">+{rows.length - MAX_ROWS} more at this venue</div>}
    </div>
  );
}

/**
 * The festival's days as a strip of cards (weekday, date, a bar for how busy
 * the day is), shared by the Calendar and the Map. Scrolls sideways when long.
 */
export function DayStrip({ s, day, onDay, events }: { s: AgentStore; day: DayNumber; onDay: (d: DayNumber) => void; events: FestivalEvent[] }) {
  const f = s.agent.f;
  const days = festivalDays(f);
  const per = (d: DayNumber) => events.filter(e => e.day === d && e.status === 'scheduled').length;
  const most = Math.max(1, ...days.map(per));
  return (
    <div className="day-strip" role="tablist" aria-label="Festival day">
      {days.map(d => {
        const date = dateOf(f.dates[d]);
        const n = per(d);
        return (
          <button key={d} role="tab" aria-selected={d === day} className={`${d === day ? 'on' : ''}${n ? '' : ' none'}`} onClick={() => onDay(d)} title={`Day ${d}: ${n} event${n === 1 ? '' : 's'}`}>
            <span>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <b>{date.getDate()}</b>
            <i style={{ ['--n' as string]: n / most }} />
          </button>
        );
      })}
    </div>
  );
}

/** No venue picked: every venue, what's on there this day. */
function VenueList({ s, day, events, onPick, hover, setHover }: { s: AgentStore; day: DayNumber; events: FestivalEvent[]; onPick: (id: string) => void; hover: string | null; setHover: (id: string | null) => void }) {
  const f = s.agent.f;
  const rows = f.venues.map(v => ({ v, list: events.filter(e => e.day === day && e.venueId === v.id && e.status === 'scheduled') }))
    .sort((a, b) => b.list.length - a.list.length);
  return (
    <div className="vmap-list">
      <div className="vmap-h"><b>{f.venues.length} venues</b><span>Tap one, here or on the map, for its agenda on every festival day.</span></div>
      {rows.map(({ v, list }) => (
        <button key={v.id} className={`vmap-row${hover === v.id ? ' hover' : ''}`} onClick={() => onPick(v.id)} onMouseEnter={() => setHover(v.id)} onMouseLeave={() => setHover(null)}>
          <span className="vmap-row-t"><b>{v.name}</b><small>{[v.area, v.use].filter(Boolean).join(' · ')}</small></span>
          <span className="vmap-row-n">{list.length ? <><b>{list.length}</b> today</> : <em>Quiet</em>}</span>
        </button>
      ))}
    </div>
  );
}

/** One venue's agenda: pick any festival day, see what's on, with moved times crossed out. */
function VenueAgenda({ s, v, day, onPick, events, was, notes, back, onClose, changedCount }: {
  s: AgentStore; v: Venue; day: DayNumber; onPick?: (id: string) => void; events: FestivalEvent[];
  was: Record<string, string>; notes: Record<string, string>; back: (() => void) | null; onClose: () => void; changedCount: number;
}) {
  const f = s.agent.f;
  const list = events.filter(e => e.day === day && e.venueId === v.id).sort((a, b) => a.start.localeCompare(b.start));
  const near = Object.entries(f.travel?.[v.id] ?? {}).filter(([id, m]) => id !== v.id && m > 0).sort((a, b) => a[1] - b[1]).slice(0, 2)
    .map(([id, m]) => `${m} min to ${f.venues.find(x => x.id === id)?.name ?? id}`);
  const seats = v.rooms?.length ? v.rooms.map(r => `${r.name} ${r.capacity}`).join(' · ') : `${v.capacity.toLocaleString('en-US')} seats`;
  return (
    <div className="vag">
      <div className="vag-top">
        {back ? <button className="ghost small vag-back" onClick={back}><span aria-hidden="true">←</span> {changedCount === 1 ? 'Back to the change' : `Back to ${changedCount} changes`}</button> : <span />}
        <button className="ghost small vag-x" aria-label="Close venue" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <h3 className="vag-name">{v.name}</h3>
      <p className="vag-meta">{[v.use, v.area].filter(Boolean).join(' · ')}</p>
      <p className="vag-meta"><Icon name="pin" size={13} /> {v.address} · {seats}</p>
      <div className="vag-day">
        <b>{dateOf(f.dates[day]).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</b>
        <span>Day {day} · {list.length ? `${list.length} event${list.length === 1 ? '' : 's'}` : 'Nothing on'}</span>
      </div>
      <div className="vag-list">
        {list.length === 0 && <div className="vag-empty">Nothing at {v.name} this day.</div>}
        {list.map(e => {
          const w = was[e.id];
          const note = notes[e.id];
          const film = e.filmId ? f.films.find(x => x.id === e.filmId) : undefined;
          return (
            <div key={e.id} onClick={onPick ? () => onPick(e.id) : undefined} className={`vag-ev${onPick ? ' pickable' : ''} k-${e.kind}${w || note ? ' moved' : ''}${e.status === 'cancelled' ? ' off' : ''}`}>
              <span className="vag-time">{w && <s>{fmt(w)}</s>}<b>{fmt(e.start)}</b><small>{fmt(e.end)}</small></span>
              <EventThumb e={e} size={38} />
              <span className="vag-txt">
                <b>{e.title}</b>
                <small>{film ? film.section : kindLabel[e.kind]}{e.restriction ? ` · ${e.restriction === 'press_only' ? 'Press & industry' : e.restriction === 'industry_only' ? 'Industry' : 'Invitation'}` : ''}{e.room ? ` · ${e.room}` : ''}</small>
                {note && <em>{note}</em>}
              </span>
              {e.guestIds.length > 0 && <Faces s={s} ids={e.guestIds} size={20} max={3} />}
            </div>
          );
        })}
      </div>
      {near.length > 0 && <p className="vag-foot"><Icon name="bus" size={13} /> {near.join(' · ')}</p>}
    </div>
  );
}
