'use client';

import { useEffect, useRef, useState } from 'react';
import { readSetup, useAgent, writeSetup, writeWho } from '../ui/useAgent';
import { clearFestivalLocal } from '../ui/localkeys';
import { Approvals, Ask, Briefs, Data, Feeds, Log, Overview, Scan } from '../ui/panels';
import { DemoShell, backToOrganizer, demoPerson, useDemo, type Demo } from '../ui/demo';
import { Icon } from '../ui/icons';
import '../mobile.css';
import '../light.css';
import '../live.css';
import { AccessCodes, Feedback, PersonalApp, SignIn } from '../ui/profiles';
import { ScanDesk } from '../ui/presence';
import { directory, type Who } from '../../src/access/profiles';
import { useTheme } from '../ui/live';
import { PhoneFrame, inFrame, isWide, readDevice, toParent, writeDevice, type Device } from '../ui/phoneframe';
import type { DayNumber } from '../../src/core/types';
import { festivalDays } from '../../src/core/types';

const PAGES = [
  { id: 'today', label: 'Overview', icon: 'home', group: 'Festival day' },
  { id: 'approvals', label: 'Approvals', icon: 'inbox', group: 'Festival day' },
  { id: 'log', label: 'Log', icon: 'list', group: 'Festival day' },
  { id: 'ask', label: 'Ask', icon: 'chat', group: 'Festival day' },
  { id: 'briefs', label: 'Volunteer briefs', icon: 'users', group: 'Team' },
  { id: 'feeds', label: 'Live feeds', icon: 'bolt', group: 'Team' },
  { id: 'codes', label: 'Access codes', icon: 'key', group: 'Team' },
  // Reached from Overview or Settings, not the menu.
  { id: 'scan', label: 'Scan in', icon: 'scan', group: '' },
  { id: 'data', label: 'Data', icon: 'sheet', group: '' },
  { id: 'feedback', label: 'Feedback', icon: 'chat', group: '' },
] as const;
type PageId = typeof PAGES[number]['id'];
const BOTTOM: PageId[] = ['today', 'approvals', 'log'];

export default function App() {
  const demo = useDemo();
  if (demo.on) return <DemoShell demo={demo}><AppInner demo={demo} /></DemoShell>;
  return <AppInner demo={demo.framed ? demo : null} />;
}

