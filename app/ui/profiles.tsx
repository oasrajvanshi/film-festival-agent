'use client';

// Sign-in by profile and access code, the organizer's code list, and the four
// personal views (staff, guest, attendee, vendor). Each view reads only the
// signed-in person's own records.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import { readWho, writeWho, type AgentStore } from './useAgent';
import { Icon } from './icons';
import { Ask, BriefView } from './panels';
import { PROFILES, deriveVendors, directory, lookupForCode, signIn, type ProfileKind, type Who } from '../../src/access/profiles';
import { clock as fmt } from '../../src/core/time';
import { PASS_LABELS, qrFor, type ScanResult } from '../../src/rules/access';
import type { DayNumber, FestivalEvent } from '../../src/core/types';

export { readWho, writeWho };

const noop = () => {};
const dayOf = (iso: string, dates: Record<DayNumber, string>): DayNumber =>
  Number(Object.entries(dates).find(([, d]) => iso.startsWith(d))?.[0] ?? 1) as DayNumber;
const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// ------------------------------------------------------------------ sign in
export function SignIn({ s, onIn }: { s: AgentStore; onIn: (w: Who) => void }) {
  const f = s.agent.f;
  const festName = s.festivalName;
  const [kind, setKind] = useState<ProfileKind | null>(null);
  const [mode, setMode] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'info'; text: ReactNode } | null>(null);
  const [err, setErr] = useState('');
  const pick = PROFILES.find(p => p.kind === kind);
  const choose = (k: ProfileKind | null) => { setKind(k); setMode('email'); setErr(''); setNote(null); setCode(''); };
  const go = async () => {
    if (!kind) return;
    if (s.shared) {
      setBusy(true);
      const r = await s.verifyCode(kind, code).catch(() => ({ ok: false as const, reason: 'offline' }));
      setBusy(false);
      if (r.ok) { onIn(r.who); return; }
      setErr(r.reason === 'too_many' ? 'Too many tries. Wait 15 minutes, or ask for a new code.' : `That code doesn't open the ${pick!.label} profile. Check it and try again.`);
      return;
    }
    const w = signIn(f, kind, code);
    if (!w) { setErr(`That code doesn't open the ${pick!.label} profile. Check it and try again.`); return; }
    writeWho(w); onIn(w);
  };
  const sendCode = async () => {
    if (!kind) return;
    setErr(''); setNote(null);
    if (s.shared) {
      setBusy(true);
      const r = await s.requestCode(kind, name, email).catch(() => ({ ok: false, reason: 'offline' } as { ok: boolean; reason?: string; sent?: boolean; code?: string }));
      setBusy(false);
      if (!r.ok) {
        setErr(r.reason === 'bad_email' ? 'Please enter a full email address.'
          : r.reason === 'name_mismatch' ? `That email is on the ${pick!.label} list, but the name doesn't match. Use your name as the festival has it.`
          : r.reason === 'offline' ? 'Usher couldn’t be reached. Check your connection and try again.'
          : `We couldn't find that email on the ${festName} ${pick!.label} list. Check the spelling, or that you picked the right profile.`);
        return;
      }
      setNote(r.sent ? { tone: 'ok', text: <>Checked against the festival list. Your code is on its way. In test mode it goes to the team inbox, not {email}.</> }
        : { tone: 'info', text: <>Checked against the festival list. Email isn't connected yet, so here is the code it would send: <b>{r.code}</b></> });
      setMode('code');
      return;
    }
    const r = lookupForCode(f, kind, name, email);
    if (!r.ok) {
      setErr(r.reason === 'bad_email' ? 'Please enter a full email address.'
        : r.reason === 'name_mismatch' ? `That email is on the ${pick!.label} list, but the name doesn't match. Use your name as the festival has it.`
        : `We couldn't find that email on the ${f.name} ${pick!.label} list. Check the spelling, or that you picked the right profile.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: r.who.contact && kind === 'vendor' ? name : r.who.name, email, code: r.who.code, festival: f.name, profile: pick!.label }) });
      const b = await res.json().catch(() => ({}));
      if (b.sent) setNote({ tone: 'ok', text: <>Checked against the festival list. Your code is on its way. In test mode it goes to the team inbox, not {email}.</> });
      else setNote({ tone: 'info', text: <>Checked against the festival list. Email isn't connected yet, so here is the code it would send: <b>{r.who.code}</b></> });
      setMode('code');
    } catch {
      setNote({ tone: 'info', text: <>Checked against the festival list. Email couldn't be reached, so here is the code: <b>{r.who.code}</b></> });
      setMode('code');
    }
    setBusy(false);
  };
  return (
    <div className="ob ob-welcome">
      <div className="ob-poster signin">
        <div className="ob-mast display" style={{ fontSize: 'clamp(36px, 6.4vw, 78px)', marginBottom: 4 }}>Usher</div>
        <div className="signin-fest">{festName}</div>
        {!kind ? (
          <>
            <p className="signin-lede">Who's signing in?</p>
            <div className="profile-grid">
              {PROFILES.map(p => (
                <button key={p.kind} className="profile-card" onClick={() => choose(p.kind)}>
                  <span className="pc-ic"><Icon name={p.icon} size={22} /></span>
                  <span className="pc-name display">{p.label}</span>
                  <span className="pc-blurb">{p.blurb}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="code-box">
            <button className="ghost small" onClick={() => choose(null)}>← All profiles</button>
            <h2 className="display">{pick!.label}</h2>
            {mode === 'email' ? <>
              <p className="muted" style={{ marginTop: 0 }}>Enter your name and email as the festival has them. Usher checks them against the {pick!.label.toLowerCase()} list, then emails your access code.</p>
              <label className="field">{kind === 'vendor' ? 'Your name or company' : 'Full name'}<input autoFocus value={name} autoComplete="name" onChange={e => { setName(e.target.value); setErr(''); }} /></label>
              <label className="field">Email<input type="email" value={email} autoComplete="email" onChange={e => { setEmail(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && name && email && sendCode()} /></label>
              {err && <div className="issues bad" role="alert">{err}</div>}
              <button className="primary big" style={{ marginTop: 14 }} disabled={!name.trim() || !email.trim() || busy} onClick={sendCode}>
                <Icon name="send" size={16} /> {busy ? 'Checking…' : 'Email me my code'}
              </button>
              <button className="ghost small" style={{ marginTop: 10 }} onClick={() => { setMode('code'); setErr(''); }}>I already have a code</button>
            </> : <>
              {note && <div className={`issues ${note.tone === 'ok' ? 'ok' : ''}`} role="status">{note.text}</div>}
              <p className="muted" style={{ marginTop: 0 }}>Enter your access code. It starts with {pick!.prefix}.</p>
              <input autoFocus className="code-input" placeholder={`${pick!.prefix}-XXXXXX`} value={code} maxLength={11}
                onChange={e => { setCode(e.target.value.toUpperCase()); setErr(''); }} onKeyDown={e => e.key === 'Enter' && go()} />
              {err && <div className="issues bad" role="alert">{err}</div>}
              <button className="primary big" style={{ marginTop: 14 }} disabled={code.replace(/[^A-Z0-9]/gi, '').length < 7 || busy} onClick={go}>
                <Icon name="key" size={16} /> Open my profile
              </button>
              <button className="ghost small" style={{ marginTop: 10 }} onClick={() => { setMode('email'); setErr(''); setNote(null); }}>Email me a code instead</button>
            </>}
          </div>
        )}
        <p className="muted signin-foot">
          Each profile sees only its own information. Codes are only sent to people on the festival's list.
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ organizer: codes
export function AccessCodes({ s, onViewAs }: { s: AgentStore; onViewAs: (w: Who) => void }) {
  const f = s.agent.f;
  const local = useMemo(() => (s.shared ? [] : directory(f)), [f, s.version, s.shared]); // eslint-disable-line react-hooks/exhaustive-deps
  const [server, setServer] = useState<Who[] | null>(null);
  useEffect(() => {
    if (!s.shared) return;
    s.call<{ people: Who[] }>('codes', {}, 'GET').then(r => r.ok && setServer(r.body.people)).catch(() => {});
  }, [s.shared, s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = s.shared ? server ?? [] : local;
  const link = typeof window !== 'undefined' && s.fid ? `${location.origin}/app?f=${s.fid}` : '';
  const [kind, setKind] = useState<ProfileKind>('staff');
  const [q, setQ] = useState('');
  const rows = all.filter(w => w.kind === kind && (!q || `${w.name} ${w.detail} ${w.code}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="card stack">
      <div className="section-title"><h2>Access codes</h2><span className="muted" style={{ fontSize: 12 }}>{all.length} people and vendors</span></div>
      <p className="muted" style={{ margin: 0 }}>Each person gets one code for their own profile. A code only opens the profile it was made for. Use "View as" to see exactly what someone sees.</p>
      {link && <div className="row" style={{ alignItems: 'center' }}><span className="muted">Link for your team and guests:</span> <code className="code-chip">{link}</code>
        <button className="small" onClick={() => navigator.clipboard?.writeText(link)}>Copy</button></div>}
      {s.shared && !server && <div className="muted">Loading codes…</div>}
      <div className="row">
        {PROFILES.map(p => (
          <button key={p.kind} className={`small ${p.kind === kind ? 'primary' : ''}`} onClick={() => setKind(p.kind)}>
            {p.label} <span style={{ opacity: .7 }}>{all.filter(w => w.kind === p.kind).length}</span>
          </button>
        ))}
        <input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 160px' }} />
      </div>
      <table className="stackable">
        <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Code</th><th /></tr></thead>
        <tbody>
          {rows.slice(0, 80).map(w => (
            <tr key={w.id}>
              <td data-label="Name">{w.name}</td>
              <td data-label="Role" className="muted">{w.detail}</td>
              <td data-label="Email" className="muted">{w.email}</td>
              <td data-label="Code"><code className="code-chip">{w.code}</code></td>
              <td>{w.kind !== 'organizer' && <button className="small" onClick={() => onViewAs(w)}><Icon name="eye" size={14} />View as</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ personal shell
type Tab = { id: string; label: string; icon: string };

export function PersonalApp({ s, who, onOut, viewAs }: { s: AgentStore; who: Who; onOut: () => void; viewAs?: boolean }) {
  const tabs: Tab[] = who.kind === 'staff'
    ? [{ id: 'home', label: 'My shift', icon: 'home' }, { id: 'scan', label: 'Door scan', icon: 'scan' }, { id: 'updates', label: 'Updates', icon: 'inbox' }, { id: 'ask', label: 'Ask', icon: 'chat' }]
    : who.kind === 'vendor'
      ? [{ id: 'home', label: 'Deliveries', icon: 'truck' }, { id: 'updates', label: 'Changes', icon: 'inbox' }]
      : [{ id: 'home', label: 'My festival', icon: 'home' }, { id: 'pass', label: 'My pass', icon: 'ticket' }, { id: 'updates', label: 'Updates', icon: 'inbox' }, { id: 'ask', label: 'Ask', icon: 'chat' }];
  const [tab, setTab] = useState('home');
  const f = s.agent.f;
  const inbox = s.agent.outbox.filter(d => d.personId === who.id);
  const profile = PROFILES.find(p => p.kind === who.kind)!;
  const day = dayOf(s.clock, f.dates);
  const P = { s, user: who.name, go: noop };
  return (
    <div className="me">
      {viewAs && <div className="viewas-bar"><Icon name="eye" size={16} /> Viewing as {who.name} ({profile.label}). <button className="small" onClick={onOut}>Back to organizer</button></div>}
      <header className="me-head">
        <div className="brand-mark"><Icon name="film" size={18} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="me-fest display">Usher</div>
          <div className="me-sub">{profile.label} · {who.name}</div>
        </div>
        <span className="chip">Day {day} · {fmt(s.clock)}</span>
        {!viewAs && <button className="ghost small" onClick={onOut} aria-label="Sign out"><Icon name="logout" /></button>}
      </header>
      <nav className="me-tabs" aria-label="Sections">
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={20} />{t.label}
            {t.id === 'updates' && inbox.length > 0 && <span className="badge">{inbox.length}</span>}
          </button>
        ))}
      </nav>
      <main className="me-body" key={who.id}>
        {tab === 'home' && who.kind === 'staff' && <StaffHome s={s} who={who} />}
        {tab === 'home' && (who.kind === 'guest' || who.kind === 'attendee') && <PersonHome s={s} who={who} go={setTab} />}
        {tab === 'home' && who.kind === 'vendor' && <><VendorHome s={s} who={who} /><VendorReport s={s} who={who} /></>}
        {tab === 'pass' && <PassCard s={s} who={who} />}
        {tab === 'scan' && <StaffScan s={s} />}
        {tab === 'ask' && <Ask {...P} />}
        {tab === 'updates' && (who.kind === 'vendor' ? <VendorChanges s={s} who={who} /> : <Inbox s={s} who={who} />)}
        {!viewAs && <Feedback s={s} compact />}
      </main>
    </div>
  );
}

function Inbox({ s, who }: { s: AgentStore; who: Who }) {
  const inbox = [...s.agent.outbox.filter(d => d.personId === who.id)].reverse();
  return (
    <div className="card">
      <div className="section-title"><h2>Updates for you</h2><span className="muted" style={{ fontSize: 12 }}>approved by the festival team</span></div>
      {inbox.length === 0 && <div className="empty-note">Nothing yet. If your plans are affected by a change, it will appear here and on your phone.</div>}
      {inbox.map((m, i) => (
        <div className="item" key={i}>
          <div className="ic info"><Icon name="send" size={16} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="t">{m.subject}</div>
            <div className="d">{m.body}</div>
            <div className="d muted">{fmt(m.at)} · {m.channel.replace('_', ' ')}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ staff
function StaffHome({ s, who }: { s: AgentStore; who: Who }) {
  const a = s.agent; const f = a.f;
  const mine = f.shifts.filter(x => x.personId === who.id).sort((x, y) => x.start.localeCompare(y.start));
  const next = mine.find(x => x.end >= s.clock) ?? null;
  const venue = (id: string) => f.venues.find(v => v.id === id)?.name ?? id;
  const crowd = next ? a.crowd(s.clock).venues.find(v => v.venueId === next.venueId) : null;
  const me = f.people.find(p => p.id === who.id);
  return (
    <>
      <section className="hero">
        <div className="eyebrow">{next ? `${dayLabel(f.dates[next.day])} · your next shift` : 'Your shifts'}</div>
        <h2>{next ? `${next.task} · ${venue(next.venueId)}` : 'No more shifts'}</h2>
        <p>{next ? `${fmt(next.start)} to ${fmt(next.end)}. Your brief below is rebuilt from the live schedule every time you open it.` : 'Thanks for your help this festival.'}</p>
        {(me?.availableDays?.length || me?.skills?.length) ? <p className="muted">
          {me.availableDays?.length ? `You can work ${me.availableDays.map(d => dayLabel(f.dates[d]).split(',')[0]).join(', ')}.` : ''}
          {me.skills?.length ? ` Skills: ${me.skills.join(', ')}.` : ''}
        </p> : null}
      </section>
      <div className="grid2">
        <div className="card">
          <h2>Live brief</h2>
          <BriefView s={s} personId={who.id} />
        </div>
        <div className="card">
          <h2>All your shifts</h2>
          {mine.length === 0 && <div className="empty-note">No shifts assigned.</div>}
          {mine.map(x => (
            <div className="item" key={x.id}>
              <div className="ic"><Icon name="clock" size={16} /></div>
              <div><div className="t">{x.task} · {venue(x.venueId)}</div><div className="d">{dayLabel(f.dates[x.day])} · {fmt(x.start)}–{fmt(x.end)}</div></div>
            </div>
          ))}
          {crowd && <>
            <h3>{crowd.venueName} right now</h3>
            <div className={`bar ${crowd.status}`}><div style={{ width: `${Math.min(100, crowd.fill * 100)}%` }} /></div>
            <div className="d muted" style={{ marginTop: 4 }}>{crowd.inside} inside of {crowd.capacity} · {crowd.event ? crowd.event.title : 'nothing on'}</div>
          </>}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ guest & attendee
type Plan = { e: FestivalEvent; why: string };

function PersonHome({ s, who, go }: { s: AgentStore; who: Who; go: (t: string) => void }) {
  const f = s.agent.f;
  const venue = (id: string) => f.venues.find(v => v.id === id)?.name ?? id;
  const plans: Plan[] = [];
  const add = (eid: string, why: string) => {
    const e = f.events.find(x => x.id === eid);
    if (e && !plans.some(p => p.e.id === eid)) plans.push({ e, why });
  };
  for (const e of f.events) if (e.guestIds.includes(who.id)) add(e.id, 'You’re appearing');
  for (const t of f.tickets) if (t.personId === who.id) add(t.eventId, 'Ticket');
  for (const b of f.bookings) if (b.personId === who.id) add(b.eventId, 'Saved');
  plans.sort((x, y) => x.e.start.localeCompare(y.e.start));
  const upcoming = plans.filter(p => p.e.end >= s.clock && p.e.status === 'scheduled');
  const next = upcoming[0];
  const unread = s.agent.outbox.filter(d => d.personId === who.id).length;
  const days = [...new Set(plans.map(p => p.e.day))].sort();
  const me = f.people.find(p => p.id === who.id);
  const where = (e: FestivalEvent) => `${venue(e.venueId)}${e.room ? `, ${e.room}` : ''}`;
  const when = (iso: string) => `${new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} ${fmt(iso)}`;
  return (
    <>
      <section className="hero">
        <div className="eyebrow">{next ? `Next up · ${dayLabel(f.dates[next.e.day])}` : 'Your festival'}</div>
        <h2>{next ? next.e.title : 'Nothing else on your list'}</h2>
        <p>{next ? `${fmt(next.e.start)} at ${where(next.e)}. ${next.why === 'You’re appearing' ? 'You’re on stage for this one.' : 'Doors open 20 minutes before.'}` : 'Browse the program or ask a question any time.'}</p>
        {me?.arrives && <p className="muted">You arrive {when(me.arrives)}{me.departs ? ` and leave ${when(me.departs)}` : ''}{me.travelNote ? ` · ${me.travelNote}` : ''}.</p>}
        <div className="row">
          <button className="primary" onClick={() => go('pass')}><Icon name="ticket" size={16} />Show my pass</button>
          {unread > 0 && <button onClick={() => go('updates')}><Icon name="inbox" size={16} />{unread} update{unread > 1 ? 's' : ''}</button>}
        </div>
      </section>
      <div className="card">
        <h2>Your schedule</h2>
        {plans.length === 0 && <div className="empty-note">No tickets or saved screenings yet.</div>}
        {days.map(d => (
          <div key={d}>
            <h3>{dayLabel(f.dates[d as DayNumber])}</h3>
            {plans.filter(p => p.e.day === d).map(p => (
              <div className={`item ${p.e.status === 'cancelled' ? 'is-off' : ''}`} key={p.e.id}>
                <div className={`ic ${p.why === 'You’re appearing' ? 'bad' : ''}`}><Icon name={p.e.kind === 'panel' ? 'users' : p.e.kind === 'qa' ? 'chat' : 'film'} size={16} /></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="t">{p.e.title}</div>
                  <div className="d">{fmt(p.e.start)}–{fmt(p.e.end)} · {where(p.e)}</div>
                </div>
                <span className={`chip plan-chip ${p.e.status === 'cancelled' ? 'bad' : p.why === 'You’re appearing' ? 'warn' : ''}`}>{p.e.status === 'cancelled' ? 'Cancelled' : p.why === 'You’re appearing' ? 'On stage' : p.why}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function PassCard({ s, who }: { s: AgentStore; who: Who }) {
  const f = s.agent.f;
  const pass = f.passes.find(p => p.personId === who.id);
  const code = qrFor(who.id);
  const svg = useMemo(() => { const q = qrcode(0, 'M'); q.addData(code); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }, [code]);
  return (
    <div className="pass-stub">
      <div className="pass-top">
        <div className="eyebrow">{f.name}</div>
        <div className="display pass-name">{who.name}</div>
        <div>{pass ? PASS_LABELS[pass.type] : 'Ticket holder'}{pass && pass.validDays.length < Object.keys(f.dates).length ? ` · Day ${pass.validDays.join(', ')}` : pass ? ' · All days' : ''}</div>
      </div>
      <div className="pass-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="pass-foot"><code>{code}</code><span>Show this at the door. One code covers your pass and every ticket.</span></div>
    </div>
  );
}

// ------------------------------------------------------------------ vendor
function VendorHome({ s, who }: { s: AgentStore; who: Who }) {
  const f = s.agent.f;
  const v = useMemo(() => deriveVendors(f).find(x => x.id === who.id), [f, s.version, who.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return <div className="card"><div className="empty-note">No deliveries found.</div></div>;
  const venue = (id: string) => f.venues.find(x => x.id === id)?.name ?? id;
  const next = v.deliveries.find(d => !d.cancelled && d.at >= s.clock);
  const days = [...new Set(v.deliveries.map(d => d.day))].sort();
  return (
    <>
      <section className="hero">
        <div className="eyebrow">{v.service} · {v.deliveries.filter(d => !d.cancelled).length} drops</div>
        <h2>{next ? `Next: ${fmt(next.at)} at ${venue(next.venueId)}` : 'All deliveries done'}</h2>
        <p>{next ? `${next.what}.` : 'Thanks for working with the festival.'} Timings follow the live schedule, so if an event moves, this list moves with it.</p>
      </section>
      <div className="card">
        <h2>Your deliveries</h2>
        {days.map(d => (
          <div key={d}>
            <h3>{dayLabel(f.dates[d])}</h3>
            {v.deliveries.filter(x => x.day === d).map(x => (
              <div className={`item ${x.cancelled ? 'is-off' : ''}`} key={x.id}>
                <div className="ic"><Icon name="truck" size={16} /></div>
                <div style={{ minWidth: 0, flex: 1 }}><div className="t">{fmt(x.at)} · {venue(x.venueId)}</div><div className="d">{x.what}</div></div>
                {x.cancelled && <span className="chip bad">Not needed</span>}
              </div>
            ))}
          </div>
        ))}
        <p className="muted" style={{ fontSize: 12 }}>Festival contact for changes: operations desk. Your contact on file: {v.contact}, {v.email}.</p>
      </div>
    </>
  );
}

function VendorChanges({ s, who }: { s: AgentStore; who: Who }) {
  const f = s.agent.f;
  const v = deriveVendors(f).find(x => x.id === who.id);
  const titles = new Set((v?.deliveries ?? []).map(d => d.eventId && f.events.find(e => e.id === d.eventId)?.title).filter(Boolean) as string[]);
  const changes = s.agent.changeFeed.filter(c => [...titles].some(t => c.includes(t)));
  const off = (v?.deliveries ?? []).filter(d => d.cancelled);
  return (
    <div className="card">
      <h2>Changes that affect you</h2>
      {changes.length === 0 && off.length === 0 && <div className="empty-note">No changes to your deliveries.</div>}
      {[...changes].reverse().map((c, i) => <div className="item" key={i}><div className="ic warn"><Icon name="clock" size={16} /></div><div className="d">{c}</div></div>)}
      {off.map(d => <div className="item" key={d.id}><div className="ic bad"><Icon name="x" size={16} /></div><div className="d">Cancelled: {d.what}</div></div>)}
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Vendors see only their own deliveries. Attendee and guest details are never shown here.</p>
    </div>
  );
}


// ------------------------------------------------------------------ staff: door scan
/** Staff scan a pass: type or paste the code, or use the camera where the browser can read QR codes. */
function StaffScan({ s }: { s: AgentStore }) {
  const f = s.agent.f;
  const day = dayOf(s.clock, f.dates);
  const events = f.events.filter(e => e.day === day && e.status === 'scheduled').sort((a, b) => a.start.localeCompare(b.start));
  const soon = events.find(e => e.end >= s.clock) ?? events[0];
  const [eid, setEid] = useState(soon?.id ?? '');
  const [qr, setQr] = useState('');
  const [res, setRes] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState<'off' | 'on' | 'none'>('off');
  const video = useRef<HTMLVideoElement>(null);
  const check = async (code: string) => {
    if (!code.trim() || !eid) return;
    setBusy(true); setRes(await s.scan(code.trim(), eid)); setBusy(false); setQr('');
  };
  useEffect(() => {
    if (cam !== 'on') return;
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD) { setCam('none'); return; }
    let stream: MediaStream | null = null; let stop = false; let last = '';
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream; await video.current.play();
        const det = new BD({ formats: ['qr_code'] });
        while (!stop) {
          const hits = await det.detect(video.current).catch(() => []);
          const v = hits[0]?.rawValue;
          if (v && v !== last) { last = v; await check(v); }
          await new Promise(r => setTimeout(r, 350));
        }
      } catch { setCam('none'); }
    })();
    return () => { stop = true; stream?.getTracks().forEach(t => t.stop()); };
  }, [cam, eid]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid2">
      <div className="card stack">
        <h2>Door scan</h2>
        <label className="field">Event at your door
          <select value={eid} onChange={e => setEid(e.target.value)}>
            {events.map(e => <option key={e.id} value={e.id}>{fmt(e.start)} {e.title}</option>)}
          </select>
        </label>
        {cam === 'on' ? <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 10, background: '#000' }} />
          : <button className="big-btn" onClick={() => setCam('on')}><Icon name="scan" size={18} /> Scan with camera</button>}
        {cam === 'none' && <div className="muted">This browser can’t read QR codes with the camera. Type the code under the QR instead.</div>}
        <label className="field">Or type the code under the QR
          <input value={qr} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="e.g. USH1.p-012.ABC" onChange={e => setQr(e.target.value)} onKeyDown={e => e.key === 'Enter' && check(qr)} />
        </label>
        <button className="primary big-btn" disabled={!qr.trim() || busy} onClick={() => check(qr)}>{busy ? 'Checking…' : 'Check'}</button>
      </div>
      <div className="card">
        {res ? <div className={`scan ${res.allowed ? 'ok' : 'bad'}`}>{res.allowed ? 'ALLOW' : 'DENY'}<div style={{ fontSize: 14, fontWeight: 400, marginTop: 8 }}>{res.personName && <>{res.personName} · </>}{res.reason}</div></div>
          : <p className="muted">Scan a pass to see green or red. Passes are checked on the festival’s server, so your phone never holds anyone else’s details.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ vendor: report a problem
function VendorReport({ s, who }: { s: AgentStore; who: Who }) {
  const f = s.agent.f;
  const v = useMemo(() => deriveVendors(f).find(x => x.id === who.id), [f, s.version, who.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [type, setType] = useState<'print_delay' | 'vendor_cancel'>(who.id === 'v-print' ? 'print_delay' : 'vendor_cancel');
  const films = f.films.filter(fl => (v?.deliveries ?? []).some(d => d.eventId && f.events.find(e => e.id === d.eventId)?.filmId === fl.id));
  const [filmId, setFilmId] = useState(films[0]?.id ?? '');
  const days = Object.keys(f.dates).map(Number).filter(n => n >= 1);
  const [day, setDay] = useState(days[0] ?? 1);
  const [eta, setEta] = useState('14:00');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const send = async () => {
    setMsg('Sending…');
    const r = await s.call<{ actions?: number; error?: string }>('vendor-report', { type, filmId, newEta: `${f.dates[day]}T${eta}`, day, service: v?.service, note });
    setMsg(r.ok ? 'Sent to the festival team. They’ll see it right away and get back to you.' : r.body.error ?? 'Couldn’t send. Try again.');
    if (r.ok) setNote('');
  };
  if (!s.shared) return null;
  return (
    <div className="card stack">
      <h2>Report a problem</h2>
      <div className="row">
        {who.id === 'v-print' && <button className={`small ${type === 'print_delay' ? 'primary' : ''}`} onClick={() => setType('print_delay')}>A print will be late</button>}
        <button className={`small ${type === 'vendor_cancel' ? 'primary' : ''}`} onClick={() => setType('vendor_cancel')}>We can’t make a day</button>
      </div>
      {type === 'print_delay' ? <>
        <label className="field">Film<select value={filmId} onChange={e => setFilmId(e.target.value)}>{films.map(fl => <option key={fl.id} value={fl.id}>{fl.title}</option>)}</select></label>
        <div className="row">
          <label className="field">Day<select value={day} onChange={e => setDay(+e.target.value)}>{days.map(d => <option key={d} value={d}>{dayLabel(f.dates[d])}</option>)}</select></label>
          <label className="field">New arrival<input type="time" value={eta} onChange={e => setEta(e.target.value)} /></label>
        </div>
      </> : <label className="field">Day<select value={day} onChange={e => setDay(+e.target.value)}>{days.map(d => <option key={d} value={d}>{dayLabel(f.dates[d])}</option>)}</select></label>}
      <label className="field">Anything else<input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" /></label>
      <button className="primary" onClick={send}><Icon name="send" size={16} /> Send to the festival</button>
      {msg && <div className="muted" role="status">{msg}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ feedback from testers
export function Feedback({ s, compact }: { s: AgentStore; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const [text, setText] = useState('');
  const [rating, setRating] = useState(0);
  const [msg, setMsg] = useState('');
  const [items, setItems] = useState<{ at: string; role: string; name: string; rating: number | null; text: string }[] | null>(null);
  const organizer = s.who?.kind === 'organizer' && !compact;
  useEffect(() => {
    if (organizer && s.shared) s.call<{ items: typeof items }>('feedback', {}, 'GET').then(r => r.ok && setItems(r.body.items)).catch(() => {});
  }, [organizer, s.shared, msg]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s.shared) return compact ? null : <div className="card"><h2>Feedback</h2><div className="empty-note">Feedback is collected once shared storage is connected.</div></div>;
  const send = async () => {
    const r = await s.call('feedback', { text, rating });
    setMsg(r.ok ? 'Thanks! The festival team will read this.' : 'Couldn’t send. Try again.');
    if (r.ok) { setText(''); setRating(0); }
  };
  if (compact && !open) return <p style={{ textAlign: 'center' }}><button className="ghost small" onClick={() => setOpen(true)}>Tell us how Usher is working for you</button></p>;
  return (
    <div className="card stack">
      <h2>{organizer ? 'Feedback from testers' : 'How is Usher working for you?'}</h2>
      <div className="row">{[1, 2, 3, 4, 5].map(n => <button key={n} className={`small ${rating === n ? 'primary' : ''}`} onClick={() => setRating(n)}>{n}</button>)}<span className="muted">1 is poor, 5 is great</span></div>
      <textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="What was easy, what was confusing, what’s missing?" />
      <button className="primary" disabled={!text.trim()} onClick={send}>Send feedback</button>
      {msg && <div className="muted" role="status">{msg}</div>}
      {organizer && items && <>
        <h3>{items.length} response{items.length === 1 ? '' : 's'}{items.some(i => i.rating) ? `, average ${(items.filter(i => i.rating).reduce((a, i) => a + (i.rating ?? 0), 0) / items.filter(i => i.rating).length).toFixed(1)} of 5` : ''}</h3>
        {items.map((i, k) => (
          <div className="item" key={k}><div className="ic info"><Icon name="chat" size={16} /></div>
            <div style={{ minWidth: 0 }}><div className="t">{i.rating ? `${i.rating}/5 · ` : ''}{i.role}{i.name ? ` · ${i.name}` : ''}</div><div className="d">{i.text}</div><div className="d muted">{new Date(i.at).toLocaleString()}</div></div></div>
        ))}
      </>}
    </div>
  );
}
