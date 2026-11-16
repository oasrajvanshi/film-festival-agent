'use client';
// Day check-in: scanning people in at venue entrances, and the organizers'
// live "Who's here" list. Each day's expected list comes from the schedule,
// passes, shifts and deliveries Usher already has; scans fill in the rest.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AgentStore } from './useAgent';
import { Icon } from './icons';
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
        <p className="muted" style={{ margin: 0 }}>Scan anyone&apos;s QR as they arrive: attendees, guests, staff and vendors. The first scan today records them as here.</p>
        <label className="field">Entrance
          <select value={venueId} onChange={e => setVenueId(e.target.value)}>
            {f.venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        {cam && state !== 'none'
          ? <><video ref={video} muted playsInline style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }} /><button className="small" onClick={() => setCam(false)}>Stop camera</button></>
          : <button onClick={() => setCam(true)}><Icon name="scan" size={16} /> Scan with camera</button>}
        {state === 'none' && <div className="muted">This browser can&apos;t read QR codes with the camera. Type the code printed under the QR instead.</div>}
        <label className="field">Or type the code under the QR
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
        ) : <p className="muted">Green means they&apos;re in and recorded. Guests and vendors get a welcome note with what they have next. Everything is checked on the festival&apos;s server, so this phone never holds anyone else&apos;s details.</p>}
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
export function WhosHere({ s }: { s: AgentStore }) {
  const f = s.agent.f;
  const days = festivalDays(f);
  const today = dayAt(f, s.clock) ?? days[0];
  const [day, setDay] = useState<DayNumber>(today);
  const [kind, setKind] = useState<PresenceKind | 'all' | 'missing'>('all');
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  useEffect(() => setDay(today), [today]);
  const rows = useMemo(() => roster(f, day), [f, day, s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = s.clock;
  const isToday = day === dayAt(f, now);
  const late = (r: RosterRow) => isToday && !r.arrival && r.kind === 'guest' && !!r.firstAt && r.firstAt.slice(0, 16) <= addMin(now, 45);
  const shown = rows
    .filter(r => kind === 'all' ? true : kind === 'missing' ? !r.arrival : r.kind === kind)
    .filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(late(b)) - Number(late(a)) || Number(!!a.arrival) - Number(!!b.arrival) || (a.firstAt ?? '9').localeCompare(b.firstAt ?? '9'));
  const by = (k: PresenceKind) => { const all = rows.filter(r => r.kind === k); return { here: all.filter(r => r.arrival).length, all: all.length }; };
  const here = rows.filter(r => r.arrival).length;
  const download = () => {
    const blob = new Blob([rosterCsv(f, day)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${f.name.replace(/\W+/g, '-')}-day-${day}-arrivals.csv`; a.click();
  };
  const venueName = (id?: string) => f.venues.find(v => v.id === id)?.name ?? '';
  return (
    <div className="stack">
      <div className="row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="seg" aria-label="Day">
          {days.map(d => <button key={d} className={d === day ? 'on' : ''} onClick={() => setDay(d)}>Day {d}</button>)}
        </div>
        <span className="muted">{here} of {rows.filter(r => !r.walkIn).length} expected are here{rows.some(r => r.walkIn) ? `, plus ${rows.filter(r => r.walkIn).length} not on the list` : ''}.</span>
        <span style={{ flex: 1 }} />
        <button className="small" onClick={() => setScan(x => !x)}><Icon name="scan" size={16} /> {scan ? 'Hide scanner' : 'Scan people in'}</button>
        <button className="small" onClick={download}>Download list</button>
      </div>
      {scan && <ArrivalScan s={s} />}
      <div className="stats">
        {(['guest', 'vendor', 'staff', 'attendee'] as PresenceKind[]).map(k => {
          const c = by(k);
          return (
            <button key={k} className={`stat ${kind === k ? 'hot' : ''}`} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setKind(kind === k ? 'all' : k)}>
              <div className="k">{KIND_LABEL[k]}</div>
              <div className="v">{c.here}<span className="muted" style={{ fontSize: 16 }}> / {c.all}</span></div>
            </button>
          );
        })}
      </div>
      <div className="card stack">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>{kind === 'all' ? 'Everyone today' : kind === 'missing' ? 'Not here yet' : KIND_LABEL[kind]}</h2>
          <span style={{ flex: 1 }} />
          <button className={`small ${kind === 'missing' ? 'primary' : ''}`} onClick={() => setKind(kind === 'missing' ? 'all' : 'missing')}>Not here yet</button>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a name" style={{ maxWidth: 200 }} />
        </div>
        {!shown.length && <p className="muted">{rows.length ? 'Nobody matches.' : 'Nobody is expected on this day.'}</p>}
        <div className="stack" style={{ gap: 0 }}>
          {shown.slice(0, 200).map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div><b>{r.name}</b> <span className="muted" style={{ fontSize: 12 }}>{KIND_LABEL[r.kind].replace(/s$/, '')}</span></div>
                <div className="muted" style={{ fontSize: 13 }}>{r.why}</div>
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
