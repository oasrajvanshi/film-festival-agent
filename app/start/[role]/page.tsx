'use client';
// Onboarding, one flow per role.
//   Festival team: your festival (details and files in one place), how the
//     agent read your files, then the check and your team's rules.
//   Attendee: pick your festival, find your pass, what you hope to get from it.
//   Staff: who you are, your shifts, your live brief.

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Back, Check } from '../../hl/icons';
import { dayLabel, fmt, initials, loadFestival, sampleAttendees, sampleStaff, saveWho, TEAM_LEADS, type Festival, type Role } from '../../hl/lib';

const PHOTO: Record<Role, string> = { attendee: '/hl/audience.jpg', staff: '/hl/stairs.jpg', team: '/hl/chair.jpg' };
const STEPS: Record<Role, number> = { attendee: 3, staff: 3, team: 3 };

const FESTIVALS = [
  { id: 'harbor', name: 'Harbor Lights Film Festival', where: 'Portland, Maine · April 15 to 17, 2027', img: '/hl/projector.jpg', open: true },
  { id: 'north', name: 'Northern Docs Week', where: 'Tromsø · January 2028', img: '/hl/snow.jpg', open: false },
  { id: 'salt', name: 'Salt Coast Shorts', where: 'Lisbon · June 2028', img: '/hl/hall.jpg', open: false },
];
const GOALS = ['Discover new films', 'Meet the filmmakers', 'Industry and deals', 'Learn the craft', 'Documentaries', 'A night out with friends'];

export default function StartPage() {
  return <Suspense fallback={null}><Start /></Suspense>;
}

