'use client';

import { useEffect, useState } from 'react';
import { useAgent } from './ui/useAgent';
import { Approvals, Ask, Briefs, Data, Evaluation, Feeds, Grid, Log, Overview, Scan } from './ui/panels';
import { Icon } from './ui/icons';
import type { DayNumber } from '../src/core/types';

const PAGES = [
  { id: 'today', label: 'Today', icon: 'home', group: 'Festival day' },
  { id: 'approvals', label: 'Approvals', icon: 'inbox', group: 'Festival day' },
  { id: 'scan', label: 'Door scan', icon: 'scan', group: 'Festival day' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar', group: 'Festival day' },
  { id: 'ask', label: 'Ask', icon: 'chat', group: 'Festival day' },
  { id: 'briefs', label: 'Volunteer briefs', icon: 'users', group: 'Teams' },
  { id: 'feeds', label: 'Feeds & voting', icon: 'bolt', group: 'Teams' },
  { id: 'log', label: 'Log', icon: 'list', group: 'Behind the scenes' },
  { id: 'eval', label: 'Evaluation', icon: 'chart', group: 'Behind the scenes' },
  { id: 'data', label: 'Data', icon: 'sheet', group: 'Behind the scenes' },
] as const;
type PageId = typeof PAGES[number]['id'];
const BOTTOM: PageId[] = ['today', 'approvals', 'scan', 'schedule'];

export default function App() {
  const s = useAgent();
  const [page, setPageState] = useState<PageId>('today');
  const [user, setUser] = useState('Operations lead');
  const [sheet, setSheet] = useState<null | 'settings' | 'more'>(null);
  const [armed, setArmed] = useState(false);
  const f = s.agent.f;
  const pending = s.agent.queue.filter(q => q.status === 'pending').length;
  const flags = s.agent.flags.length;
  const day = Number(Object.entries(f.dates).find(([, d]) => s.clock.startsWith(d))?.[0] ?? 1) as DayNumber;
  const current = PAGES.find(p => p.id === page)!;

  const setPage = (p: PageId) => {
    setPageState(p); setSheet(null);
    try { history.replaceState(null, '', `#${p}`); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const fromHash = () => { const h = location.hash.slice(1); if (PAGES.some(p => p.id === h)) setPageState(h as PageId); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const countFor = (id: PageId) => (id === 'approvals' ? pending : id === 'today' ? flags : 0);
  const props = { s, user, go: setPage };
  const groups = [...new Set(PAGES.map(p => p.group))];

  const settings = (
    <>
      <div className="field">Festival day
        <div className="row">
          {([1, 2, 3] as DayNumber[]).map(d => (
            <button key={d} className={d === day ? 'primary small' : 'small'} onClick={() => s.setClock(`${f.dates[d]}T${s.clock.slice(11)}`)}>Day {d}</button>
          ))}
        </div>
      </div>
      <label className="field">Festival clock
        <input type="time" value={s.clock.slice(11)} onChange={e => e.target.value && s.setClock(`${s.clock.slice(0, 11)}${e.target.value}`)} />
      </label>
      <label className="field">Acting as
        <input value={user} onChange={e => setUser(e.target.value)} />
      </label>
      <label className="field" title={s.llmInfo.available ? '' : 'Set GROQ_API_KEY or OLLAMA_API_KEY on the server to enable'}>Language model
        <span className="row">
          <input type="checkbox" disabled={!s.llmInfo.available} checked={s.useModel} onChange={e => s.setUseModel(e.target.checked)} />
          {s.llmInfo.available ? <>Use {s.llmInfo.model}</> : 'Not configured'}
        </span>
      </label>
      <button className="block" onClick={() => { if (armed) { s.reset(); setArmed(false); setSheet(null); } else { setArmed(true); setTimeout(() => setArmed(false), 4000); } }}>
        {armed ? 'Tap again to reset everything' : 'Reset demo'}
      </button>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Prototype with made-up people. Nothing is sent outside this app.</p>
    </>
  );

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark"><Icon name="film" /></div>
          <div><div className="brand-name">{f.name}</div><div className="brand-sub">Festival Agent</div></div>
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
        <div className="side-foot">Group Blue prototype · made-up data</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{current.label}</h1>
          <div className="spacer" />
          <span className="clock-pill">
            <Icon name="clock" size={16} />
            <select aria-label="Festival day" value={day} onChange={e => s.setClock(`${f.dates[+e.target.value as DayNumber]}T${s.clock.slice(11)}`)}>
              {([1, 2, 3] as DayNumber[]).map(d => <option key={d} value={d}>Day {d} · {f.dates[d].slice(5)}</option>)}
            </select>
            <input aria-label="Festival time" type="time" value={s.clock.slice(11)} onChange={e => e.target.value && s.setClock(`${s.clock.slice(0, 11)}${e.target.value}`)} />
          </span>
          <button className="ghost" onClick={() => setSheet('settings')} title="Settings">
            <span className={`model-dot ${s.useModel && s.llmInfo.available ? 'on' : ''}`} /> {user} <Icon name="gear" size={16} />
          </button>
        </header>

        <header className="mobile-head">
          <div className="brand-mark"><Icon name="film" size={16} /></div>
          <h1>{current.label}</h1>
          <span className="chip">Day {day} · {s.clock.slice(11)}</span>
          <button className="ghost small" aria-label="Settings" onClick={() => setSheet('settings')}><Icon name="gear" /></button>
        </header>

        <main className="wrap" key={s.version >= 1 ? 'ready' : 'boot'}>
          {page === 'today' && <Overview {...props} />}
          {page === 'schedule' && <Grid {...props} />}
          {page === 'approvals' && <Approvals {...props} />}
          {page === 'scan' && <Scan {...props} />}
          {page === 'briefs' && <Briefs {...props} />}
          {page === 'ask' && <Ask {...props} />}
          {page === 'feeds' && <Feeds {...props} />}
          {page === 'log' && <Log {...props} />}
          {page === 'eval' && <Evaluation {...props} />}
          {page === 'data' && <Data {...props} />}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {BOTTOM.map(id => {
          const p = PAGES.find(x => x.id === id)!;
          return (
            <button key={id} className={page === id ? 'on' : ''} onClick={() => setPage(id)}>
              <Icon name={p.icon} size={22} />{p.id === 'scan' ? 'Scan' : p.label}
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
              {PAGES.filter(p => !BOTTOM.includes(p.id)).map(p => (
                <button key={p.id} onClick={() => setPage(p.id)}><Icon name={p.icon} size={22} />{p.label}</button>
              ))}
            </div>
          )}
          {settings}
        </div>
      </>}
    </div>
  );
}
