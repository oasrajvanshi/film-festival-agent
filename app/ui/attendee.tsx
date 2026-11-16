'use client';
// The attendee app, phone only. One idea per screen:
//   Agenda   your days as a timeline; what changed is marked on the event
//            itself, with one line on what to do; cancelled events offer a
//            swap; gaps offer a pick that fits.
//   Updates  only about your plan.
//   Pass     one code for your pass and every ticket.
//   Ask      questions about the festival.

import { useMemo, useState, type ReactElement } from 'react';
import qrcode from 'qrcode-generator';
import type { AgentStore } from './useAgent';
import type { Who } from '../../src/access/profiles';
import type { DayNumber, FestivalEvent } from '../../src/core/types';
import { festivalDays } from '../../src/core/types';
import { clock as fmt } from '../../src/core/time';
import { PASS_LABELS, qrFor } from '../../src/rules/access';
import { EventThumb, Faces } from './media';
import { Icon } from './icons';
import { Ask } from './panels';
import { MyArrival } from './presence';

type Why = 'Ticket' | 'Saved';
type Plan = { e: FestivalEvent; why: Why };

const tod = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const readOriginal = (): FestivalEvent[] => { try { const v = localStorage.getItem('usher-original-plan-v1'); return v ? JSON.parse(v) : []; } catch { return []; } };

