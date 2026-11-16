'use client';
// Four versions of the landing page's "agent" section, side by side, so the
// team can pick one. Each shows what Usher actually does, with the mock
// festival's real case: snow on Thursday afternoon and Pavel Kettering late.

import '../../hl.css';
import '../../site.css';
import './options.css';
import { useEffect, useState, type ReactElement } from 'react';

const FEEDS = [
  { k: 'Weather', v: 'Snow 2:00 to 7:00 pm', ic: '❄' },
  { k: 'Flights', v: 'DL2207 landed 21 min late', ic: '✈' },
  { k: 'Shuttle', v: 'Harbor Loop 12 min late', ic: '◷' },
];
const OUTS = [
  { b: '3 screenings move to 3:15 pm', s: 'Late Country, Quiet Animals, Wild Tide' },
  { b: '21 attendees get their new time', s: 'Seats held, leave 15 min early' },
  { b: 'Yara Hollis opens Pavel’s panel', s: 'He joins at 4:20 pm' },
  { b: '3 door teams briefed', s: 'Hold doors until 3:20 pm' },
];

function useTick(ms: number, n: number) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(x => (x + 1) % n), ms); return () => clearInterval(t); }, [ms, n]);
  return i;
}

// ---------------------------------------------------------------- A. feeds in, specific results out
function A() {
  return (
    <div className="opt-a">
      <div className="opt-copy">
        <h2 className="s-h2">Usher keeps an eye on everything that could go wrong.</h2>
        <p className="s-lead">It follows the weather, flight arrivals and shuttle times all day. When one of them affects your programme, it shows you exactly what it touches.</p>
      </div>
      <div className="a-flow">
        <div className="a-col">
          {FEEDS.map(f => <div className="a-feed" key={f.k}><span className="a-ic">{f.ic}</span><span><b>{f.k}</b><small>{f.v}</small></span></div>)}
        </div>
        <div className="a-mid">
          <svg viewBox="0 0 200 300" aria-hidden="true">
            {[50, 150, 250].map(y => <path key={`i${y}`} className="a-wire" d={`M0 ${y} C 60 ${y}, 60 150, 100 150`} />)}
            {[38, 113, 188, 263].map(y => <path key={`o${y}`} className="a-wire out" d={`M100 150 C 140 150, 140 ${y}, 200 ${y}`} />)}
          </svg>
          <div className="a-node"><b>Usher</b><small>checks 40 screenings, 312 tickets, 60 shifts</small></div>
        </div>
        <div className="a-col">
          {OUTS.map((o, i) => <div className="a-out" key={o.b} style={{ animationDelay: `${1.2 + i * 0.35}s` }}><b>{o.b}</b><small>{o.s}</small></div>)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- B. the agent's log, step by step
const LOG = [
  ['1:10 pm', 'Trigger', 'Weather feed: snow from 2:00 to 7:00 pm.'],
  ['1:10 pm', 'Understand', 'Checked 40 screenings, 312 tickets and 60 volunteer shifts against the window.'],
  ['1:11 pm', 'Decide', 'Start 3 screenings 15 min later. Tell 21 people. Brief 3 door teams.'],
  ['1:11 pm', 'Ask', 'Sent the plan to Zane Marchetti for approval.'],
  ['1:14 pm', 'Act', 'Approved. 21 messages sent, briefs updated, website listing changed.'],
  ['1:14 pm', 'Log', 'Every input, decision and message saved to the audit log.'],
];
function B() {
  const n = useTick(1100, LOG.length + 3);
  return (
    <div className="opt-b">
      <div className="opt-copy">
        <h2 className="s-h2">Usher works through each problem the same careful way.</h2>
        <p className="s-lead">It reads the news, checks who is affected, proposes a plan and waits for your approval before anything is sent.</p>
      </div>
      <ol className="b-log">
        {LOG.map(([t, step, text], i) => (
          <li key={step} className={i < n ? 'on' : ''}>
            <time>{t}</time><span className={`b-step s-${step.toLowerCase()}`}>{step}</span><p>{text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- C. what each person receives
const PEOPLE = [
  { who: 'Attendee · Noor Abara', ch: 'App', title: 'Wild Tide now starts at 3:15 pm', body: 'Your seat is held. Snow is on the way, so leave 15 minutes early and take the free shuttle.' },
  { who: 'Volunteer · Theo Park', ch: 'Brief', title: 'Riverside Studio doors', body: 'Hold the doors until 3:20 pm. Point late arrivals to the side entrance.' },
  { who: 'Guest · Yara Hollis', ch: 'SMS', title: 'Could you open “Selling at Markets”?', body: 'Pavel is running late and joins at 4:20 pm. You start at 4:00 in Pier 9 Hall.' },
];
function C() {
  return (
    <div className="opt-c">
      <div className="opt-copy">
        <h2 className="s-h2">Usher tells each person exactly what changed for them.</h2>
        <p className="s-lead">An attendee hears about their seat, a volunteer about their door, a guest about their stage. Nobody has to read a long email to find their part.</p>
      </div>
      <div className="c-row">
        {PEOPLE.map((p, i) => (
          <div className="c-msg" key={p.who} style={{ animationDelay: `${0.3 + i * 0.4}s` }}>
            <div className="c-top"><span>{p.who}</span><em>{p.ch}</em></div>
            <b>{p.title}</b>
            <p>{p.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- D. four capabilities, each with a small working visual
function D() {
  const k = useTick(1600, 2);
  return (
    <div className="opt-d">
      <div className="opt-copy">
        <h2 className="s-h2">What Usher does for your team.</h2>
      </div>
      <div className="d-grid">
        <div className="d-card">
          <h3>Catches outside failures</h3>
          <p>Reads flight, print and weather feeds and flags what is at risk.</p>
          <div className="d-viz chips">{FEEDS.map(f => <span key={f.k} className="pulse">{f.ic} {f.v}</span>)}</div>
        </div>
        <div className="d-card">
          <h3>Tells exactly the right people</h3>
          <p>Ticket holders, people who saved it, guests and volunteers on shift, each with a recommendation.</p>
          <div className="d-viz faces">
            {['NA', 'TP', 'YH', 'PK', 'LP', 'SW', 'EG'].map((x, i) => <i key={x} className={x === 'PK' ? 'late' : ''} style={{ animationDelay: `${i * 0.12}s` }}>{x}</i>)}
            <span>+18</span>
          </div>
        </div>
        <div className="d-card">
          <h3>Keeps volunteers current</h3>
          <p>Live briefs by role and venue, rebuilt from the current schedule.</p>
          <div className="d-viz brief">
            <small>Riverside Studio · door team</small>
            <p>Hold the doors until <b key={k}>{k ? '3:20 pm' : '3:05 pm'}</b>.</p>
            <small className="upd">{k ? 'Updated 1:14 pm' : 'From the morning brief'}</small>
          </div>
        </div>
        <div className="d-card">
          <h3>Flags guest clashes</h3>
          <p>Counts travel time between venues; staff approve anything public.</p>
          <div className="d-viz clash">
            <span>4:00 pm · Selling at Markets · Pier 9 Hall</span>
            <span>4:15 pm · Q&amp;A: Wild Tide · Riverside Studio</span>
            <b>Pavel Kettering can’t be in both: 25 min between venues</b>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentOptions() {
  const opts: [string, string, () => ReactElement][] = [
    ['A', 'Feeds in, specific results out', A],
    ['B', 'The agent’s log, step by step', B],
    ['C', 'What each person receives', C],
    ['D', 'Four capabilities, each with a small visual', D],
  ];
  return (
    <div className="opt-page">
      <header className="opt-head">
        <span className="wordmark">Usher</span>
        <p>Four versions of the agent section. Tell me which one to use, or which parts to combine.</p>
      </header>
      {opts.map(([id, label, View]) => (
        <section className="aopt" key={id} id={`option-${id.toLowerCase()}`}>
          <div className="opt-label"><b>{id}</b>{label}</div>
          <View />
        </section>
      ))}
    </div>
  );
}
