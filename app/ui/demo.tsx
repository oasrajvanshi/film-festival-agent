'use client';
// Demo-day toolbar, shown only with ?demo=1 (and remembered on this device
// until ?demo=0). It switches between the desktop view and a phone frame, and
// between the five profiles, by viewing the festival as a sample person of
// each kind. Real users never see it.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { directory, type ProfileKind, type Who } from '../../src/access/profiles';
import type { Festival } from '../../src/core/types';
import '../demo.css';

const KEY = 'usher-demo';
const KINDS: { kind: ProfileKind; label: string }[] = [
  { kind: 'organizer', label: 'Organizer' }, { kind: 'staff', label: 'Staff' }, { kind: 'guest', label: 'Guest' },
  { kind: 'attendee', label: 'Attendee' }, { kind: 'vendor', label: 'Vendor' },
];

export interface Demo { on: boolean; framed: boolean; kind: ProfileKind; setKind: (k: ProfileKind) => void; phone: boolean; setPhone: (p: boolean) => void }

export function useDemo(): Demo {
  const [st, setSt] = useState({ on: false, framed: false, kind: 'organizer' as ProfileKind, phone: false });
  useEffect(() => {
    const u = new URL(location.href);
    const q = u.searchParams.get('demo');
    try { if (q === '1') localStorage.setItem(KEY, '1'); if (q === '0') localStorage.removeItem(KEY); } catch { /* private mode */ }
    let on = q === '1';
    try { on = on || localStorage.getItem(KEY) === '1'; } catch { /* ignore */ }
    const framed = u.searchParams.get('demoframe') === '1';
    const as = u.searchParams.get('as') as ProfileKind | null;
    let phone = false;
    try { phone = sessionStorage.getItem(`${KEY}-phone`) === '1'; } catch { /* ignore */ }
    if (on || framed) document.documentElement.classList.add('demo-mode');
    setSt({ on: on && !framed, framed, kind: as && KINDS.some(k => k.kind === as) ? as : 'organizer', phone });
  }, []);
  // The phone frame asks the toolbar to go back to the organizer view.
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.usherDemo) setSt(x => ({ ...x, kind: e.data.usherDemo })); };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  const setKind = useCallback((kind: ProfileKind) => setSt(x => ({ ...x, kind })), []);
  const setPhone = useCallback((phone: boolean) => { try { sessionStorage.setItem(`${KEY}-phone`, phone ? '1' : '0'); } catch { /* ignore */ } setSt(x => ({ ...x, phone })); }, []);
  return { ...st, setKind, setPhone };
}

/** A sample person to show for each profile; the well-known demo people first. */
export function demoPerson(f: Festival, kind: ProfileKind, clock: string): Who | null {
  if (kind === 'organizer') return null;
  const all = directory(f).filter(w => w.kind === kind);
  const known = ['Yara Jessop', 'Tova Jessop', 'Bright Booth AV'];
  const pick = all.find(w => known.includes(w.name))
    ?? (kind === 'guest' ? all.find(w => f.events.some(e => e.guestIds.includes(w.id) && e.start.slice(0, 10) === clock.slice(0, 10))) : undefined)
    ?? all[0];
  return pick ? { ...pick, code: '' } : null;
}

/** Leave a sample profile and go back to the organizer view. */
export function backToOrganizer(demo: Demo | null) {
  if (demo?.on) demo.setKind('organizer');
  else if (window.parent !== window) window.parent.postMessage({ usherDemo: 'organizer' }, location.origin);
}

export function DemoShell({ demo, signedIn = true, children }: { demo: Demo; signedIn?: boolean; children: ReactNode }) {
  const src = `/app?demoframe=1&as=${demo.kind}`;
  // Only the organizer has a desktop view; everyone else is always on a phone.
  const phone = demo.phone || demo.kind !== 'organizer';
  return (
    <div className={`demo ${phone ? 'demo-phone' : ''}`}>
      <div className="demo-bar" role="toolbar" aria-label="Demo controls">
        <span className="demo-tag">Demo</span>
        <div className="demo-seg" aria-label="View">
          <button className={!phone ? 'on' : ''} disabled={demo.kind !== 'organizer'} onClick={() => demo.setPhone(false)}>Desktop</button>
          <button className={phone ? 'on' : ''} onClick={() => demo.setPhone(true)}>Phone</button>
        </div>
        <div className="demo-seg demo-who" aria-label="Profile">
          {KINDS.map(k => <button key={k.kind} className={demo.kind === k.kind ? 'on' : ''} disabled={!signedIn && k.kind !== 'organizer'} onClick={() => demo.setKind(k.kind)}>{k.label}</button>)}
        </div>
        {!signedIn && <span className="demo-hint">Sign in as organizer to switch profiles</span>}
      </div>
      {phone
        ? <div className="demo-stage"><div className="demo-device"><iframe key={src} src={src} title={`Usher on a phone, ${demo.kind}`} /></div></div>
        : <div className="demo-body">{children}</div>}
    </div>
  );
}