export function AttendeeApp({ s, who, onOut, viewAs }: { s: AgentStore; who: Who; onOut: () => void; viewAs?: boolean }) {
  const [tab, setTab] = useState<'agenda' | 'updates' | 'pass' | 'ask'>('agenda');
  const inbox = s.agent.outbox.filter(d => d.personId === who.id);
  const [seen, setSeen] = useState(0);
  const unread = Math.max(0, inbox.length - seen);
  const go = (t: typeof tab) => { setTab(t); if (t === 'updates') setSeen(inbox.length); window.scrollTo({ top: 0 }); };
  return (
    <div className={`at at-on-${tab}`}>
      {/* The whole app sits on a cinema photo, darkened so the cards read on top. */}
      <div className="at-photo" aria-hidden="true" style={{ backgroundImage: `url(${tab === 'pass' ? '/hl/hall.jpg' : '/hl/audience.jpg'})` }} />
      {viewAs && <div className="viewas-bar"><Icon name="eye" size={16} /> Viewing as {who.name}. <button className="small" onClick={onOut}>Back to organizer</button></div>}
      <header className="at-head">
        <div>
          <div className="at-fest">{s.festivalName}</div>
          <div className="at-sub">{who.name}</div>
        </div>
        {!viewAs && <button className="at-me" onClick={onOut} aria-label="Sign out" title="Sign out">{who.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('')}</button>}
      </header>
      <main className="at-body">
        {tab === 'agenda' && <Agenda s={s} who={who} />}
        {tab === 'updates' && <Updates s={s} who={who} />}
        {tab === 'pass' && <><Pass s={s} who={who} /><MyArrival s={s} who={who} /></>}
        {tab === 'ask' && <div className="at-ask"><h1 className="at-h1">Ask</h1><Ask s={s} user={who.name} go={() => undefined} /></div>}
      </main>
      <nav className="at-nav" aria-label="Sections">
        {([['agenda', 'Agenda', 'calendar'], ['updates', 'Updates', 'inbox'], ['pass', 'Pass', 'ticket'], ['ask', 'Ask', 'chat']] as const).map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>
            <Icon name={icon} size={18} /><span>{label}</span>
            {id === 'updates' && unread > 0 && <i className="at-badge">{unread}</i>}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------- agenda
function Agenda({ s, who }: { s: AgentStore; who: Who }) {
  const f = s.agent.f;
  const days = festivalDays(f);
  const [v, setV] = useState(0); // bump after a swap or a save
  const plans: Plan[] = useMemo(() => {
    const out: Plan[] = [];
    const add = (eid: string, why: Why) => { const e = f.events.find(x => x.id === eid); if (e && !out.some(p => p.e.id === eid)) out.push({ e, why }); };
    for (const t of f.tickets) if (t.personId === who.id) add(t.eventId, 'Ticket');
    for (const b of f.bookings) if (b.personId === who.id) add(b.eventId, 'Saved');
    return out.sort((a, b) => a.e.start.localeCompare(b.e.start));
  }, [f, who.id, s.version, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const original = useMemo(() => readOriginal(), [s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = (Number(Object.entries(f.dates).find(([, d]) => s.clock.startsWith(d))?.[0]) || days[0]) as DayNumber;
  const firstWithPlans = days.find(d => plans.some(p => p.e.day === d)) ?? days[0];
  const [day, setDay] = useState<DayNumber>(plans.some(p => p.e.day === today) ? today : firstWithPlans);
  const was = (e: FestivalEvent) => { const o = original.find(x => x.id === e.id); return o && o.start !== e.start ? o.start : null; };
  const changedOn = (d: DayNumber) => plans.some(p => p.e.day === d && (was(p.e) || p.e.status === 'cancelled'));
  const mine = plans.filter(p => p.e.day === day);
  const inPlan = new Set(plans.map(p => p.e.id));

  // Change the plan here at once; on a shared festival the server keeps it (only your own plan).
  const change = (add: string | null, remove: string | null) => {
    if (remove) f.bookings = f.bookings.filter(b => !(b.personId === who.id && b.eventId === remove));
    if (add && !f.bookings.some(b => b.personId === who.id && b.eventId === add)) f.bookings.push({ personId: who.id, eventId: add });
    s.commit(); setV(x => x + 1);
    if (s.shared) s.call('booking', { add, drop: remove }).then(() => s.pull()).catch(() => undefined);
  };
  const drop = (eventId: string) => change(null, eventId);
  const save = (eventId: string, remove?: string) => change(eventId, remove ?? null);
  const open = (e: FestivalEvent) => e.status === 'scheduled' && !inPlan.has(e.id) && (e.kind === 'screening' || e.kind === 'panel') && !e.restriction;
  /** Events you could swap a cancelled one for: same day, starting within an hour of it. */
  const swaps = (c: FestivalEvent) => f.events.filter(e => e.day === c.day && open(e) && Math.abs(tod(e.start) - tod(c.start)) <= 60).slice(0, 2);
  /** One pick for a free stretch: starts after the gap opens and ends 20 minutes before the next thing. */
  const pickFor = (from: string, to: string) => f.events
    .filter(e => e.day === day && open(e) && tod(e.start) >= tod(from) + 15 && tod(e.end) <= tod(to) - 20)
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  const rows: ReactElement[] = [];
  mine.forEach((p, i) => {
    const prev = mine[i - 1];
    if (prev && tod(p.e.start) - tod(prev.e.end) >= 100) {
      const pick = pickFor(prev.e.end, p.e.start);
      if (pick) rows.push(
        <div className="at-row at-free" key={`free-${p.e.id}`}>
          <div className="at-time"><span>{fmt(prev.e.end)}</span></div>
          <div className="at-pick">
            <small>Free until {fmt(p.e.start)} · Usher suggests</small>
            <div className="at-pick-row">
              <EventThumb e={pick} size={40} />
              <span><b>{pick.title}</b><em>{fmt(pick.start)} · {f.venues.find(x => x.id === pick.venueId)?.name}</em></span>
              <button className="small" onClick={() => save(pick.id)}>Save</button>
            </div>
          </div>
        </div>,
      );
    }
    const w = was(p.e);
    const off = p.e.status === 'cancelled';
    // Two saved events at once: ask which one to keep.
    const clash = prev && p.e.status === 'scheduled' && prev.e.status === 'scheduled' && tod(p.e.start) < tod(prev.e.end) ? prev : null;
    const canDrop = (x: Plan) => x.why === 'Saved';
    const venue = f.venues.find(x => x.id === p.e.venueId)?.name ?? '';
    rows.push(
      <div className={`at-row${w ? ' moved' : ''}${off ? ' off' : ''}`} key={p.e.id}>
        <div className="at-time">{w && <s>{fmt(w)}</s>}<span>{fmt(p.e.start)}</span></div>
        <div className="at-card">
          <div className="at-card-main">
            <EventThumb e={p.e} size={56} />
            <div className="at-card-txt">
              <b>{p.e.title}</b>
              <em>{venue}{p.e.room ? `, ${p.e.room}` : ''}</em>
              <Faces s={s} ids={p.e.guestIds} size={20} />
            </div>
            <span className="at-why">{p.why}</span>
          </div>
          {w && <p className="at-note"><Icon name="clock" size={14} /> Now starts at {fmt(p.e.start)} (was {fmt(w)}).{p.why === 'Ticket' ? ' Your seat is held.' : ''}</p>}
          {clash && (
            <div className="at-note warn">
              <span>Overlaps with {clash.e.title}. Keep one:</span>
              <div className="at-keep">
                {canDrop(clash) && <button className="small" onClick={() => drop(clash.e.id)}>Keep this one</button>}
                {canDrop(p) && <button className="small ghost" onClick={() => drop(p.e.id)}>Keep {clash.e.title}</button>}
              </div>
            </div>
          )}
          {off && (
            <div className="at-note bad">
              <span><Icon name="x" size={14} /> Cancelled. Pick another that fits your day:</span>
              {swaps(p.e).map(e => (
                <button key={e.id} className="at-swap" onClick={() => save(e.id, p.e.id)}>
                  <EventThumb e={e} size={32} /><span><b>{e.title}</b><em>{fmt(e.start)} · {f.venues.find(x => x.id === e.venueId)?.name}</em></span><i>Swap</i>
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
      <div className="at-days" role="tablist" aria-label="Day">
        {days.map(d => {
          const date = new Date(`${f.dates[d]}T12:00:00`);
          return (
            <button key={d} role="tab" aria-selected={d === day} className={d === day ? 'on' : ''} onClick={() => setDay(d)}>
              <b>{date.getDate()}</b><span>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              {changedOn(d) && <i aria-label="Something changed" />}
            </button>
          );
        })}
      </div>
      <div className="at-dayhead">
        <b>{new Date(`${f.dates[day]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</b>
        <span>{mine.length ? `${mine.length} on your plan` : 'Nothing planned'}</span>
      </div>
      {mine.length === 0
        ? <div className="at-empty">Nothing on your plan this day.</div>
        : <div className="at-list">{rows}</div>}
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
