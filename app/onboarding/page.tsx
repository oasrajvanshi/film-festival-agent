'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAgent, writeSetup } from '../ui/useAgent';
import { writeWho } from '../ui/profiles';
import { Icon } from '../ui/icons';
import { FestivalAgent } from '../../src/agent/agent';
import { GATE_POLICY, type ActionKind } from '../../src/agent/approvals';
import type { Festival } from '../../src/core/types';
import { parseCsv, tablesToFestival } from '../../src/data/sheet';
import { buildTables, guessKind, KIND_ORDER, KINDS, matchColumns, type Kind, type Upload } from '../../src/onboard/mapping';

const STEPS = ['Festival & data', 'Matching', 'Check', 'Team'] as const;
const SAMPLES = ['program.csv', 'theatres.csv', 'walking-times.csv', 'film-catalog.csv', 'registrations.csv', 'ticket-orders.csv', 'my-schedule-saves.csv', 'volunteer-rota.csv', 'faq-and-policies.csv'];
const GATE_LABELS: Partial<Record<ActionKind, string>> = {
  notify_people: 'Messages to attendees and guests', update_website: 'Website listing changes', public_announcement: 'Festival-wide announcements',
  roster_change: 'Volunteer roster changes', vendor_contingency: 'Messages to vendors and partners', send_vote_form: 'Audience voting forms',
  update_brief: 'Volunteer briefs', notify_staff: 'Heads-ups to staff', flag: 'Warnings on the dashboard',
};
const CHANNELS = [
  { id: 'push', label: 'App notifications', icon: 'bolt' }, { id: 'email', label: 'Email', icon: 'send' }, { id: 'sms', label: 'Text messages', icon: 'chat' },
  { id: 'weather', label: 'Weather watch', icon: 'alert' }, { id: 'flights', label: 'Guest flight watch', icon: 'clock' },
];

type Meta = { name: string; startDate: string; days: number; city: string };
const MAX_DAYS = 31;
const DAY_MS = 864e5;
/** Last festival day as YYYY-MM-DD. */
const endDate = (m: Meta) => /^\d{4}-\d{2}-\d{2}$/.test(m.startDate) ? new Date(Date.parse(`${m.startDate}T12:00:00Z`) + (m.days - 1) * DAY_MS).toISOString().slice(0, 10) : '';
/** Days from first to last, inclusive (1 to 31). */
const daysBetween = (a: string, b: string) => { const n = Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS) + 1; return Number.isFinite(n) ? Math.min(MAX_DAYS, Math.max(1, n)) : 1; };