function AppInner({ demo }: { demo: Demo | null }) {
  const s = useAgent();
  const [page, setPageState] = useState<PageId>('today');
  const [user, setUser] = useState('Operations lead');
  const [sheet, setSheet] = useState<null | 'settings' | 'more'>(null);
  const [armed, setArmed] = useState(false);
  const who = s.who;
  const ready = s.mode !== 'loading';
  const [viewAs, setViewAs] = useState<Who | null>(null);
  const f = s.agent.f;
  // Phones for everyone; the organizer may also use a computer.
  const [framed, setFramed] = useState(false);
  const [wide, setWide] = useState(false);
  const [device, setDeviceState] = useState<Device>('desktop');
  const [viewasId, setViewasId] = useState<string | null>(null);
  // Light or dark, remembered on this device (the organizer's tool only; people's phone apps stay dark).
  const [theme, setTheme] = useTheme();
  useEffect(() => {
    document.documentElement.classList.toggle('org-light', theme === 'light');
    return () => document.documentElement.classList.remove('org-light');
  }, [theme]);
  useEffect(() => {
    setFramed(inFrame()); setDeviceState(readDevice());
    setViewasId(new URLSearchParams(location.search).get('viewas'));
    const r = () => setWide(isWide()); r();
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const setDevice = (d: Device) => { writeDevice(d); setDeviceState(d); };
  const pending = s.agent.queue.filter(q => q.status === 'pending').length;
  const flags = s.agent.flags.length;
  const day = Number(Object.entries(f.dates).find(([, d]) => s.clock.startsWith(d))?.[0] ?? 1) as DayNumber;
  const current = PAGES.find(p => p.id === page)!;
  const [alerts, setAlerts] = useState<'unsupported' | 'default' | 'granted' | 'denied'>('default');
  const seen = useRef<{ pending: number; flags: number } | null>(null);

  // Organizer alerts on this phone or laptop: a notification whenever something
  // new needs approval or a new flag appears, even if the app is in the background.
  useEffect(() => {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) { setAlerts('unsupported'); return; }
    setAlerts(Notification.permission as 'default' | 'granted' | 'denied');
  }, []);
  useEffect(() => {
    const prev = seen.current;
    seen.current = { pending, flags };
    if (!prev || alerts !== 'granted') return;
    const notes: [string, string, string][] = [];
    if (pending > prev.pending) {
      const q = s.agent.queue.filter(x => x.status === 'pending').at(-1);
      notes.push([`${pending - prev.pending} new update${pending - prev.pending > 1 ? 's' : ''} to approve`, q?.action.title ?? '', '/app#approvals']);
    }
    if (flags > prev.flags) notes.push(['Needs attention', s.agent.flags.at(-1)?.title ?? '', '/app#approvals']);
    for (const [title, body, url] of notes) {
      navigator.serviceWorker.ready.then(r => r.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', tag: url, data: { url } })).catch(() => {});
    }
  }, [pending, flags, alerts, s.agent]);
  const enableAlerts = async () => {
    const r = await Notification.requestPermission();
    setAlerts(r as 'default' | 'granted' | 'denied');
    if (r !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    // Shared mode: subscribe this device to server push, so alerts arrive even when Usher is closed.
    if (s.shared && 'PushManager' in window) {
      try {
        const k = await s.call<{ publicKey: string }>('vapid', {}, 'GET');
        const raw = atob(k.body.publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - k.body.publicKey.length % 4) % 4));
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
        await s.call('push-subscribe', { sub: sub.toJSON() });
        await s.call('push-test');
        return;
      } catch { /* fall back to a local notification */ }
    }
    reg.showNotification('Alerts are on', { body: 'You will hear about new approvals and flags on this device.', icon: '/icon-192.png', data: { url: '/app#approvals' } });
  };

  const setPage = (p: PageId) => {
    setPageState(p); setSheet(null);
    try { history.replaceState(null, '', `#${p}`); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (!ready) return;
    if (s.shared ? !s.fid : !readSetup()) { location.replace('/onboarding'); return; }
  }, [ready, s.shared, s.fid]);
  // The organizer's name as the festival has it now (a saved sign-in may predate a renamed demo).
  useEffect(() => { if (who?.kind === 'organizer') setUser(f.people.find(p => p.id === who.id)?.name ?? who.name); }, [who, f]);
  useEffect(() => {
    const fromHash = () => { const h = location.hash.slice(1); if (PAGES.some(p => p.id === h)) setPageState(h as PageId); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const countFor = (id: PageId) => (id === 'approvals' ? pending + flags : 0);
  const props = { s, user, go: setPage };
  const groups = [...new Set(PAGES.map(p => p.group))].filter(Boolean);

  const settings = (
    <>
      <div className="field">Festival day
        <div className="row">
          {festivalDays(f).map(d => (
            <button key={d} className={d === day ? 'primary small' : 'small'} onClick={() => s.setClock(`${f.dates[d]}T${s.clock.slice(11)}`)}>Day {d}</button>
          ))}
        </div>
      </div>
      <label className="field">Festival clock
        <input type="time" value={s.clock.slice(11)} onChange={e => e.target.value && s.setClock(`${s.clock.slice(0, 11)}${e.target.value}`)} />
      </label>
      <div className="field">Alerts on this device
        {alerts === 'granted' ? <span className="muted">On. New approvals and flags show as notifications.</span>
          : alerts === 'denied' ? <span className="muted">Blocked in this browser's settings.</span>
          : alerts === 'unsupported' ? <span className="muted">Not available here. On iPhone, add the app to your Home Screen first.</span>
          : <button className="small primary" onClick={enableAlerts}><Icon name="bolt" size={14} /> Turn on alerts</button>}
      </div>
      <div className="field">More
        <div className="row">
          {(['data', 'feedback'] as PageId[]).map(id => <button key={id} className="small" onClick={() => setPage(id)}>{PAGES.find(p => p.id === id)!.label}</button>)}
        </div>
      </div>
      <button className="block" onClick={signOut}><Icon name="logout" size={16} /> Sign out</button>
      <button className="block" style={{ marginTop: 8 }} onClick={async () => { if (armed) { setArmed(false); setSheet(null); await s.reset(); clearFestivalLocal(); location.reload(); } else { setArmed(true); setTimeout(() => setArmed(false), 4000); } }}>
        {armed ? 'Tap again to reset everything' : 'Reset demo'}
      </button>
      <button className="block" style={{ marginTop: 8 }} onClick={() => { writeSetup(null); writeWho(null); clearFestivalLocal(); try { localStorage.removeItem('ffa-fid-v1'); } catch { /* ignore */ } location.href = '/onboarding'; }}>Set up a new festival</button>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Test mode: messages go only to the team’s own inbox.</p>
    </>
  );

  function signOut() { s.signOut(); setViewAs(null); setSheet(null); window.scrollTo({ top: 0 }); }
  if (!ready) return null;
  if (!who) return <SignIn s={s} onIn={w => { if (w.kind === 'organizer') setUser(w.name); }} />;
  if (who.kind !== 'organizer') {
    if (!framed && wide) return <PhoneFrame src="/app?inframe=1" title={`Usher for ${who.name}`} onMessage={m => { if (m.signedOut) location.reload(); }} />;
    return <PersonalApp s={s} who={who} onOut={() => { signOut(); if (framed) toParent({ signedOut: 1 }); }} />;
  }
  const demoWho = demo && demo.kind !== 'organizer' ? demoPerson(f, demo.kind, s.clock) : null;
  if (demoWho) return <PersonalApp key={demoWho.id} s={s} who={demoWho} viewAs onOut={() => backToOrganizer(demo)} />;
  // The organizer viewing as someone: inside the frame, show that person.
  const asWho = framed && viewasId ? directory(f).find(w => w.id === viewasId) : null;
  if (asWho) return <PersonalApp s={s} who={{ ...asWho, code: '' }} viewAs onOut={() => toParent({ back: 1 })} />;
  if (viewAs) {
    if (!framed && wide) return <PhoneFrame src={`/app?inframe=1&viewas=${encodeURIComponent(viewAs.id)}`} title={`Viewing as ${viewAs.name}`} onMessage={m => { if (m.back) { setViewAs(null); location.reload(); } }} />;
    return <PersonalApp s={s} who={viewAs} viewAs onOut={() => { setViewAs(null); window.scrollTo({ top: 0 }); }} />;
  }
  if (!framed && wide && device === 'phone') return <PhoneFrame organizer src="/app?inframe=1" title="Usher for the organizer" onDevice={d => { setDevice(d); location.reload(); }} />;

  const shellEl = (
    <div className={`shell${theme === 'light' ? ' light' : ''}`}>
      <aside className="side">
        <div className="brand">
          <div className="brand-mark"><Icon name="film" /></div>
          <div><div className="brand-name">Usher</div></div>
        </div>
        {groups.map(g => (
          <nav className="nav-group" key={g}>
            <div className="nav-label">{g}</div>
            {PAGES.filter(p => p.group === g).map(p => (
              <button key={p.id} className={`nav-item ${p.id === page ? 'on' : ''}`} onClick={() => setPage(p.id)}>
                <Icon name={p.icon} />{p.label}{countFor(p.id) > 0 && <span className="count">{countFor(p.id)}</span>}
              </button>
            ))}
          </nav>
        ))}
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{current.label}</h1>
          <div className="spacer" />
          <button className="ghost small theme-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title={theme === 'light' ? 'Dark mode' : 'Light mode'} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} /> {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          <button className="ghost small" onClick={() => setDevice('phone')} title="See the organizer app on a phone"><Icon name="home" size={15} /> Phone view</button>
          <button className="ghost" onClick={() => setSheet('settings')} title="Settings">
            <span className={`model-dot ${s.useModel && s.llmInfo.available ? 'on' : ''}`} /> {user} <Icon name="gear" size={16} />
          </button>
        </header>

        <header className="mobile-head">
          <div className="brand-mark"><Icon name="film" size={16} /></div>
          <h1>{current.label}</h1>
          <button className="ghost small" aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button>
          <button className="ghost small" aria-label="Settings" onClick={() => setSheet('settings')}><Icon name="gear" /></button>
        </header>

        {s.notice && <div className="issues" role="status" style={{ margin: '8px 16px 0' }}>{s.notice}</div>}
        <main className="wrap" key={s.version >= 1 ? 'ready' : 'boot'}>
          {page === 'today' && <Overview {...props} />}
          {page === 'approvals' && <Approvals {...props} />}
          {page === 'scan' && <ScanDesk s={s} event={<Scan {...props} />} />}
          {page === 'briefs' && <Briefs {...props} />}
          {page === 'ask' && <Ask {...props} />}
          {page === 'feeds' && <Feeds {...props} />}
          {page === 'log' && <Log {...props} />}
          {page === 'data' && <Data {...props} />}
          {page === 'feedback' && <Feedback s={s} />}
          {page === 'codes' && <AccessCodes s={s} onViewAs={w => { setViewAs(w); window.scrollTo({ top: 0 }); }} />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {BOTTOM.map(id => {
          const p = PAGES.find(x => x.id === id)!;
          return (
            <button key={id} className={page === id ? 'on' : ''} onClick={() => setPage(id)}>
              <Icon name={p.icon} size={22} />{p.label}
              {countFor(id) > 0 && <span className="badge">{countFor(id)}</span>}
            </button>
          );
        })}
        <button className={!BOTTOM.includes(page) ? 'on' : ''} onClick={() => setSheet('more')}><Icon name="more" size={22} />More</button>
      </nav>

      {sheet && <>
        <div className="sheet-backdrop" onClick={() => setSheet(null)} />
        <div className="sheet" role="dialog" aria-label={sheet === 'more' ? 'More' : 'Settings'}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{sheet === 'more' ? 'More' : 'Settings'}</h2>
            <button className="ghost small" aria-label="Close" onClick={() => setSheet(null)}><Icon name="x" /></button>
          </div>
          {sheet === 'more' && (
            <div className="more-grid">
              {PAGES.filter(p => p.group && !BOTTOM.includes(p.id)).map(p => (
                <button key={p.id} onClick={() => setPage(p.id)}><Icon name={p.icon} size={22} />{p.label}</button>
              ))}
            </div>
          )}
          {settings}
        </div>
      </>}
    </div>
  );
  return shellEl;
}
