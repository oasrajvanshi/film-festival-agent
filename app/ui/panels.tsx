'use client';

import { DayCalendar } from './daycal';
import { ProblemTrigger, WeatherAlerts, useAlerts, type Preview } from './weatherplan';
import { useMemo, useState } from 'react';
import { DEFAULT_SHEET, readSetup, type AgentStore } from './useAgent';
import { riskSummary, type WeatherHour } from '../../src/agent/weather';
import type { DayNumber, FestivalEvent, PassType } from '../../src/core/types';
import { festivalDays } from '../../src/core/types';
import { addMinutes, clock as fmt, toMinutes } from '../../src/core/time';
import { PASS_LABELS, qrFor, type ScanResult } from '../../src/rules/access';
import { citeLabel, type Answer } from '../../src/agent/answer';
import { runAll, type SuiteResult } from '../../src/eval/scenarios';
import { evalRandomFestivals } from '../../src/eval/fuzz';
import type { Recommendation } from '../../src/agent/recommend';
import { Icon } from './icons';
import { buildBrief } from '../../src/agent/briefs';
import { HeroPhoto, PhotoBand } from './photos';

type P = { s: AgentStore; user: string; go: (page: 'today' | 'approvals' | 'here' | 'scan' | 'schedule' | 'ask' | 'briefs' | 'feeds' | 'log' | 'data') => void };

const dayOf = (iso: string, dates: Record<DayNumber, string>): DayNumber =>
  Number(Object.entries(dates).find(([, d]) => iso.startsWith(d))?.[0] ?? 1) as DayNumber;

