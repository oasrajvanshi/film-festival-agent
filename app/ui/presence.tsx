'use client';
// Day check-in: scanning people in at venue entrances, and the organizers'
// live "Who's here" list. Each day's expected list comes from the schedule,
// passes, shifts and deliveries Usher already has; scans fill in the rest.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AgentStore } from './useAgent';
import { Icon } from './icons';
import { VenueBuildings, venueCounts } from './venues';
import { useLateGuests } from './weatherplan';
import { clock as fmt } from '../../src/core/time';
import { festivalDays, type DayNumber } from '../../src/core/types';
import { dayAt, roster, rosterCsv, type ArrivalResult, type PresenceKind, type RosterRow } from '../../src/agent/presence';
import type { Who } from '../../src/access/profiles';

const KIND_LABEL: Record<PresenceKind, string> = { guest: 'Guests', vendor: 'Vendors', staff: 'Staff', organizer: 'Organizers', attendee: 'Attendees' };

/** Read QR codes from the camera where the browser can; calls onCode for each new one. */
function useQrCamera(on: boolean, onCode: (v: string) => void) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'idle' | 'live' | 'none'>('idle');
  const cb = useRef(onCode); cb.current = onCode;
  useEffect(() => {
    if (!on) { setState('idle'); return; }
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD) { setState('none'); return; }
    let stream: MediaStream | null = null; let stop = false; let last = ''; let lastAt = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream; await video.current.play(); setState('live');
        const det = new BD({ formats: ['qr_code'] });
        while (!stop) {
          const v = (await det.detect(video.current).catch(() => []))[0]?.rawValue;
          // The same code held in front of the camera counts once every few seconds.
          if (v && (v !== last || Date.now() - lastAt > 4000)) { last = v; lastAt = Date.now(); await cb.current(v); }
          await new Promise(r => setTimeout(r, 300));
        }
      } catch { setState('none'); }
    })();
    return () => { stop = true; stream?.getTracks().forEach(t => t.stop()); };
  }, [on]);
  return { video, state };
}

/** Scan people in at a venue entrance. */
export function ArrivalScan({ s, compact }: { s: AgentStore; compact?: boolean }) {
  const f = s.agent.f;
  const me = s.who?.id;
  // Default to the venue of my shift today, else the first venue.
  const myVenue = f.shifts.find(x => x.personId === me && x.start.slice(0, 10) === s.clock.slice(0, 10))?.venueId;
  const [venueId, setVenueId] = useState(myVenue ?? f.venues[0]?.id ?? '');
  const [qr, setQr] = useState('');
  const [res, setRes] = useState<ArrivalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(false);
  const [count, setCount] = useState(0);
  const check = async (code: string) => {
    if (!code.trim() || !venueId) return;
    setBusy(true);
    const r = await s.arrive(code.trim(), venueId);
    setRes(r); setBusy(false); setQr('');
    if (r.allowed && !r.reentry) setCount(c => c + 1);
  };
  const { video, state } = useQrCamera(cam, check);
  const venue = f.venues.find(v => v.id === venueId)?.name ?? '';
  return (
    <div className={compact ? 'stack' : 'grid2'}>
      <div className="card stack">
        <h2>Check people in</h2>
        <label className="field">Entrance
          <select value={venueId} onChange={e => setVenueId(e.target.value)}>
            {f.venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        {cam && state !== 'none'
          ? <><video ref={video} muted playsInline style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }} /><button className="small" onClick={() => setCam(false)}>Stop camera</button></>
          : <button onClick={() => setCam(true)}><Icon name="scan" size={16} /> Scan with camera</button>}
        {state === 'none' && <div className="muted">This browser can&apos;t read QR codes with the camera. Type the code printed under the QR instead.</div>}
        <label className="field">Or type the code
          <input value={qr} placeholder="e.g. USH1.p-012.ABC" onChange={e => setQr(e.target.value)} onKeyDown={e => e.key === 'Enter' && check(qr)} autoCapitalize="characters" />
        </label>
        <button className="primary" disabled={!qr.trim() || busy} onClick={() => check(qr)}>{busy ? 'Checking…' : 'Check in'}</button>
        {count > 0 && <div className="muted">{count} checked in at {venue} from this device.</div>}
      </div>
      <div className="card">
        {res ? (
          <div className={`scan ${res.allowed ? 'ok' : 'bad'}`}>
            {res.allowed ? (res.reentry ? 'BACK IN' : 'WELCOME') : 'STOP'}
            <div style={{ fontSize: 15, fontWeight: 400, marginTop: 10, letterSpacing: 0 }}>
              {res.personName && <b>{res.personName}</b>}{res.personName && ' · '}{res.reason}
              {res.allowed && res.next && <div style={{ marginTop: 8 }}>Next: {res.next}</div>}
            </div>
          </div>
        ) : <p className="muted">Scan a QR to check someone in.</p>}
      </div>
    </div>
  );
}

