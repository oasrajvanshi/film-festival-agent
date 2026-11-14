'use client';

import { useState } from 'react';
import { useAgent } from './ui/useAgent';
import { Approvals, Ask, Briefs, Data, Evaluation, Feeds, Grid, Log, Overview, Scan } from './ui/panels';
import type { DayNumber } from '../src/core/types';

const TABS = ['Overview', 'Schedule grid', 'Approvals', 'Door scan', 'Volunteer briefs', 'Ask', 'Feeds & voting', 'Log', 'Evaluation', 'Data'] as const;
type Tab = typeof TABS[number];

export default function Dashboard() {
  const s = useAgent();
  const [tab, setTab] = useState<Tab>('Overview');
  const [user, setUser] = useState('Operations lead');
  const [armed, setArmed] = useState(false);
  const f = s.agent.f;
  const pending = s.agent.queue.filter(q => q.status === 'pending').length;
  const day = Number(Object.entries(f.dates).find(([, d]) => s.clock.startsWith(d))?.[0] ?? 1) as DayNumber;
  const props = { s, user };

  return (
    <>
      <header className="top">
        <div>
          <h1>{f.name} · Festival Agent</h1>
          <div className="sub">Management dashboard · prototype with made-up people</div>
        </div>
        <div className="controls">
          <label className="row">Festival clock
            <select value={day} onChange={e => s.setClock(`${f.dates[+e.target.value as DayNumber]}T${s.clock.slice(11)}`)}>
              {([1, 2, 3] as DayNumber[]).map(d => <option key={d} value={d}>Day {d}</option>)}
            </select>
            <input type="time" value={s.clock.slice(11)} onChange={e => e.target.value && s.setClock(`${s.clock.slice(0, 11)}${e.target.value}`)} />
          </label>
          <label className="row">Acting as <input value={user} onChange={e => setUser(e.target.value)} style={{ width: 140 }} /></label>
          <label className="row" title={s.llmInfo.available ? `Model: ${s.llmInfo.model}` : 'Set GROQ_API_KEY or OLLAMA_API_KEY on the server to enable'}>
            <input type="checkbox" disabled={!s.llmInfo.available} checked={s.useModel} onChange={e => s.setUseModel(e.target.checked)} />
            Use model {s.llmInfo.available ? `(${s.llmInfo.model})` : '(not configured)'}
          </label>
          <button className="small" onClick={() => { if (armed) { s.reset(); setArmed(false); } else { setArmed(true); setTimeout(() => setArmed(false), 4000); } }}>{armed ? 'Click again to reset' : 'Reset demo'}</button>
        </div>
      </header>
      <nav className="tabs">
        {TABS.map(t => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t}{t === 'Approvals' && pending > 0 && <span className="badge">{pending}</span>}
            {t === 'Overview' && s.agent.flags.length > 0 && <span className="badge">{s.agent.flags.length}</span>}
          </button>
        ))}
      </nav>
      <main className="wrap" key={s.version >= 1 ? 'ready' : 'boot'}>
        {tab === 'Overview' && <Overview {...props} />}
        {tab === 'Schedule grid' && <Grid {...props} />}
        {tab === 'Approvals' && <Approvals {...props} />}
        {tab === 'Door scan' && <Scan {...props} />}
        {tab === 'Volunteer briefs' && <Briefs {...props} />}
        {tab === 'Ask' && <Ask {...props} />}
        {tab === 'Feeds & voting' && <Feeds {...props} />}
        {tab === 'Log' && <Log {...props} />}
        {tab === 'Evaluation' && <Evaluation {...props} />}
        {tab === 'Data' && <Data {...props} />}
      </main>
    </>
  );
}