export default function Onboarding() {
  const s = useAgent();
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [meta, setMeta] = useState<Meta>({ name: 'Harbor Lights Film Festival', startDate: '2027-04-15', days: 3, city: 'New York' });
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [sheetFest, setSheetFest] = useState<Festival | null>(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [approver, setApprover] = useState('Operations lead');
  const [channels, setChannels] = useState<string[]>(['push', 'email', 'sms', 'weather', 'flights']);
  const [revealed, setRevealed] = useState(0);
  const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: { name: string; text: string }[]) => {
    const next = files.filter(f => f.name.toLowerCase().endsWith('.csv') || f.name.toLowerCase().endsWith('.txt')).map(f => {
      const table = parseCsv(f.text.replace(/^﻿/, ''));
      const { kind } = guessKind(f.name, table[0] ?? []);
      return { name: f.name, table, kind, columns: matchColumns(kind, table[0] ?? []) };
    });
    if (!next.length) { setError('Please choose CSV files. In Excel or Google Sheets, use File, then Download, then CSV.'); return; }
    setError(''); setSheetFest(null);
    setUploads(u => [...u.filter(x => !next.some(n => n.name === x.name)), ...next]);
  };
  const useSamples = async () => {
    setBusy('Loading sample files…');
    const files = await Promise.all(SAMPLES.map(async name => ({ name, text: await (await fetch(`/samples/${name}`)).text() })));
    await addFiles(files); setBusy('');
  };
  const useSheet = async () => {
    setBusy('Reading your Google Sheet…'); setError('');
    try {
      const r = await fetch(`/api/festival?sheet=${encodeURIComponent(sheetUrl)}`);
      const b = await r.json();
      if (!r.ok || b.error) throw new Error(b.error ?? `HTTP ${r.status}`);
      if (!b.festival) throw new Error((b.errors ?? []).slice(0, 3).join(' · ') || 'The sheet has errors.');
      setSheetFest(b.festival); setUploads([]); setStep(2);
    } catch (e) { setError((e as Error).message); }
    setBusy('');
  };

  // Matching: reveal files one by one, like the agent reading them.
  useEffect(() => {
    if (step !== 1) return;
    setRevealed(0);
    const t = setInterval(() => setRevealed(n => { if (n >= uploads.length) { clearInterval(t); return n; } return n + 1; }), 380);
    return () => clearInterval(t);
  }, [step, uploads.length]);

  const built = useMemo(() => {
    if (step < 2) return null;
    if (sheetFest) return { festival: sheetFest, errors: [] as string[], unresolved: [] as string[], warnings: [] as string[], notes: [] as string[] };
    const b = buildTables(meta, uploads);
    const r = tablesToFestival(b.tables);
    return { festival: r.festival, errors: r.errors, warnings: r.warnings, unresolved: b.unresolved, notes: b.notes };
  }, [step, meta, uploads, sheetFest]);

  const preview = useMemo(() => {
    if (!built?.festival) return null;
    const a = new FestivalAgent(structuredClone(built.festival));
    a.sweepClashes();
    return a;
  }, [built]);

  const goLive = () => {
    if (!built?.festival) return;
    s.loadFestival(structuredClone(built.festival), sheetFest ? 'Google Sheet' : `${uploads.length} uploaded files`);
    writeSetup({ festivalName: built.festival.name || meta.name, city: meta.city, approver, channels, onboardedAt: new Date().toISOString() });
    writeWho({ kind: 'organizer', id: 'setup', name: approver || 'Organizer', detail: 'Set up the festival', code: '' });
    location.href = '/#today';
  };

  const canNext = [
    !!meta.name && /^\d{4}-\d{2}-\d{2}$/.test(meta.startDate) && (uploads.length > 0 || !!sheetFest),
    uploads.length > 0 && uploads.some(u => u.kind === 'schedule'),
    !!built?.festival,
    !!approver,
  ][step];
  const next = () => setStep(n => Math.min(STEPS.length - 1, sheetFest && n === 0 ? 2 : n + 1));
  const back = () => setStep(n => Math.max(0, sheetFest && n === 2 ? 0 : n - 1));

  if (!started) {
    return (
      <div className="ob ob-welcome">
        <div className="ob-poster">
          <div className="ob-mast display">Usher</div>
          <div className="ob-tag">Usher your festival with ease.</div>
          <div className="ob-poster-grid">
            <aside className="ob-meta">
              <div><span>For film</span> <span>festivals</span></div>
              <hr />
              <div><span>Schedules</span> <span>People</span> <span>Passes</span> <span>Disruptions</span></div>
              <hr />
              <div><span>Your team</span> <span>approves first</span></div>
            </aside>
            <div className="ob-photo">
              <h1 className="display">Bring your festival.<br />We’ll keep everyone in step.</h1>
            </div>
          </div>
          <p>Connect your schedule, people and passes. The agent watches for changes and disruptions, works out who is affected, and drafts each person a recommendation. Your team approves anything that goes out.</p>
          <div className="row">
            <button className="primary big" onClick={() => setStarted(true)}>Set up a festival <Icon name="send" size={16} /></button>
            <a className="ob-link" href="/" onClick={() => { writeWho(null); writeSetup({ festivalName: 'Harbor Lights Film Festival', city: 'New York', approver: 'Operations lead', channels: ['push', 'email'], onboardedAt: new Date().toISOString() }); }}>Or explore a sample festival</a>
          </div>
          <ol className="ob-steps-preview">
            {STEPS.map((t, i) => <li key={t}><span>{String(i + 1).padStart(2, '0')}</span>{t}</li>)}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="ob">
      <header className="ob-head">
        <div className="brand-mark"><Icon name="film" size={18} /></div>
        <div className="ob-title display">Usher</div>
        <a className="ob-link" href="/">Exit</a>
      </header>
      <nav className="ob-strip" aria-label="Steps">
        {STEPS.map((t, i) => (
          <button key={t} className={`frame ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} disabled={i > step} onClick={() => setStep(i)}>
            <span className="n">{i < step ? <Icon name="check" size={14} /> : String(i + 1).padStart(2, '0')}</span>{t}
          </button>
        ))}
      </nav>

      <main className="ob-body">
        {step === 0 && (
          <section className="ob-card">
            <h2 className="display">Tell us about your festival</h2>
            <p className="muted">The basics, then your schedule. Usher works out the rest.</p>
            <label className="field">Festival name<input value={meta.name} onChange={e => setMeta({ ...meta, name: e.target.value })} /></label>
            <div className="ob-two">
              <label className="field">First day<input type="date" value={meta.startDate} onChange={e => setMeta({ ...meta, startDate: e.target.value })} /></label>
              <label className="field">Last day<input type="date" value={endDate(meta)} min={meta.startDate} onChange={e => setMeta({ ...meta, days: daysBetween(meta.startDate, e.target.value) })} /></label>
            </div>
            <label className="field">City<input value={meta.city} onChange={e => setMeta({ ...meta, city: e.target.value })} placeholder="e.g. New York" /></label>
            <h3 className="ob-sub">Bring your data</h3>
            <p className="muted">Use the files you already have. Column names don’t need to match anything; the agent works them out.</p>
            <div className={`drop ${uploads.length ? 'has' : ''}`}
              onDragOver={e => e.preventDefault()}
              onDrop={async e => { e.preventDefault(); await addFiles(await Promise.all([...e.dataTransfer.files].map(async f => ({ name: f.name, text: await f.text() })))); }}
              onClick={() => fileRef.current?.click()}>
              <Icon name="sheet" size={28} />
              <div><strong>Drop CSV files here</strong> or tap to choose</div>
              <div className="muted">Schedule, venues, films, people, tickets, shifts, FAQ — any or all</div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" multiple hidden
                onChange={async e => { await addFiles(await Promise.all([...(e.target.files ?? [])].map(async f => ({ name: f.name, text: await f.text() })))); e.target.value = ''; }} />
            </div>
            <div className="ob-or"><span>or</span></div>
            <div className="ob-two">
              <button onClick={useSamples} disabled={!!busy}><Icon name="film" size={16} />Use sample festival files</button>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input placeholder="Paste a Google Sheet link" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                <button disabled={!sheetUrl || !!busy} onClick={useSheet}>Connect</button>
              </div>
            </div>
            {busy && <p className="muted">{busy}</p>}
            {error && <p className="chip bad" style={{ whiteSpace: 'normal' }}>{error}</p>}
            {uploads.length > 0 && (
              <div className="files">
                {uploads.map(u => (
                  <div className="file" key={u.name}>
                    <Icon name="sheet" size={16} /><span className="fname">{u.name}</span><span className="muted">{u.table.length - 1} rows</span>
                    <button className="ghost small" aria-label={`Remove ${u.name}`} onClick={e => { e.stopPropagation(); setUploads(uploads.filter(x => x.name !== u.name)); }}><Icon name="x" size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {step === 1 && (
          <section className="ob-card wide">
            <h2 className="display">The agent read your files</h2>
            <p className="muted">It worked out what each file is and which column means what. Check anything marked <span className="chip warn">check</span>.</p>
            {uploads.slice(0, revealed).map(u => {
              const headers = u.table[0] ?? [];
              const fields = KINDS[u.kind].fields;
              const setKind = (k: Kind) => setUploads(uploads.map(x => x.name === u.name ? { ...x, kind: k, columns: matchColumns(k, headers) } : x));
              const setCol = (field: string, header: string) => setUploads(uploads.map(x => x.name === u.name
                ? { ...x, columns: x.columns.map(c => c.field === field ? { ...c, header: header || null, confidence: header ? 1 : 0 } : c) } : x));
              return (
                <div className="match" key={u.name}>
                  <div className="match-head">
                    <Icon name="sheet" size={18} />
                    <div style={{ minWidth: 0, flex: 1 }}><strong>{u.name}</strong><div className="muted">{u.table.length - 1} rows · looks like your <b>{KINDS[u.kind].label.toLowerCase()}</b> ({KINDS[u.kind].describe})</div></div>
                    <select value={u.kind} onChange={e => setKind(e.target.value as Kind)} aria-label="File type">
                      {KIND_ORDER.map(k => <option key={k} value={k}>{KINDS[k].label}</option>)}
                    </select>
                  </div>
                  {u.kind !== 'travel' && (() => {
                    const rows = fields.filter(f => f.required || u.columns.find(c => c.field === f.key)?.header).map(f => {
                      const c = u.columns.find(x => x.field === f.key)!;
                      const st = !c.header ? (f.required && !(f.key === 'name' && u.columns.find(x => x.field === 'first')?.header) ? 'bad' : 'muted') : c.confidence >= 0.9 ? 'ok' : 'warn';
                      return { f, c, st };
                    });
                    const sure = rows.filter(r => r.st === 'ok').length;
                    const open = openFiles[u.name];
                    const shown = open ? rows : rows.filter(r => r.st === 'warn' || r.st === 'bad');
                    return (
                      <>
                        <div className="match-sum">
                          <span className="chip ok"><Icon name="check" size={12} />{sure} sure</span>
                          {rows.length - sure > 0 && <span className="chip warn">{rows.length - sure} to check</span>}
                          <button className="ghost small" onClick={() => setOpenFiles({ ...openFiles, [u.name]: !open })}>{open ? 'Hide columns' : `See all ${rows.length} columns`}</button>
                        </div>
                        {shown.length > 0 && <div className="cols">
                          {shown.map(({ f, c, st }) => (
                            <div className="col" key={f.key}>
                              <span className="from">{c.header ?? '—'}</span>
                              <Icon name="send" size={12} />
                              <span className="to">{f.label}</span>
                              <span className={`chip ${st === 'muted' ? '' : st}`}>{st === 'ok' ? 'sure' : st === 'warn' ? 'check' : st === 'bad' ? 'missing' : 'optional'}</span>
                              <select value={c.header ?? ''} onChange={e => setCol(f.key, e.target.value)} aria-label={`Column for ${f.label}`}>
                                <option value="">Not in this file</option>
                                {headers.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>}
                      </>
                    );
                  })()}
                </div>
              );
            })}
            {revealed < uploads.length && <p className="muted thinking">Reading {uploads[revealed]?.name}…</p>}
            {!uploads.some(u => u.kind === 'schedule') && revealed >= uploads.length && <p className="chip bad">None of these files is a schedule. Add one, or mark the right file as Schedule.</p>}
          </section>
        )}

        {step === 2 && built && (
          <section className="ob-card wide">
            <h2 className="display">{built.festival ? 'Everything checks out' : 'A few things to fix'}</h2>
            {built.festival && <>
              <div className="stats">
                {[['Events', built.festival.events.length], ['Films', built.festival.films.length], ['Venues', built.festival.venues.length], ['People', built.festival.people.length]].map(([k, v]) => (
                  <div className="stat" key={k as string}><div className="k">{k}</div><div className="v">{v}</div></div>
                ))}
              </div>
              <p className="muted">Also {built.festival.tickets.length} tickets, {built.festival.bookings.length} saved events, {built.festival.shifts.length} volunteer shifts and {built.festival.docs.reduce((a, d) => a + d.sections.length, 0)} FAQ answers.</p>
            </>}
            {built.errors.length > 0 && <div className="issues bad"><h3>Must fix ({built.errors.length})</h3>{built.errors.slice(0, 12).map((e, i) => <div key={i}>{e}</div>)}<p className="muted">Fix these in your file and upload it again, or go back and change a column match.</p></div>}
            {preview && preview.flags.length > 0 && (
              <div className="issues warn"><h3>Already in your schedule ({preview.flags.length})</h3>
                {preview.flags.slice(0, 4).map(fl => <div key={fl.id}><b>{fl.title}.</b> {fl.rationale}</div>)}
                <p className="muted">The agent will keep these on the dashboard until someone resolves them.</p></div>
            )}
            {[...built.unresolved, ...built.warnings, ...built.notes].length > 0 && (
              <details className="issues"><summary>Good to know ({built.unresolved.length + built.warnings.length + built.notes.length})</summary>
                {[...built.unresolved, ...built.warnings, ...built.notes].slice(0, 40).map((n, i) => <div key={i}>{n}</div>)}</details>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="ob-card wide">
            <h2 className="display">Your team and the rules</h2>
            <label className="field">Who approves outgoing messages<input value={approver} onChange={e => setApprover(e.target.value)} /></label>
            <h3>What the agent may do on its own</h3>
            <div className="gate">
              {(Object.keys(GATE_POLICY) as ActionKind[]).sort((a, b) => GATE_POLICY[a].localeCompare(GATE_POLICY[b])).map(k => (
                <div key={k} className="gate-row">
                  <span>{GATE_LABELS[k] ?? k}</span>
                  <span className={`chip ${GATE_POLICY[k] === 'auto' ? 'ok' : 'warn'}`}>{GATE_POLICY[k] === 'auto' ? 'On its own' : `Waits for ${approver || 'approval'}`}</span>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12.5 }}>These rules are fixed so the model can never decide on its own to contact the public.</p>
            <h3>Channels and watchers</h3>
            <div className="toggles">
              {CHANNELS.map(c => (
                <button key={c.id} className={`toggle ${channels.includes(c.id) ? 'on' : ''}`} onClick={() => setChannels(channels.includes(c.id) ? channels.filter(x => x !== c.id) : [...channels, c.id])}>
                  <Icon name={c.icon} size={18} />{c.label}<span className="sw" />
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="ob-foot">
        <button onClick={back} disabled={step === 0}>Back</button>
        <span className="muted">{step + 1} of {STEPS.length}</span>
        {step < STEPS.length - 1
          ? <button className="primary" disabled={!canNext} onClick={next}>Continue</button>
          : <button className="primary" disabled={!built?.festival} onClick={goLive}>Go live <Icon name="send" size={16} /></button>}
      </footer>
    </div>
  );
}
