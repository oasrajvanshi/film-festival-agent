'use client';
// One event's details, under Overview's calendar: what it is, who is on stage
// (and whether they're here), seats, who has it in their plan, the crew on
// shift, and the edits the Schedule page used to hold. Saving an edit runs the
// agent, exactly like editing the sheet: it works out who is affected.

import { useEffect, useMemo, useState } from 'react';
import type { AgentStore } from './useAgent';
import type { FestivalEvent } from '../../src/core/types';
import { addMinutes, clock as fmt, overlaps, toMinutes } from '../../src/core/time';
import { EventThumb } from './media';
import { Icon } from './icons';
import { useLateGuests } from './weatherplan';

type Patch = Partial<Pick<FestivalEvent, 'start' | 'end' | 'venueId' | 'guestIds' | 'status'>>;

const KIND: Record<FestivalEvent['kind'], string> = { screening: 'Screening', qa: 'Q&A', panel: 'Talk', market: 'Industry', activity: 'Event' };
const ROLE: Record<string, string> = { director: 'Director', producer: 'Producer', panelist: 'Panelist', moderator: 'Moderator' };
const TONES = ['#b9825a', '#8f6a4f', '#a4744e', '#7d5b46', '#c39367', '#6f5a4e'];
const ini = (n: string) => n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const tone = (n: string) => TONES[[...n].reduce((h, c) => h + c.charCodeAt(0), 0) % TONES.length];