function Start() {
  const { role: raw } = useParams<{ role: string }>();
  const params = useSearchParams();
  const device = params.get('device') === 'phone' ? 'phone' : 'desktop';
  const role = (['attendee', 'staff', 'team'].includes(raw) ? raw : 'attendee') as Role;
  const router = useRouter();
  const [fest, setFest] = useState<Festival | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [festival, setFestival] = useState('harbor');
  const [goals, setGoals] = useState<string[]>(['Discover new films', 'Meet the filmmakers']);
  const [sources, setSources] = useState<string[]>([]);
  const [link, setLink] = useState('');
  const [days, setDays] = useState(3);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { loadFestival().then(setFest, e => setError((e as Error).message)); }, []);

  const attendees = useMemo(() => fest ? sampleAttendees(fest) : [], [fest]);
  const staff = useMemo(() => fest ? sampleStaff(fest) : [], [fest]);
  const people = role === 'attendee' ? attendees.map(a => ({ id: a.id, name: a.name, sub: a.passType ? passLabel(a.passType) : a.role.replace(/_/g, ' '), channels: a.channels }))
    : role === 'staff' ? staff.map(s => ({ id: s.id, name: s.name, sub: `${s.title}${s.shifts[0] ? ` · ${venueName(fest, s.shifts[0].venueId)}` : ''}`, channels: s.channels }))
    : (fest?.staff.filter(s => TEAM_LEADS.includes(s.id)).sort((a, b) => TEAM_LEADS.indexOf(a.id) - TEAM_LEADS.indexOf(b.id)) ?? []).map(s => ({ id: s.id, name: s.name, sub: s.title, channels: s.channels }));
  const shown = people.filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase())).slice(0, role === 'team' ? 4 : 5);

  useEffect(() => { if (!pick && people.length) setPick(people[0].id); }, [people, pick]);
  useEffect(() => { const p = people.find(x => x.id === pick); if (p) setChannels(p.channels.map(c => c === 'app_push' ? 'push' : c)); }, [pick]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = STEPS[role];
  const last = step === total - 1;
  const canGo = role === 'team' && step === 0 ? sources.length > 0 : role === 'attendee' && step === 0 ? festival === 'harbor' : !!pick;
  const next = () => {
    if (!last) { setStep(step + 1); return; }
    saveWho({ role, id: pick!, channels });
    if (role === 'attendee') { try { localStorage.setItem('hl:goals', JSON.stringify(goals)); } catch { /* none */ } }
    if (role === 'team') { try { localStorage.setItem('hl:team-device', device); } catch { /* none */ } }
    router.push(role === 'team' && device === 'phone' ? '/team?device=phone' : `/${role}`);
  };
  const back = () => step ? setStep(step - 1) : router.push('/app');

  let head: { title: string; text: string };
  let body: ReactNode = null;
  let cta = 'Continue';

  const who = (
    <>
      <input className="input" placeholder="Search your name" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search your name" />
      {shown.map(p => (
        <button key={p.id} type="button" className="pick" aria-pressed={pick === p.id} onClick={() => setPick(p.id)}>
          <span className="avatar">{initials(p.name)}</span>
          <div><b>{p.name}</b><small>{p.sub}</small></div>
          <span className="check">{pick === p.id && <Check />}</span>
        </button>
      ))}
      {!shown.length && <p className="muted small">Nobody by that name on the festival sheet.</p>}
    </>
  );

  // the sheet the agent read, shown as the tabs it found
  const files = fest ? [
    { name: 'Schedule grid', rows: fest.sessions.length, what: 'your schedule' },
    { name: 'Venues', rows: fest.venues.length, what: 'your venues and seats' },
    { name: 'People', rows: fest.guests.length + fest.staff.length + fest.audience.length, what: 'guests, staff and attendees' },
    { name: 'Volunteer shifts', rows: fest.staff.reduce((n, s) => n + s.shifts.length, 0), what: 'your volunteer rota' },
    { name: 'Saved events', rows: fest.audience.reduce((n, a) => n + a.eventIds.length, 0), what: 'what each attendee plans to see' },
  ] : [];

  if (role === 'team') {
    if (step === 0) {
      head = { title: 'Your festival', text: 'Tell the agent about the festival and give it your plans. Any file or link works; the columns can be named anything.' };
      body = (
        <>
          <div className="glass form-card">
            <div className="field"><label htmlFor="f-name">Festival name</label><input id="f-name" className="input" defaultValue={fest?.info.name ?? 'Harbor Lights Film Festival'} /></div>
            <div className="field-row">
              <div className="field"><label htmlFor="f-day">First day</label><input id="f-day" className="input" type="date" defaultValue={fest?.info.dates[1] ?? '2027-04-15'} /></div>
              <div className="field"><label>Days</label><div className="seg" role="group" aria-label="Days">{[1, 2, 3].map(n => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>{n}</button>)}</div></div>
            </div>
            <div className="field"><label htmlFor="f-city">City, for the weather watch</label><input id="f-city" className="input" defaultValue="Portland, Maine" /></div>
          </div>
          <div className={`drop${sources.length ? ' has' : ''}`}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const fs = [...e.dataTransfer.files].map(f => f.name); if (fs.length) setSources([...sources, ...fs]); }}>
            <b>Drop any file or link with your plans</b>
            <span>Schedule, venues, guests, passes, shifts, briefs: spreadsheets, documents or a Google Sheet.</span>
            <div className="drop-actions">
              <button type="button" className="btn small" onClick={() => fileInput.current?.click()}>Choose files</button>
              <button type="button" className="btn small primary" onClick={() => setSources([...new Set([...sources, 'Harbor Lights sheet (Google Sheets)'])])}>Use the Harbor Lights sheet</button>
            </div>
            <div className="drop-link">
              <input className="input" placeholder="Or paste a link" value={link} onChange={e => setLink(e.target.value)} aria-label="Paste a link" />
              <button type="button" className="btn small" disabled={!link.trim()} onClick={() => { setSources([...sources, link.trim()]); setLink(''); }}>Add</button>
            </div>
            <input ref={fileInput} type="file" multiple hidden onChange={e => { const fs = [...(e.target.files ?? [])].map(f => f.name); if (fs.length) setSources([...sources, ...fs]); }} />
            {sources.length > 0 && <ul className="drop-list">{sources.map(s => <li key={s}><Check />{s}</li>)}</ul>}
          </div>
        </>
      );
    } else if (step === 1) {
      head = { title: 'How the agent read it', text: 'It worked out what each tab is and which column means what.' };
      body = (
        <div className="glass list-card">
          {files.map(f => (
            <div className="row-line" key={f.name}>
              <div><b>{f.name}</b><div className="small muted">{f.rows} rows · {f.what}</div></div>
              <span className="chip">Matched</span>
            </div>
          ))}
          <div className="row-line"><div><b>Guest IDs</b><div className="small muted">Read as the speakers on each panel and Q&amp;A</div></div><span className="chip amber">Check</span></div>
        </div>
      );
    } else {
      head = { title: 'Check and team', text: 'Everything checks out. Pick who approves, and see what the agent may do on its own.' };
      body = (
        <>
          {fest && (
            <div className="stat-row">
              <div className="glass stat"><b>{fest.sessions.length}</b><span>Events</span></div>
              <div className="glass stat"><b>{fest.guests.length}</b><span>Guests</span></div>
              <div className="glass stat"><b>{fest.staff.length}</b><span>Staff</span></div>
            </div>
          )}
          <h3 className="onb-sub">Who approves</h3>
          {who}
          <h3 className="onb-sub">What the agent does on its own</h3>
          <div className="glass list-card">
            {[['Warnings on the calendar', true], ['Briefs and heads-ups for staff', true], ['Messages to attendees and guests', false], ['Changes to the schedule', false], ['Orders from vendors', false]].map(([label, auto]) => (
              <div className="rule" key={String(label)}><span>{label}</span><em className={auto ? 'auto' : ''}>{auto ? 'On its own' : 'Waits for you'}</em></div>
            ))}
          </div>
        </>
      );
      cta = 'Open the calendar';
    }
  } else if (role === 'attendee') {
    if (step === 0) {
      head = { title: 'Your festival', text: 'Which festival are you going to?' };
      body = (
        <div className="fest-list">
          {FESTIVALS.map(f => (
            <button key={f.id} type="button" className="fest" aria-pressed={festival === f.id} disabled={!f.open} onClick={() => setFestival(f.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.img} alt="" />
              <span><b>{f.name}</b><small>{f.open ? f.where : `${f.where} · tickets not on sale yet`}</small></span>
              <span className="check">{festival === f.id && <Check />}</span>
            </button>
          ))}
        </div>
      );
    } else if (step === 1) {
      head = { title: 'Find your pass', text: 'Your pass and tickets are already on the festival list.' };
      body = who;
    } else {
      head = { title: 'What do you hope to get from it?', text: 'When your plan changes, the agent suggests what to see instead with this in mind.' };
      body = (
        <div className="goal-grid">
          {GOALS.map(g => {
            const on = goals.includes(g);
            return <button key={g} type="button" className="goal" aria-pressed={on} onClick={() => setGoals(on ? goals.filter(x => x !== g) : [...goals, g])}>{on && <Check />}{g}</button>;
          })}
        </div>
      );
      cta = 'Open my agenda';
    }
  } else {
    const s = fest?.staff.find(x => x.id === pick);
    if (step === 0) { head = { title: 'Who are you?', text: 'Pick your name from the festival rota.' }; body = who; }
    else if (step === 1) {
      head = { title: 'Your shifts', text: s ? `${s.title}. These come from the volunteer rota.` : '' };
      body = s && (
        <div className="glass list-card">
          {s.shifts.slice().sort((x, y) => x.start.localeCompare(y.start)).map((sh, i) => (
            <div className="row-line" key={i}>
              <div><b>{venueName(fest, sh.venueId)}</b><div className="small muted">{fest?.teams[sh.task] ?? sh.task.replace(/_/g, ' ')}</div></div>
              <span className="time small">{dayLabel(sh.start.slice(0, 10)).wd} {fmt(sh.start, true)} to {fmt(sh.end)}</span>
            </div>
          ))}
        </div>
      );
    } else {
      head = { title: 'Your live brief', text: 'When the plan changes, your brief changes with it. You only see what is for your venue and team.' };
      body = (
        <div className="glass list-card">
          {[['push', 'App notifications'], ['sms', 'Text messages'], ['email', 'Email']].map(([id, label]) => {
            const on = channels.includes(id);
            return <div className="row-line" key={id}><b>{label}</b><button type="button" className="toggle" role="switch" aria-checked={on} aria-label={label} onClick={() => setChannels(on ? channels.filter(c => c !== id) : [...channels, id])} /></div>;
          })}
        </div>
      );
      cta = 'Open my shift';
    }
  }

  return (
    <>
      <div className="photo top" style={{ backgroundImage: `url(${PHOTO[role]})` }} />
      <main className="phone">
        <div className="onb-top">
          <button type="button" className="iconbtn" onClick={back} aria-label="Back"><Back /></button>
          <div className="steps" aria-label={`Step ${step + 1} of ${total}`}>{Array.from({ length: total }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        </div>
        <header className="onb-head">
          <h1 className="display" style={{ margin: 0 }}>{head.title}</h1>
          <p>{head.text}</p>
        </header>
        <section className="onb-body" data-lve-skip>
          {error && <p className="muted">{error}</p>}
          {!fest && !error && <p className="muted">Loading the festival</p>}
          {body}
        </section>
        <footer className="onb-foot">
          <button type="button" className="btn primary block" disabled={!canGo} onClick={next}>{cta}</button>
        </footer>
      </main>
    </>
  );
}

function venueName(f: Festival | null, id: string) { return f?.venues.find(v => v.id === id)?.name ?? id; }
function passLabel(p: string) {
  const m: Record<string, string> = { day_pass: 'Day pass', three_day: '3-day pass', '3_day': '3-day pass', single_ticket: 'Single tickets', vip: 'VIP pass' };
  return m[p] ?? p.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}