/** Staff scan tab: arrivals by default, event doors when needed. */
export function ScanDesk({ s, event }: { s: AgentStore; event: ReactNode }) {
  const [mode, setMode] = useState<'arrive' | 'event'>('arrive');
  return (
    <div className="stack">
      <div className="seg" role="tablist" aria-label="Scan mode">
        <button className={mode === 'arrive' ? 'on' : ''} onClick={() => setMode('arrive')}>Arrivals</button>
        <button className={mode === 'event' ? 'on' : ''} onClick={() => setMode('event')}>Event door</button>
      </div>
      {mode === 'arrive' ? <ArrivalScan s={s} /> : event}
    </div>
  );
}

/** A person's own check-in status, under their QR. */
export function MyArrival({ s, who }: { s: AgentStore; who: Who }) {
  const f = s.agent.f;
  const day = dayAt(f, s.clock);
  const mine = (f.arrivals ?? []).filter(a => a.personId === who.id && a.day === day && !a.reentry)[0];
  const venue = f.venues.find(v => v.id === mine?.venueId)?.name;
  return (
    <div className="card" style={{ marginTop: 14, textAlign: 'center' }}>
      {mine ? <><span className="chip ok">Checked in</span> <span className="muted">today at {fmt(mine.at)}, {venue}</span></>
        : <span className="muted">Not checked in today yet. Show this code at any venue entrance.</span>}
    </div>
  );
}