export function EventDetail({ s, id, events, was, notes, user, onClose }: {
  s: AgentStore; id: string; events: FestivalEvent[]; was: Record<string, string>; notes: Record<string, string>; user: string; onClose: () => void;
}) {
  const f = s.agent.f;
  const late = useLateGuests(s);
  const e = events.find(x => x.id === id) ?? f.events.find(x => x.id === id);
  const [draft, setDraft] = useState<Patch>({});
  const [moveQa, setMoveQa] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  useEffect(() => { setDraft({}); setResult(null); setAdding(''); }, [id]);
  // Scroll the details into view when an event is picked.
  useEffect(() => { document.querySelector('.evd')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [id]);
  const facts = useMemo(() => {
    if (!e) return null;
    const venue = f.venues.find(v => v.id === e.venueId);
    const cap = venue?.rooms?.find(r => r.name === e.room)?.capacity ?? venue?.capacity ?? 0;
    const film = e.filmId ? f.films.find(x => x.id === e.filmId) : undefined;
    const showings = film ? f.events.filter(x => x.kind === 'screening' && x.filmId === film.id && !x.restriction).sort((a, b) => a.start.localeCompare(b.start)) : [];
    const n = showings.findIndex(x => x.id === e.id);
    const saved = f.bookings.filter(b => b.eventId === e.id).length;
    const tickets = f.tickets.filter(t => t.eventId === e.id).length;
    const crew = f.shifts.filter(x => x.venueId === e.venueId && overlaps(x.start, x.end, e.start, e.end)).map(x => f.people.find(p => p.id === x.personId)).filter(Boolean);
    const arrivals = (f.arrivals ?? []).filter(a => a.day === e.day);
    return { venue, cap, film, n, showings: showings.length, saved, tickets, crew, arrivals };
  }, [f, e, s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!e || !facts) return null;
  const cur = { ...e, ...draft };
  const dirty = Object.keys(draft).length > 0;
  const date = new Date(`${f.dates[e.day]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const guests = f.people.filter(p => p.role === 'guest');
  const qa = e.kind === 'screening' ? f.events.find(x => x.kind === 'qa' && x.filmId === e.filmId && x.start === e.end) : undefined;

  const patch = (p: Patch) => {
    const next = { ...draft, ...p };
    if (p.start) next.end = addMinutes(e.end, toMinutes(p.start) - toMinutes(e.start));
    setDraft(next); setResult(null);
  };
  const save = async () => {
    setBusy(true);
    const delta = draft.start ? toMinutes(draft.start) - toMinutes(e.start) : 0;
    const next = f.events.map(x => {
      if (x.id === e.id) return { ...x, ...draft };
      if (moveQa && qa && x.id === qa.id) return { ...x, ...(delta ? { start: addMinutes(x.start, delta), end: addMinutes(x.end, delta) } : {}), ...(draft.venueId ? { venueId: draft.venueId } : {}) };
      return { ...x };
    });
    const r = await s.agent.onGridEdit(next, user || 'Organizer');
    const asks = r.actions.filter(a => a.kind === 'notify_people' || a.kind === 'update_website').length;
    const auto = r.actions.filter(a => a.kind === 'update_brief' || a.kind === 'notify_staff').length;
    const flags = r.actions.filter(a => a.kind === 'flag').length;
    setResult(`Saved. The agent sent ${auto} internal update${auto === 1 ? '' : 's'}; ${asks} message${asks === 1 ? '' : 's'} to the public wait for approval${flags ? `; ${flags} flag${flags === 1 ? '' : 's'}` : ''}.`);
    setDraft({}); setBusy(false);
    s.commit();
  };
  const status = (gid: string) => {
    const p = f.people.find(x => x.id === gid);
    if (late.has(gid)) return <span className="evd-st bad">Can&apos;t make it</span>;
    const here = facts.arrivals.find(a => a.personId === gid);
    if (here) return <span className="evd-st ok">Here {fmt(here.at)}</span>;
    if (p?.arrives && p.arrives > `${f.dates[e.day]}T00:00` && p.arrives.slice(0, 10) === f.dates[e.day]) return <span className="evd-st">Lands {fmt(p.arrives)}</span>;
    return <span className="evd-st">Expected</span>;
  };
  const pct = facts.cap ? Math.round(((e.seatsSold ?? 0) / facts.cap) * 100) : 0;
  return (
    <section className="card evd" aria-label={`Details: ${e.title}`}>
      <div className="evd-head">
        <EventThumb e={e} size={58} />
        <div className="evd-title">
          <span className="evd-kind">{KIND[e.kind]}{facts.film ? ` · ${facts.film.section}` : ''}{e.restriction ? ` · ${e.restriction === 'press_only' ? 'Press & industry' : e.restriction === 'industry_only' ? 'Industry' : 'Invitation'}` : ''}</span>
          <h3>{e.title}</h3>
          <p>
            {was[e.id] && <s>{fmt(was[e.id])}</s>} {date} · {fmt(cur.start)} to {fmt(cur.end)} · {f.venues.find(v => v.id === cur.venueId)?.name}{e.room ? `, ${e.room}` : ''}
          </p>
          {notes[e.id] && notes[e.id] !== 'Changed' && <p className="evd-note"><Icon name="sparkle" size={13} /> {notes[e.id]}</p>}
        </div>
        <button className="ghost small evd-x" aria-label="Close details" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>

      <div className="evd-grid">
        <div className="evd-col">
          <h4>On stage</h4>
          {e.guestIds.length === 0 && <p className="muted evd-none">{e.kind === 'screening' ? 'No guests at this screening.' : 'No guests listed.'}</p>}
          <ul className="evd-people">
            {e.guestIds.map(gid => {
              const p = f.people.find(x => x.id === gid);
              if (!p) return null;
              return (
                <li key={gid} className={late.has(gid) ? 'late' : ''}>
                  <i className="evd-av" style={{ background: tone(p.name) }}>{ini(p.name)}</i>
                  <span className="evd-who"><b>{p.name}</b><small>{ROLE[p.staffRole ?? ''] ?? (p.role === 'guest' ? 'Guest' : p.role)}{p.travelNote ? ` · ${p.travelNote}` : ''}</small></span>
                  {status(gid)}
                </li>
              );
            })}
          </ul>
          {facts.film && (
            <p className="evd-film">Directed by {facts.film.director} · {facts.film.runtimeMin} min{facts.n >= 0 ? ` · ${facts.n === 0 ? 'World premiere' : `Screening ${facts.n + 1} of ${facts.showings}`}` : ''}</p>
          )}
        </div>

        <div className="evd-col">
          <h4>Audience and crew</h4>
          {e.kind === 'screening' && !e.restriction && facts.cap > 0 && (
            <div className="evd-seats">
              <span><b>{(e.seatsSold ?? 0).toLocaleString('en-US')}</b> of {facts.cap.toLocaleString('en-US')} seats sold · {e.seatsHeld ?? 0} held for guests and press</span>
              <i className="dstat-bar"><i style={{ width: `${pct}%` }} /></i>
            </div>
          )}
          <dl className="evd-facts">
            <div><dt>In people&apos;s plans</dt><dd>{facts.saved} saved · {facts.tickets} ticket{facts.tickets === 1 ? '' : 's'} on Usher</dd></div>
            <div><dt>Volunteers on shift</dt><dd>{facts.crew.length ? `${facts.crew.length}: ${facts.crew.slice(0, 3).map(p => p!.name).join(', ')}${facts.crew.length > 3 ? '…' : ''}` : 'None'}</dd></div>
            <div><dt>Address</dt><dd>{facts.venue?.address}</dd></div>
          </dl>
        </div>

        <div className="evd-col evd-edit">
          <h4>Change it</h4>
          <label>Start <input type="time" value={cur.start.slice(11)} onChange={x => x.target.value && patch({ start: `${e.start.slice(0, 11)}${x.target.value}` })} /></label>
          <label>Venue <select value={cur.venueId} onChange={x => patch({ venueId: x.target.value })}>{f.venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
          <div className="evd-guests">
            {cur.guestIds.map(g => <button key={g} className="evd-chip" onClick={() => patch({ guestIds: cur.guestIds.filter(x => x !== g) })} title="Remove">{f.people.find(p => p.id === g)?.name} <Icon name="x" size={11} /></button>)}
            <select value={adding} onChange={x => { if (x.target.value) patch({ guestIds: [...cur.guestIds, x.target.value] }); setAdding(''); }} aria-label="Add a guest">
              <option value="">Add a guest…</option>
              {guests.filter(g => !cur.guestIds.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          {qa && <label className="evd-check"><input type="checkbox" checked={moveQa} onChange={x => setMoveQa(x.target.checked)} /> Move its Q&amp;A with it</label>}
          <div className="evd-actions">
            <button className="small" onClick={() => patch({ status: cur.status === 'cancelled' ? 'scheduled' : 'cancelled' })}>{cur.status === 'cancelled' ? 'Restore event' : 'Cancel event'}</button>
            {dirty && <button className="small ghost" onClick={() => setDraft({})}>Discard</button>}
            <button className="small human-btn" disabled={!dirty || busy} onClick={save}>{busy ? 'Usher is working…' : 'Save and let Usher plan'}</button>
          </div>
          {result && <p className="evd-result">{result}</p>}
        </div>
      </div>
    </section>
  );
}
