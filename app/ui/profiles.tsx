'use client';

// Sign-in by profile and access code, the organizer's code list, and the four
// personal views (staff, guest, attendee, vendor). Each view reads only the
// signed-in person's own records.

import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { AgentStore } from './useAgent';
import { Icon } from './icons';
import { Ask, Scan } from './panels';
import { PROFILES, deriveVendors, directory, signIn, type ProfileKind, type Who } from '../../src/access/profiles';
import { clock as fmt } from '../../src/core/time';
import { PASS_LABELS, qrFor } from '../../src/rules/access';
import type { DayNumber, FestivalEvent } from '../../src/core/types';

const WHO_KEY = 'ffa-who-v1';
export function readWho(): Who | null {
  try { const r = localStorage.getItem(WHO_KEY); return r ? JSON.parse(r) as Who : null; } catch { return null; }
}
export function writeWho(w: Who | null) {
  try { if (w) localStorage.setItem(WHO_KEY, JSON.stringify(w)); else localStorage.removeItem(WHO_KEY); } catch { /* private mode */ }
}

const noop = () => {};
const dayOf = (iso: string, dates: Record<DayNumber, string>): DayNumber =>
  Number(Object.entries(dates).find(([, d]) => iso.startsWith(d))?.[0] ?? 1) as DayNumber;
const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// ------------------------------------------------------------------ sign in
export function SignIn({ s, onIn }: { s: AgentStore; onIn: (w: Who) => void }) {
  const f = s.agent.f;
  const [kind, setKind] = useState<ProfileKind | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const demoOrg = useMemo(() => directory(f).find(w => w.kind === 'organizer'), [f]);
  const pick = PROFILES.find(p => p.kind === kind);
  const go = () => {
    if (!kind) return;
    const w = signIn(f, kind, code);
    if (!w) { setErr(`That code doesn't open the ${pick!.label} profile. Check it and try again.`); return; }
    writeWho(w); onIn(w);
  };
  return (
    <div className="ob ob-welcome">
      <div className="ob-poster signin">
        <div className="ob-mast display" style={{ fontSize: 'clamp(36px, 6.4vw, 78px)' }}>{f.name}</div>
        {!kind ? (
          <>
            <p className="signin-kicker">Usher your festival with ease</p>
            <p className="signin-lede">Who's signing in?</p>
            <div className="profile-grid">
              {PROFILES.map(p => (
                <button key={p.kind} className="profile-card" onClick={() => { setKind(p.kind); setErr(''); setCode(''); }}>
                  <span className="pc-ic"><Icon name={p.icon} size={22} /></span>
                  <span className="pc-name display">{p.label}</span>
                  <span className="pc-blurb">{p.blurb}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="code-box">
            <button className="ghost small" onClick={() => setKind(null)}>← All profiles</button>
            <h2 className="display">{pick!.label}</h2>
            <p className="muted" style={{ marginTop: 0 }}>Enter the access code the festival sent you. It starts with {pick!.prefix}.</p>
            <input autoFocus className="code-input" placeholder={`${pick!.prefix}-XXXX`} value={code} maxLength={9}
              onChange={e => { setCode(e.target.value.toUpperCase()); setErr(''); }} onKeyDown={e => e.key === 'Enter' && go()} />
            {err && <div className="issues bad" role="alert">{err}</div>}
            <button className="primary big" style={{ marginTop: 14 }} disabled={code.replace(/[^A-Z0-9]/gi, '').length < 7} onClick={go}>
              <Icon name="key" size={16} /> Open my profile
            </button>
          </div>
        )}
        <p className="muted signin-foot">
          Each profile sees only its own information. Organizers find everyone's codes under Access codes.
          {demoOrg && <> Demo organizer code: <b>{demoOrg.code}</b>.</>}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ organizer: codes
export function AccessCodes({ s, onViewAs }: { s: AgentStore; onViewAs: (w: Who) => void }) {
  const f = s.agent.f;
  const all = useMemo(() => directory(f), [f, s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [kind, setKind] = useState<ProfileKind>('staff');
  const [q, setQ] = useState('');
  const rows = all.filter(w => w.kind === kind && (!q || `${w.name} ${w.detail} ${w.code}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="card stack">
      <div className="section-title"><h2>Access codes</h2><span className="muted" style={{ fontSize: 12 }}>{all.length} people and vendors</span></div>
      <p className="muted" style={{ margin: 0 }}>Each person gets one code for their own profile. Send it with their pass. A code only opens the profile it was made for. Use "View as" to see exactly what someone sees.</p>
      <div className="row">
        {PROFILES.map(p => (
          <button key={p.kind} className={`small ${p.kind === kind ? 'primary' : ''}`} onClick={() => setKind(p.kind)}>
            {p.label} <span style={{ opacity: .7 }}>{all.filter(w => w.kind === p.kind).length}</span>
          </button>
        ))}
        <input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 160px' }} />
      </div>
      <table className="stackable">
        <thead><tr><th>Name</th><th>Role</th><th>Code</th><th /></tr></thead>
        <tbody>
          {rows.slice(0, 80).map(w => (
            <tr key={w.id}>
              <td data-label="Name">{w.name}</td>
              <td data-label="Role" className="muted">{w.detail}</td>
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
          <div className="me-fest display">{f.name}</div>
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
        {tab === 'home' && who.kind === 'vendor' && <VendorHome s={s} who={who} />}
        {tab === 'pass' && <PassCard s={s} who={who} />}
        {tab === 'scan' && <Scan {...P} />}
        {tab === 'ask' && <Ask {...P} />}
        {tab === 'updates' && (who.kind === 'vendor' ? <VendorChanges s={s} who={who} /> : <Inbox s={s} who={who} />)}
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
  return (
    <>
      <section className="hero">
        <div className="eyebrow">{next ? `${dayLabel(f.dates[next.day])} · your next shift` : 'Your shifts'}</div>
        <h2>{next ? `${next.task} · ${venue(next.venueId)}` : 'No more shifts'}</h2>
        <p>{next ? `${fmt(next.start)} to ${fmt(next.end)}. Your brief below is rebuilt from the live schedule every time you open it.` : 'Thanks for your help this festival.'}</p>
      </section>
      <div className="grid2">
        <div className="card">
          <h2>Live brief</h2>
          <pre className="brief msg">{a.brief(who.id, s.clock)}</pre>
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
  return (
    <>
      <section className="hero">
        <div className="eyebrow">{next ? `Next up · ${dayLabel(f.dates[next.e.day])}` : 'Your festival'}</div>
        <h2>{next ? next.e.title : 'Nothing else on your list'}</h2>
        <p>{next ? `${fmt(next.e.start)} at ${venue(next.e.venueId)}. ${next.why === 'You’re appearing' ? 'You’re on stage for this one.' : 'Doors open 20 minutes before.'}` : 'Browse the program or ask a question any time.'}</p>
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
                  <div className="d">{fmt(p.e.start)}–{fmt(p.e.end)} · {venue(p.e.venueId)}</div>
                </div>
                <span className={`chip ${p.e.status === 'cancelled' ? 'bad' : p.why === 'You’re appearing' ? 'warn' : ''}`}>{p.e.status === 'cancelled' ? 'Cancelled' : p.why}</span>
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
        <div>{pass ? PASS_LABELS[pass.type] : 'Ticket holder'}{pass && pass.validDays.length < 3 ? ` · Day ${pass.validDays.join(', ')}` : pass ? ' · All days' : ''}</div>
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