/** Organizers: who is expected today and who is actually here, live. */
export function WhosHere({ s, eventScan }: { s: AgentStore; eventScan?: ReactNode }) {
  const f = s.agent.f;
  const days = festivalDays(f);
  const today = dayAt(f, s.clock) ?? days[0];
  const [day, setDay] = useState<DayNumber>(today);
  const [kind, setKind] = useState<PresenceKind | 'all' | 'missing'>('all');
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  const [venue, setVenue] = useState<string | null>(null);
  useEffect(() => setDay(today), [today]);
  const rows = useMemo(() => roster(f, day), [f, day, s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = s.clock;
  const isToday = day === dayAt(f, now);
  const flaggedLate = useLateGuests(s);
  const late = (r: RosterRow) => (isToday && !r.arrival && r.kind === 'guest' && !!r.firstAt && r.firstAt.slice(0, 16) <= addMin(now, 45)) || (!r.arrival && flaggedLate.has(r.id));
  const shown = rows
    .filter(r => kind === 'all' ? true : kind === 'missing' ? !r.arrival : r.kind === kind)
    .filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()))
    .filter(r => !venue || r.firstVenueId === venue || r.arrival?.venueId === venue)
    .sort((a, b) => Number(late(b)) - Number(late(a)) || Number(!!a.arrival) - Number(!!b.arrival) || (a.firstAt ?? '9').localeCompare(b.firstAt ?? '9'));
  const by = (k: PresenceKind) => { const all = rows.filter(r => r.kind === k); return { here: all.filter(r => r.arrival).length, all: all.length }; };
  const here = rows.filter(r => r.arrival).length;
  const download = () => {
    const blob = new Blob([rosterCsv(f, day)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${f.name.replace(/\W+/g, '-')}-day-${day}-arrivals.csv`; a.click();
  };
  const venueName = (id?: string) => f.venues.find(v => v.id === id)?.name ?? '';
  const nowTitle = (vId: string) => {
    if (!isToday) return undefined;
    const t = now.slice(0, 16);
    const e = f.events.find(x => x.venueId === vId && x.status === 'scheduled' && addMin(x.start, -30) <= t && t < x.end.slice(0, 16));
    return e ? `Now: ${e.title}` : undefined;
  };
  const counts = venueCounts(f, rows, late, v => nowTitle(v.id));
  const lateCount = rows.filter(late).length;
  const chip = (k: PresenceKind | 'all' | 'missing', label: string, n?: string) => (
    <button key={k} className={`wh-chip${kind === k ? ' on' : ''}`} onClick={() => setKind(kind === k && k !== 'all' ? 'all' : k)}>{label}{n && <small>{n}</small>}</button>
  );
  return (
    <div className="wh">
      <div className="wh-top">
        <div className="cal-days" role="tablist" aria-label="Day">
          {days.map(d => <button key={d} role="tab" aria-selected={d === day} className={d === day ? 'on' : ''} onClick={() => setDay(d)}>Day {d}</button>)}
        </div>
        <span className="wh-sum"><b>{here}</b> of {rows.filter(r => !r.walkIn).length} here{lateCount ? <em> · {lateCount} guest{lateCount === 1 ? '' : 's'} running late</em> : null}</span>
        <span style={{ flex: 1 }} />
        <button className="small primary" onClick={() => setScan(x => !x)}><Icon name="scan" size={16} /> {scan ? 'Hide scanner' : 'Scan people in'}</button>
        <button className="small ghost" onClick={download}>Download list</button>
      </div>
      {scan && (eventScan ? <ScanDesk s={s} event={eventScan} /> : <ArrivalScan s={s} />)}

      <div className="card">
        <VenueBuildings counts={counts} picked={venue} onPick={setVenue} />
      </div>

      <div className="card">
        <div className="wh-filters">
          {chip('all', venue ? `At ${venueName(venue)}` : 'Everyone')}
          {(['guest', 'staff', 'vendor', 'attendee'] as PresenceKind[]).map(k => { const c = by(k); return chip(k, KIND_LABEL[k], `${c.here}/${c.all}`); })}
          {chip('missing', 'Not here yet')}
          <span style={{ flex: 1 }} />
          {venue && <button className="small ghost" onClick={() => setVenue(null)}><Icon name="x" size={14} /> All venues</button>}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a name" className="wh-find" />
        </div>
        {!shown.length && <p className="muted">{rows.length ? 'Nobody matches.' : 'Nobody is expected on this day.'}</p>}
        <div className="wh-list">
          {shown.slice(0, 200).map(r => (
            <div key={r.id} className={`wh-row${late(r) ? ' late' : ''}`}>
              <span className={`wh-av k-${r.kind}`}>{r.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
              <div className="wh-who">
                <b>{r.name}</b><small>{KIND_LABEL[r.kind].replace(/s$/, '')} · {r.why}</small>
              </div>
              {r.arrival
                ? <span className="chip ok" title={`Scanned by ${r.arrival.by}`}>Here {fmt(r.arrival.at)} · {venueName(r.arrival.venueId)}</span>
                : late(r) ? <span className="chip bad">Not here, on at {fmt(r.firstAt!)}</span>
                  : <span className="chip">{r.firstAt ? `Expected ${fmt(r.firstAt)}` : 'Expected'}</span>}
            </div>
          ))}
        </div>
        {shown.length > 200 && <p className="muted">Showing 200 of {shown.length}. Download the list for everyone.</p>}
      </div>
    </div>
  );
}

function addMin(iso: string, m: number) {
  const d = new Date(`${iso.slice(0, 16)}:00Z`); d.setUTCMinutes(d.getUTCMinutes() + m);
  return d.toISOString().slice(0, 16);
}