function useLookups(s: AgentStore) {
  const f = s.agent.f;
  return useMemo(() => ({
    person: (id: string) => f.people.find(p => p.id === id),
    venue: (id: string) => f.venues.find(v => v.id === id)?.name ?? id,
    event: (id: string) => f.events.find(e => e.id === id),
  }), [f, s.version]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ------------------------------------------------------------------ Overview
export function Overview({ s, user }: P) {
  const a = s.agent;
  const f = a.f;
  const day = dayOf(s.clock, f.dates);
  const [calDay, setCalDay] = useState<DayNumber>(day);
  // The open recommendation's preview, and the schedule as it was before the last approved one.
  const [preview, setPreview] = useState<Preview | null>(null);
  const [original, setOriginal] = useState<FestivalEvent[] | null>(() => {
    try { const v = typeof window !== 'undefined' && localStorage.getItem('usher-original-plan-v1'); return v ? JSON.parse(v) : null; } catch { return null; }
  });
  const [showOriginal, setShowOriginal] = useState(false);
  const [kept, setKept] = useState<Record<string, string>>(() => {
    try { const v = typeof window !== 'undefined' && localStorage.getItem('usher-plan-notes-v1'); return v ? JSON.parse(v) : {}; } catch { return {}; }
  });
  const keepOriginal = (before: FestivalEvent[], n: Record<string, string>) => {
    const first = original ?? before;
    const allNotes = { ...kept, ...n };
    setOriginal(first); setKept(allNotes); setShowOriginal(false);
    try { localStorage.setItem('usher-original-plan-v1', JSON.stringify(first)); localStorage.setItem('usher-plan-notes-v1', JSON.stringify(allNotes)); } catch { /* private mode */ }
  };
  // An original plan only counts while the schedule still differs from it (a demo reset clears it).
  const differs = (o: FestivalEvent | undefined, e: FestivalEvent) => !!o && (o.start !== e.start || o.venueId !== e.venueId || o.guestIds.join() !== e.guestIds.join());
  const hasOriginal = !!original && f.events.some(e => differs(original.find(x => x.id === e.id), e));
  const was: Record<string, string> = {};
  const notes: Record<string, string> = { ...(preview?.notes ?? {}) };
  if (preview) {
    for (const id of preview.moved) {
      const cur = f.events.find(e => e.id === id); const nxt = preview.events.find(e => e.id === id);
      if (cur && nxt && cur.start !== nxt.start) was[id] = cur.start;
    }
  } else if (hasOriginal && !showOriginal) {
    for (const e of f.events) {
      const o = original!.find(x => x.id === e.id);
      if (!differs(o, e)) continue;
      if (o!.start !== e.start) was[e.id] = o!.start;
      if (kept[e.id]) notes[e.id] = kept[e.id]; else if (o!.start === e.start) notes[e.id] = 'Changed';
    }
  }
  const calEvents = preview ? preview.events : showOriginal && hasOriginal ? original! : undefined;
  const [alerts] = useAlerts();
  const problems = alerts.filter(x => x.status === 'open').length;
  return (
    <div className="today">
      <section className="hero has-photo">
        <HeroPhoto k="organizer" />
        <h2>{problems ? `${problems} problem${problems === 1 ? '' : 's'} need${problems === 1 ? 's' : ''} you` : s.festivalName}</h2>
      </section>

      <ProblemTrigger />
      <WeatherAlerts s={s} user={user}
        onOpen={d => { setCalDay(d); setShowOriginal(false); }}
        onPreview={setPreview} onApplied={keepOriginal} />

        <div className="cal-top">
          <div className="cal-days" role="tablist" aria-label="Festival day">
            {festivalDays(f).map(d => (
              <button key={d} role="tab" aria-selected={d === calDay} className={d === calDay ? 'on' : ''} onClick={() => setCalDay(d)}>
                Day {d} <small>{new Date(`${f.dates[d]}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })} {Number(f.dates[d].slice(8))}</small>
              </button>
            ))}
          </div>
          {hasOriginal && !preview && (
            <button className="cal-orig" aria-pressed={showOriginal} onClick={() => setShowOriginal(!showOriginal)}>
              <Icon name={showOriginal ? 'calendar' : 'eye'} size={15} /> {showOriginal ? 'Back to new plan' : 'Original plan'}
            </button>
          )}
        </div>
      <div className="card today-cal">
        <DayCalendar s={s} day={calDay} events={calEvents} was={was} notes={notes} animate={!!preview} />
      </div>

    </div>
  );
}

// ------------------------------------------------------------------ Approvals, one line each
/** Each update waiting for approval is one line with one button; tap the line for the messages. */
function ApprovalLines({ s, user }: P) {
  const { person } = useLookups(s);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [note, setNote] = useState('');
  const pending = [...s.agent.queue].reverse().filter(q => q.status === 'pending');
  const act = (id: string, ok: boolean) => { const n = note.trim() || undefined; ok ? s.agent.approve(id, user, n) : s.agent.reject(id, user, n); setOpen(null); setNote(''); s.commit(); };
  return (
    <>
      {pending.map(q => {
        const msgs = q.action.messages ?? [];
        const isOpen = open === q.action.id;
        const past = s.agent.pastDecisions?.(q.action) ?? [];
        return (
          <div className={`item flag-item ${isOpen ? 'open' : ''}`} key={q.action.id}>
            <div className="ic"><Icon name="inbox" size={16} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                <button className="flag-line" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : q.action.id); setAll(false); }}>
                  <span className="t">{q.action.title}</span><span className="muted flag-more">{msgs.length ? `${msgs.length} message${msgs.length > 1 ? 's' : ''}` : isOpen ? 'Less' : 'Details'}</span>
                </button>
                <button className="small primary" style={{ flex: 'none' }} onClick={() => act(q.action.id, true)}>Approve</button>
              </div>
              {isOpen && (
                <div className="flag-body">
                  <div className="d">{q.action.rationale}</div>
                  {past[0] && <div className="d muted">Last time: {past[0].by} {past[0].status} “{past[0].title}”.{past[0].note ? ` Note: “${past[0].note}”` : ''}</div>}
                  {(all ? msgs : msgs.slice(0, 2)).map((m, i) => (
                    <div className="msg" key={i}>
                      <div className="who">{person(m.personId)?.name ?? m.personId} · {m.channel.replace('_', ' ')}</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    </div>
                  ))}
                  {msgs.length > 2 && <button className="ghost small" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${msgs.length}`}</button>}
                  <input placeholder="Note for next time (optional)" value={note} onChange={e => setNote(e.target.value)} style={{ marginTop: 8, width: '100%' }} />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="small" onClick={() => act(q.action.id, false)}>Reject</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ Flags
/** Needs attention: one short line per flag; tap for the detail and a way to sort it out. */
function FlagList({ s, user, go }: P) {
  const a = s.agent;
  const [open, setOpen] = useState<string | null>(null);
  const [showSorted, setShowSorted] = useState(false);
  const act = (fn: () => unknown) => { fn(); setOpen(null); s.commit(); };
  return (
    <>
      {[...a.flags].reverse().map(fl => {
        const isOpen = open === fl.id;
        const cover = fl.id.startsWith('shift-') ? ((fl.payload as { cover?: string[] } | undefined)?.cover ?? []) : [];
        const toSchedule = /^(clash|room|seats|arrival|orphan)-/.test(fl.id);
        return (
          <div className={`item flag-item ${isOpen ? 'open' : ''}`} key={fl.id}>
            <div className="ic bad"><Icon name="alert" size={16} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <button className="flag-line" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : fl.id)}>
                <span className="t">{fl.title}</span><span className="muted flag-more">{isOpen ? 'Less' : 'Details'}</span>
              </button>
              {isOpen && (
                <div className="flag-body">
                  <div className="d">{fl.rationale}</div>
                  <div className="row" style={{ marginTop: 10 }}>
                    {cover.map(name => (
                      <button key={name} className="small primary" onClick={() => act(() => a.assignCover(fl.id, name, user))}>Give shift to {name}</button>
                    ))}
                    {toSchedule && <button className="small" onClick={() => go('schedule')}><Icon name="calendar" size={14} />Fix in schedule</button>}
                    <button className="small" onClick={() => act(() => a.resolveFlag(fl.id, user))}><Icon name="check" size={14} />Mark as sorted</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {a.sorted.length > 0 && (
        <div className="sorted-note">
          <button className="ghost small" onClick={() => setShowSorted(!showSorted)}>{showSorted ? 'Hide' : 'Show'} {a.sorted.length} sorted</button>
          {showSorted && [...a.sorted].reverse().map(x => (
            <div className="item is-off" key={x.id}>
              <div className="ic ok"><Icon name="check" size={16} /></div>
              <div style={{ minWidth: 0 }}><div className="t">{x.title}</div><div className="d">{x.how} · {x.by}</div></div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Weather
/** Pull a forecast (real or a demo scenario) and let the agent plan around it. */
export function WeatherCard({ s, go, compact }: P & { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const date = s.clock.slice(0, 10);
  const city = (typeof window !== 'undefined' && readSetup()?.city) || 'New York';
  // Forecasts reach about 16 days ahead. Further out, today's real weather is played on the festival day as a preview.
  const daysAway = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.now()) / 864e5);
  const preview = daysAway > 15;
  const realFrom = new Date(Date.parse(`${date}T12:00:00Z`) - 16 * 864e5).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  const dayLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const run = async (scenario?: string) => {
    setBusy(true); setNote(null);
    try {
      const qs = new URLSearchParams({ date, ...(scenario ? { scenario } : { city }) });
      const r = await fetch(`/api/weather?${qs}`, { cache: 'no-store' });
      const j = await r.json() as { source?: string; hours?: WeatherHour[]; error?: string };
      if (!r.ok || !j.hours) throw new Error(j.error ?? `HTTP ${r.status}`);
      const label = !scenario && preview ? `Preview: today's weather in ${city}, played on ${dayLabel}` : j.source ?? 'Forecast';
      const out = await s.agent.onWeather(j.hours, label);
      s.commit();
      const waiting = out.actions.filter(x => x.kind === 'notify_people');
      const tail = !scenario && preview ? ` Your festival is ${daysAway} days away, so this used today's real weather in ${city} as a preview. Real forecasts for ${dayLabel} start around ${realFrom}.` : '';
      setNote((!out.risks.length ? `${label}: no weather risks during festival hours.`
        : !out.fresh.length ? `${out.risks.map(riskSummary).join('; ')}. Already handled.`
        : `${out.fresh.map(riskSummary).join('; ')}. Staff and volunteers told. ${waiting.reduce((n, x) => n + (x.messages?.length ?? 0), 0)} personal updates are waiting for your approval.`) + tail);
    } catch (e) { setNote(`Couldn't get the forecast: ${(e as Error).message}`); }
    setBusy(false);
  };
  const scenarios: [string, string][] = [['storm', 'Thunderstorm'], ['snow', 'Snow'], ['heat', 'Heat wave']];
  return (
    <div className="card stack">
      {!compact && <PhotoBand k="snow" label="Snow, storms, heat" />}
      <div className="section-title"><h2><Icon name="cloud" size={18} /> Weather watch</h2><span className="muted" style={{ fontSize: 12 }}>Live forecast</span></div>
      <div className="row">
        <button className="primary" disabled={busy} onClick={() => run()}>{preview ? `Preview with today's ${city} weather` : `Check the forecast for ${dayLabel}`}</button>
        {scenarios.map(([k, l]) => <button key={k} disabled={busy} onClick={() => run(k)}>Try: {l}</button>)}
      </div>
      {busy && <div className="muted">Checking the forecast…</div>}
      {note && <div className="msg">{note}{note.includes('waiting') && <> <button className="small" onClick={() => go('today')}>Review</button></>}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Schedule grid
type Patch = Partial<Pick<FestivalEvent, 'start' | 'end' | 'venueId' | 'status' | 'guestIds'>>;

export function Grid({ s, user }: P) {
  const f = s.agent.f;
  const { venue, person } = useLookups(s);
  const [day, setDay] = useState<DayNumber>(dayOf(s.clock, f.dates));
  const [draft, setDraft] = useState<Record<string, Patch>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [moveQa, setMoveQa] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const guests = f.people.filter(p => p.role === 'guest');

  const events = f.events.filter(e => e.day === day).map(e => ({ ...e, ...draft[e.id] }))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const patch = (id: string, p: Patch) => {
    const base = f.events.find(e => e.id === id)!;
    const cur = { ...base, ...draft[id] };
    const next: Record<string, Patch> = { ...draft, [id]: { ...draft[id], ...p } };
    // Moving a screening's start shifts its end, and optionally its Q&A.
    if (p.start) {
      const delta = toMinutes(p.start) - toMinutes(cur.start);
      next[id].end = addMinutes(cur.end, delta);
      if (moveQa && base.kind === 'screening') {
        const qa = f.events.find(e => e.kind === 'qa' && e.filmId === base.filmId && e.start === base.end);
        if (qa) { const q = { ...qa, ...draft[qa.id] }; next[qa.id] = { ...draft[qa.id], start: addMinutes(q.start, delta), end: addMinutes(q.end, delta) }; }
      }
    }
    if (p.venueId && moveQa && base.kind === 'screening') {
      const qa = f.events.find(e => e.kind === 'qa' && e.filmId === base.filmId && e.start === base.end);
      if (qa) next[qa.id] = { ...draft[qa.id], venueId: p.venueId };
    }
    setDraft(next);
  };

  const save = async () => {
    setBusy(true);
    const newEvents = f.events.map(e => (draft[e.id] ? { ...e, ...draft[e.id] } : { ...e }));
    const r = await s.agent.onGridEdit(newEvents, user);
    setDraft({}); setEditing(null); setBusy(false);
    const asks = r.actions.filter(a => a.kind === 'notify_people' || a.kind === 'update_website').length;
    const auto = r.actions.filter(a => a.kind === 'update_brief' || a.kind === 'notify_staff').length;
    const flags = r.actions.filter(a => a.kind === 'flag').length;
    setResult(`${r.changes.length} change(s). ${auto} internal update(s) sent, ${asks} item(s) waiting for approval, ${flags} flag(s).`);
    s.commit();
  };

  const dirty = Object.keys(draft).length;
  return (
    <div className="card">
      <PhotoBand k="change" label="Schedule changes" />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Schedule grid</h2>
        <div className="row">
          {festivalDays(f).map(d => (
            <button key={d} className={d === day ? 'primary small' : 'small'} onClick={() => setDay(d)}>Day {d} · {f.dates[d].slice(5)}</button>
          ))}
        </div>
      </div>
      <p className="muted">Edit like staff would in the sheet, then save. The agent diffs the grid and works out who is affected.</p>
      <div className="row" style={{ marginBottom: 8 }}>
        <label className="row"><input type="checkbox" checked={moveQa} onChange={e => setMoveQa(e.target.checked)} /> Move a screening's Q&A with it</label>
        <button className="primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Running agent…' : `Save grid${dirty ? ` (${dirty} edited)` : ''}`}</button>
        {dirty > 0 && <button onClick={() => setDraft({})}>Discard</button>}
      </div>
      {result && <div className="msg" style={{ borderColor: 'var(--ok)' }}>{result} See Approvals and Flags.</div>}
      {s.agent.changeFeed.length > 0 && (
        <details className="recent">
          <summary>Recent changes ({s.agent.changeFeed.length})</summary>
          {[...s.agent.changeFeed].reverse().slice(0, 8).map((c, i) => (
            <div className="item" key={i}><div className="ic info"><Icon name="calendar" size={16} /></div><div className="d">{c}</div></div>
          ))}
        </details>
      )}
      <div className="scroll">
        <table className="stackable">
          <thead><tr><th>Time</th><th>Event</th><th>Venue</th><th>Guests</th><th></th></tr></thead>
          <tbody>
            {events.map(e => (
              <tr key={e.id} className={draft[e.id] ? 'changed' : ''}>
                <td className="t-time" style={{ whiteSpace: 'nowrap' }}>{fmt(e.start)}–{fmt(e.end)}</td>
                <td className={e.status === 'cancelled' ? 'cancelled' : ''}>
                  {e.title} <span className="chip">{e.kind}</span>{e.restriction && <> <span className="chip warn">{e.restriction.replace('_', ' ')}</span></>}
                  {editing === e.id && (
                    <div className="stack" style={{ marginTop: 8 }}>
                      <label className="row">Start <input type="time" value={e.start.slice(11)} onChange={x => x.target.value && patch(e.id, { start: `${e.start.slice(0, 11)}${x.target.value}` })} /></label>
                      <label className="row">Venue <select value={e.venueId} onChange={x => patch(e.id, { venueId: x.target.value })}>
                        {f.venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
                      <label className="row">Guests <select multiple size={4} value={e.guestIds} onChange={x => patch(e.id, { guestIds: [...x.target.selectedOptions].map(o => o.value) })}>
                        {guests.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
                      <div className="row">
                        <button className="small" onClick={() => patch(e.id, { status: e.status === 'cancelled' ? 'scheduled' : 'cancelled' })}>{e.status === 'cancelled' ? 'Restore' : 'Cancel event'}</button>
                      </div>
                    </div>
                  )}
                </td>
                <td data-label="Venue">{venue(e.venueId)}</td>
                <td data-label={e.guestIds.length ? 'Guests' : undefined}>{e.guestIds.map(g => person(g)?.name).join(', ')}</td>
                <td><button className="small" onClick={() => setEditing(editing === e.id ? null : e.id)}>{editing === e.id ? 'Done' : 'Edit'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Approvals
export function Approvals({ s, user }: P) {
  const { person } = useLookups(s);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const items = [...s.agent.queue].reverse();
  const pending = items.filter(q => q.status === 'pending');
  const done = items.filter(q => q.status !== 'pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const act = (id: string, ok: boolean) => { const n = notes[id]?.trim() || undefined; ok ? s.agent.approve(id, user, n) : s.agent.reject(id, user, n); s.commit(); };
  // Decision memory: what the team did last time with this kind of action.
  const memo = (q: { action: { id: string; kind: string } }) => {
    const past = s.agent.pastDecisions?.(q.action) ?? [];
    if (!past.length) return null;
    const last = past[0];
    const rejected = past.filter(d => d.status === 'rejected').length;
    const noted = past.find(d => d.note);
    return <div className="memo muted" style={{ fontSize: 13, borderLeft: '3px solid var(--line, #d8ccb6)', paddingLeft: 8, margin: '6px 0' }}>
      Last time: {last.by} {last.status} “{last.title}” on {fmt(last.at)}.
      {rejected > 1 && <> {rejected} of the last {past.length} like this were rejected.</>}
      {noted && <> Note: “{noted.note}”</>}
    </div>;
  };
  return (
    <div className="stack">
      <div className="card">
        <h2>Waiting for approval ({pending.length})</h2>
        {pending.length === 0 && <p className="muted">Nothing waiting.</p>}
        {pending.map(q => {
          const msgs = q.action.messages ?? [];
          const shown = open[q.action.id] ? msgs : msgs.slice(0, 2);
          return (
            <div key={q.action.id} className="card" style={{ marginBottom: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{q.action.title}</strong>
                <span className="chip">{q.action.kind.replace('_', ' ')}</span>
              </div>
              <p className="muted">{q.action.rationale}</p>
              {memo(q)}
              {shown.map((m, i) => {
                const rec = (m as { recommendation?: Recommendation }).recommendation;
                return (
                  <div className="msg" key={i}>
                    <div className="who">{person(m.personId)?.name} · {person(m.personId)?.role} · {m.channel.replace('_', ' ')}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    {rec && rec.basis.length > 0 && <div className="who">Why: {rec.basis.join('; ')}</div>}
                  </div>
                );
              })}
              {msgs.length > 2 && <button className="small" onClick={() => setOpen({ ...open, [q.action.id]: !open[q.action.id] })}>{open[q.action.id] ? 'Show fewer' : `Show all ${msgs.length}`}</button>}
              <input placeholder="Note for next time (optional)" value={notes[q.action.id] ?? ''} onChange={e => setNotes({ ...notes, [q.action.id]: e.target.value })} style={{ marginTop: 8, width: '100%' }} />
              <div className="row approve-row" style={{ marginTop: 8 }}>
                <button className="primary" onClick={() => act(q.action.id, true)}>Approve and send{msgs.length > 1 ? ` (${msgs.length})` : ''}</button>
                <button onClick={() => act(q.action.id, false)}>Reject</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="card">
        <h2>Decided</h2>
        {done.length === 0 && <p className="muted">None yet.</p>}
        {done.map(q => (
          <div className="msg" key={q.action.id}>
            <span className={`chip ${q.status === 'rejected' ? 'bad' : 'ok'}`}>{q.status === 'rejected' ? 'rejected' : 'sent'}</span> {q.action.title}
            <div className="who">by {q.decidedBy} at {q.decidedAt && fmt(q.decidedAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Door scan
export function Scan({ s }: P) {
  const f = s.agent.f;
  const { venue } = useLookups(s);
  const day = dayOf(s.clock, f.dates);
  const dayEvents = f.events.filter(e => e.day === day);
  const [type, setType] = useState<PassType>('three_day');
  const holders = f.passes.filter(p => p.type === type).map(p => f.people.find(x => x.id === p.personId)!);
  const [pid, setPid] = useState(holders[0]?.id ?? '');
  const [eid, setEid] = useState(dayEvents[0]?.id ?? '');
  const [res, setRes] = useState<ScanResult | null>(null);
  const [rush, setRush] = useState(60);

  const scan = () => { setRes(s.agent.onScan(qrFor(pid), eid, s.clock)); s.commit(); };
  const doorRush = () => {
    const ev = f.events.find(e => e.id === eid);
    if (!ev) return;
    let n = 0;
    for (const p of f.people) {
      if (n >= rush) break;
      const r = s.agent.onScan(qrFor(p.id), eid, s.clock);
      if (r.allowed) n++;
    }
    setRes({ allowed: true, reason: `${n} people admitted to "${ev.title}". See the crowd view on Overview.` });
    s.commit();
  };
  return (
    <div className="grid2">
      <div className="card stack">
        <h2>Door scan (volunteer mode)</h2>
        <p className="muted">Each person has one QR code covering their pass and every extra ticket. Time is the festival clock ({fmt(s.clock)}).</p>
        <label className="row">Pass type <select value={type} onChange={e => { const t = e.target.value as PassType; setType(t); setPid(f.passes.find(p => p.type === t)!.personId); }}>
          {(Object.keys(PASS_LABELS) as PassType[]).map(t => <option key={t} value={t}>{PASS_LABELS[t]}</option>)}</select></label>
        <label className="row">Holder <select value={pid} onChange={e => setPid(e.target.value)}>
          {holders.map(h => {
            const pass = f.passes.find(p => p.personId === h.id)!;
            const tix = f.tickets.filter(t => t.personId === h.id).length;
            return <option key={h.id} value={h.id}>{h.name}{pass.validDays.length < 3 ? ` (day ${pass.validDays.join(',')})` : ''}{tix ? ` +${tix} ticket` : ''}</option>;
          })}</select></label>
        <label className="row">Event <select value={eid} onChange={e => setEid(e.target.value)}>
          {dayEvents.map(e => <option key={e.id} value={e.id}>{fmt(e.start)} {e.title} ({venue(e.venueId)})</option>)}</select></label>
        <div className="muted" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>QR: {pid && qrFor(pid)}</div>
        <div className="row"><button className="primary" onClick={scan}>Scan</button></div>
        <h3>Simulate a door rush</h3>
        <div className="row"><input type="number" min={1} max={400} value={rush} onChange={e => setRush(+e.target.value)} style={{ width: 80 }} /> <button onClick={doorRush}>Scan people in</button></div>
      </div>
      <div className="card">
        {res ? <div className={`scan ${res.allowed ? 'ok' : 'bad'}`}>{res.allowed ? 'ALLOW' : 'DENY'}<div style={{ fontSize: 14, fontWeight: 400, marginTop: 8 }}>{res.personName && <>{res.personName} · </>}{res.reason}</div></div>
          : <p className="muted">Scan a code to see green or red.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Briefs
/** A volunteer's live brief, laid out for a phone: the events at their door, any changes, then the handbook. */
export function BriefView({ s, personId }: { s: AgentStore; personId: string }) {
  const b = buildBrief(s.agent.f, personId, s.clock, s.agent.changeFeed);
  const allPasses = Object.keys(PASS_LABELS).length;
  if (!b.shift) return <div className="empty-note">{b.person.name}: no upcoming shift.</div>;
  return (
    <div className="brief-view">
      <div className="brief-head">{b.shift.task} · {b.venueName} · {fmt(b.shift.start)}–{fmt(b.shift.end)}</div>
      {b.events.length === 0 && <div className="muted">Nothing on at this venue during your shift.</div>}
      {b.events.map(({ event, admits, note }) => (
        <div className="brief-ev" key={event.id}>
          <span className="brief-time">{fmt(event.start)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="t">{event.title}{note && <span className="chip warn" style={{ marginLeft: 6 }}>{note}</span>}</div>
            {admits.length > 0 && <div className="d">{admits.length >= allPasses ? 'Admits every pass and badge' : `Admits: ${admits.join(', ')}`}</div>}
          </div>
        </div>
      ))}
      {b.changes.length > 0 && <div className="brief-changes"><h3>Changes since your shift was set</h3><ul>{b.changes.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
      {b.guidance.length > 0 && (
        <details className="brief-hand">
          <summary>Handbook for your role ({b.guidance.length})</summary>
          <ul>{b.guidance.map((g, i) => { const k = g.indexOf(': '); return <li key={i}>{k > 0 && k < 40 ? <><b>{g.slice(0, k)}.</b> {g.slice(k + 2)}</> : g}</li>; })}</ul>
        </details>
      )}
    </div>
  );
}

export function Briefs({ s }: P) {
  const f = s.agent.f;
  const vols = f.people.filter(p => p.role === 'volunteer');
  const [pid, setPid] = useState(vols[0].id);
  return (
    <div className="card stack">
      <h2>Live volunteer brief</h2>
      <p className="muted">Rebuilt from the current grid each time it's opened, with the handbook sections for the volunteer's role.</p>
      <label className="field">Volunteer <select value={pid} onChange={e => setPid(e.target.value)}>
        {vols.map(v => <option key={v.id} value={v.id}>{v.name} · {v.staffRole}</option>)}</select></label>
      <BriefView s={s} personId={pid} />
    </div>
  );
}

// ------------------------------------------------------------------ Ask
export function Ask({ s }: P) {
  const [q, setQ] = useState('Does a day pass get me into panels?');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ q: string; a: Answer }[]>([]);
  const ask = async () => {
    if (!q.trim()) return;
    setBusy(true);
    const a = await s.agent.onQuestion(q, 'dashboard');
    setHistory([{ q, a }, ...history]); setBusy(false); s.commit();
  };
  return (
    <div className="card stack">
      <h2>Ask the agent</h2>
      <p className="muted">Answers come only from the festival's official documents and schedule, with the source cited, or "I don't know".</p>
      <div className="row ask-row">
        <input style={{ flex: 1, minWidth: 220 }} aria-label="Your question" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} />
        <button className="primary" disabled={busy} onClick={ask}>{busy ? 'Thinking…' : 'Ask'}</button>
      </div>
      {history.map((h, i) => (
        <div className="msg" key={i}>
          <div className="who">{h.q}</div>
          <div>{h.a.text}</div>
          {h.a.known && <div className="who">Source: {[...new Set(h.a.citations.map(c => citeLabel(s.agent.f, c)))].join(' · ')}</div>}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Vendor feed & voting
const g12 = (iso: string) => `${new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} ${fmt(iso)}`;

export function Feeds({ s, go, user }: P) {
  const f = s.agent.f;
  const guests = f.people.filter(p => p.role === 'guest').sort((a, b) => (a.arrives ?? 'z').localeCompare(b.arrives ?? 'z'));
  const [gid, setGid] = useState(guests[0]?.id ?? '');
  const guest = guests.find(g => g.id === gid);
  const flightOf = (note = '') => /\b([A-Z0-9]{2}) ?(\d{1,4})\b/.exec(note)?.slice(1).join('') ?? '';
  const [flight, setFlight] = useState(flightOf(guest?.travelNote));
  const [arriveAt, setArriveAt] = useState(guest?.arrives ?? `${s.clock.slice(0, 10)}T09:30`);
  const [live, setLive] = useState<string | null>(null);
  const pickGuest = (id: string) => { const g = guests.find(x => x.id === id); setGid(id); setFlight(flightOf(g?.travelNote)); setArriveAt(g?.arrives ?? `${s.clock.slice(0, 10)}T09:30`); setLive(null); };
  const checkFlight = async () => {
    setLive('Checking…');
    const r = await fetch(`/api/flight?flight=${encodeURIComponent(flight)}`).then(x => x.json()).catch(() => ({ error: 'offline' }));
    if (!r.configured) { setLive('Live flight status isn’t connected (add FLIGHT_API_KEY in Vercel). Using the arrival time from your files.'); return; }
    if (r.error) { setLive(r.error); return; }
    if (!r.found) { setLive(`No live data for ${flight}. Test festivals use made-up flight numbers.`); return; }
    setArriveAt(r.estimated);
    setLive(`${r.flight} is ${r.status}, landing ${r.iata} ${fmt(r.estimated)}${r.delayMin ? ` (${r.delayMin} min late)` : ''}.`);
  };
  const [mins, setMins] = useState(45);
  const [filmId, setFilmId] = useState(f.films[0].id);
  const [eta, setEta] = useState('09:30');
  const [vEvent, setVEvent] = useState(f.events.find(e => e.kind === 'screening' && !e.restriction)!.id);
  const [note, setNote] = useState<string | null>(null);
  const date = s.clock.slice(0, 10);
  return (
    <>
    <WeatherCard s={s} go={go} user={user} />
    <div className="grid2" style={{ marginTop: 16 }}>
      <div className="card stack">
        <h2>Vendor and partner feeds</h2>
        <PhotoBand k="flight" label="Late flights" />
        <h3>Guest flights</h3>
        {guests.length === 0 ? <div className="empty-note">No guests in this festival.</div> : <>
        <label className="row">Guest <select value={gid} onChange={e => pickGuest(e.target.value)}>{guests.map(g => <option key={g.id} value={g.id}>{g.name}{g.arrives ? ` · lands ${g12(g.arrives)}` : ''}</option>)}</select></label>
        {guest?.arrives && <div className="muted">On file: lands {g12(guest.arrives)}{guest.travelNote ? ` · ${guest.travelNote}` : ''}</div>}
        <div className="row"><label className="row">Flight <input value={flight} onChange={e => setFlight(e.target.value.toUpperCase())} placeholder="UA512" style={{ width: 90 }} /></label>
          <button className="small" disabled={!flight} onClick={checkFlight}>Check live status</button></div>
        {live && <div className="muted">{live}</div>}
        <label className="row">Now lands <input type="datetime-local" value={arriveAt} onChange={e => setArriveAt(e.target.value)} /></label>
        <label className="row">Airport to venue <input type="number" value={mins} onChange={e => setMins(+e.target.value)} style={{ width: 70 }} /> min</label>
        <button onClick={() => { const a = s.agent.onFlightUpdate(gid, flight, arriveAt.slice(0, 16), mins); setNote(`${a.length} action(s): ${a.map(x => x.title).join('; ') || 'nothing at risk'}`); s.commit(); }}>Update arrival</button>
        </>}
        <h3>Print delivery delay</h3>
        <label className="row">Film <select value={filmId} onChange={e => setFilmId(e.target.value)}>{f.films.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
        <label className="row">New ETA <input type="time" value={eta} onChange={e => setEta(e.target.value)} /> on {date}</label>
        <button onClick={() => { const a = s.agent.onVendorAlert({ type: 'print_delay', filmId, newEta: `${date}T${eta}` }); setNote(`${a.length} action(s): ${a.map(x => x.title).join('; ') || 'nothing at risk'}`); s.commit(); }}>Send alert</button>
        {note && <div className="msg">{note}</div>}
      </div>
      <div className="card stack">
        <h2>Audience award voting (post-MVP)</h2>
        <p className="muted">The voting form goes only to people with an allowed check-in scan for that screening.</p>
        <label className="row">Screening <select value={vEvent} onChange={e => setVEvent(e.target.value)}>
          {f.events.filter(e => e.kind === 'screening' && !e.restriction).map(e => <option key={e.id} value={e.id}>{f.dates[e.day].slice(5)} {fmt(e.start)} {e.title}</option>)}</select></label>
        <button onClick={() => { const a = s.agent.proposeVoteForm(vEvent); setNote(a ? `${a.title}. Waiting for approval.` : 'Nobody has checked in to that screening yet.'); s.commit(); }}>Prepare voting form</button>
      </div>
    </div>
    </>
  );
}

// ------------------------------------------------------------------ Outbox & log
export function Log({ s }: P) {
  const { person } = useLookups(s);
  const [tab, setTab] = useState<'log' | 'outbox'>('log');
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <button className={tab === 'log' ? 'primary small' : 'small'} onClick={() => setTab('log')}>Audit log ({s.agent.log.entries.length})</button>
        <button className={tab === 'outbox' ? 'primary small' : 'small'} onClick={() => setTab('outbox')}>Delivered messages ({s.agent.outbox.length})</button>
      </div>
      <div className="scroll">
        {tab === 'log' ? (
          <table className="stackable"><thead><tr><th>#</th><th>Festival time</th><th>Step</th><th>What happened</th></tr></thead>
            <tbody>{[...s.agent.log.entries].reverse().slice(0, 300).map(e => (
              <tr key={e.seq}><td>{e.seq}</td><td style={{ whiteSpace: 'nowrap' }}>{e.at.includes('T') ? `${e.at.slice(5, 10)} ${fmt(e.at)}` : e.at}</td><td><span className="chip">{e.kind}</span></td><td>{e.summary}</td></tr>
            ))}</tbody></table>
        ) : (
          <table className="stackable"><thead><tr><th>To</th><th>Channel</th><th>Message</th></tr></thead>
            <tbody>{[...s.agent.outbox].reverse().slice(0, 300).map((d, i) => (
              <tr key={i}><td>{person(d.personId)?.name}<div className="muted">{person(d.personId)?.role}</div></td><td>{d.channel.replace('_', ' ')}</td><td style={{ whiteSpace: 'pre-wrap' }}>{d.body}</td></tr>
            ))}</tbody></table>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Evaluation
export function Evaluation({ s }: P) {
  const [res, setRes] = useState<SuiteResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card stack">
      <h2>Evaluation: the proposal's four tests</h2>
      <p className="muted">These tests check Usher itself, not your festival. They run on the built-in Harbor Lights sample day, without the model, so results are repeatable. Your festival and dashboard are not touched.</p>
      <div><button className="primary" disabled={busy} onClick={async () => { setBusy(true); setRes(await runAll(null)); setBusy(false); }}>{busy ? 'Running…' : 'Run all four'}</button></div>
      {res?.map(r => (
        <div key={r.suite} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{r.suite}</strong>
            <span className={`chip ${r.passed === r.total ? 'ok' : 'bad'}`}>{r.passed}/{r.total} · pass mark: {r.passMark}</span>
          </div>
          {r.cases.map(c => <div key={c.name} className="msg" style={{ borderColor: c.passed ? 'var(--ok)' : 'var(--bad)' }}><strong>{c.passed ? '✓' : '✗'} {c.name}</strong><div className="who">{c.detail}</div></div>)}
        </div>
      ))}
      <span className="muted" style={{ display: 'none' }}>{s.version}</span>
      <FuzzEval />
    </div>
  );
}

/** Beyond our own festival: 50 random festivals with problems planted on purpose. */
function FuzzEval() {
  const [r, setR] = useState<SuiteResult | null>(null);
  const [all, setAll] = useState(false);
  return (
    <div className="card stack">
      <h2>Stress test: 50 random festivals</h2>
      <p className="muted">Each one has different people, guests, tickets and times, with a double-booked guest, an oversold screening and a late flight planted on purpose. Usher should find all three every time and raise nothing else new.</p>
      <div><button onClick={() => setTimeout(() => setR(evalRandomFestivals(50)), 0)}>Run the stress test</button></div>
      {r && <>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>{r.passed} of {r.total} festivals clean</strong>
          <span className={`chip ${r.passed === r.total ? 'ok' : 'bad'}`}>{r.passMark}</span>
        </div>
        {(all ? r.cases : r.cases.filter(c => !c.passed).concat(r.cases.filter(c => c.passed).slice(0, 3))).map(c => <div key={c.name} className="msg" style={{ borderColor: c.passed ? 'var(--ok)' : 'var(--bad)' }}><strong>{c.passed ? '✓' : '✗'} {c.name}</strong><div className="who">{c.detail}</div></div>)}
        {!all && <button className="small" onClick={() => setAll(true)}>Show all {r.total}</button>}
      </>}
    </div>
  );
}

// ------------------------------------------------------------------ Data source
export function Data({ s }: P) {
  const fromSheet = s.sheet.source === 'sheet';
  const [url, setUrl] = useState(fromSheet ? s.sheet.sheet ?? '' : s.sheet.source === 'built-in' ? DEFAULT_SHEET : '');
  const isLink = /^https?:\/\//.test(url);
  const source = fromSheet ? 'Google Sheet' : s.sheet.source === 'onboarding' ? `Set up from ${s.sheet.sheet ?? 'your files'}` : 'Harbor Lights sample festival';
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (mode: 'replace' | 'sync') => { setBusy(mode); await s.loadSheet(url, mode); setBusy(null); };
  const f = s.agent.f;
  return (
    <div className="grid2">
      <div className="card stack">
        <h2>Festival data</h2>
        <p>Source: <strong>{source}</strong>
          {s.sheet.loadedAt && <span className="muted"> · last read {s.sheet.loadedAt}</span>}</p>
        <p className="muted">{fromSheet
          ? 'Staff keep the festival in a Google Sheet. The sheet must be shared as "anyone with the link can view". Edits made in this dashboard\'s grid are not written back to the sheet.'
          : 'To keep the festival in step with a Google Sheet instead, paste its link. The sheet must be shared as "anyone with the link can view". Loading it replaces what is loaded now.'}</p>
        <label className="stack"><span>Sheet link</span><input value={url} placeholder="Paste a Google Sheet link" onChange={e => setUrl(e.target.value)} /></label>
        <div className="row">
          <button className="primary" disabled={!!busy || !isLink} onClick={() => run('sync')}>{busy === 'sync' ? 'Checking…' : fromSheet ? 'Check sheet for changes' : 'Load from sheet'}</button>
          {s.sheet.source === 'sheet' && <button disabled={!!busy} onClick={() => run('replace')}>{busy === 'replace' ? 'Loading…' : 'Start over from sheet'}</button>}
          {isLink && <a href={url} target="_blank" rel="noreferrer">Open sheet</a>}
        </div>
        {s.sheet.message && <div className="msg" style={{ borderColor: s.sheet.errors.length ? 'var(--bad)' : 'var(--ok)' }}>{s.sheet.message}</div>}
        {s.sheet.errors.length > 0 && <div className="msg" style={{ borderColor: 'var(--bad)' }}>
          <strong>Fix these in the sheet, then try again:</strong>
          <ul>{s.sheet.errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul>
          {s.sheet.errors.length > 30 && <div className="muted">…and {s.sheet.errors.length - 30} more</div>}
        </div>}
        {s.sheet.warnings.length > 0 && <div className="msg" style={{ borderColor: 'var(--warn)' }}>
          <strong>Warnings</strong><ul>{s.sheet.warnings.slice(0, 15).map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      </div>
      <div className="card">
        <h2>What's loaded</h2>
        <table><tbody>
          <tr><td>Festival</td><td>{f.name}, {f.dates[1]} to {f.dates[festivalDays(f).at(-1)!]}</td></tr>
          <tr><td>Events</td><td>{f.events.length} ({f.events.filter(e => e.kind === 'screening').length} screenings, {f.events.filter(e => e.kind === 'panel').length} panels)</td></tr>
          <tr><td>Films</td><td>{f.films.length}</td></tr>
          <tr><td>Venues</td><td>{f.venues.length}</td></tr>
          <tr><td>People</td><td>{f.people.length} ({f.people.filter(p => p.role === 'guest').length} guests, {f.people.filter(p => p.role === 'volunteer').length} volunteers)</td></tr>
          <tr><td>Pass types in use</td><td>{new Set(f.passes.map(p => p.type)).size}</td></tr>
          <tr><td>Tickets</td><td>{f.tickets.length}</td></tr>
          <tr><td>Saved events</td><td>{f.bookings.length}</td></tr>
          <tr><td>Volunteer shifts</td><td>{f.shifts.length}</td></tr>
          <tr><td>Official documents</td><td>{f.docs.length} ({f.docs.reduce((n, d) => n + d.sections.length, 0)} sections)</td></tr>
        </tbody></table>
      </div>
    </div>
  );
}
