// The four evaluation tests from the proposal, on a scripted festival day.
//   5 schedule changes  → the right people get each update, none to the wrong person
//   3 planted clashes   → each clash is flagged
//   20 QR scans         → each allow or deny is correct
//   10 questions        → from official documents, or "I don't know"

import type { Festival, FestivalEvent } from '../core/types';
import { buildFestival } from '../data/seed';
import { FestivalAgent } from '../agent/agent';
import { addMinutes } from '../core/time';
import { qrFor } from '../rules/access';
import { IDK } from '../agent/answer';
import type { LlmClient } from '../llm/ollama';

export interface CaseResult { name: string; passed: boolean; detail: string }
export interface SuiteResult { suite: string; passMark: string; passed: number; total: number; cases: CaseResult[] }

const fixedNow = () => '2027-04-15T09:00';

function edit(f: Festival, patch: Record<string, Partial<FestivalEvent>>): FestivalEvent[] {
  return f.events.map(e => (patch[e.id] ? { ...e, ...patch[e.id] } : { ...e }));
}

// ---------------------------------------------------------------- 1. changes
export async function evalScheduleChanges(): Promise<SuiteResult> {
  const cases: { name: string; patch: (f: Festival) => Record<string, Partial<FestivalEvent>>; target: string }[] = [
    { name: 'Screening and its Q&A start an hour later', target: 'e-001', patch: f => {
      const s = f.events.find(e => e.id === 'e-001')!, q = f.events.find(e => e.id === 'e-002')!;
      return { 'e-001': { start: addMinutes(s.start, 60), end: addMinutes(s.end, 60) }, 'e-002': { start: addMinutes(q.start, 60), end: addMinutes(q.end, 60) } };
    } },
    { name: 'Screening moves from Canal Street to Riverside', target: 'e-034', patch: () => ({ 'e-034': { venueId: 'v-river' } }) },
    { name: 'Screening is cancelled', target: 'e-023', patch: () => ({ 'e-023': { status: 'cancelled' } }) },
    { name: 'Panel swaps one guest', target: 'e-055', patch: f => ({ 'e-055': { guestIds: f.events.find(e => e.id === 'e-055')!.guestIds.map(g => g === 'p-085' ? 'p-081' : g) } }) },
    { name: 'Screening and Q&A pushed back 30 minutes', target: 'e-013', patch: f => {
      const s = f.events.find(e => e.id === 'e-013')!, q = f.events.find(e => e.id === 'e-014')!;
      return { 'e-013': { start: addMinutes(s.start, 30), end: addMinutes(s.end, 30) }, 'e-014': { start: addMinutes(q.start, 30), end: addMinutes(q.end, 30) } };
    } },
  ];
  const results: CaseResult[] = [];
  for (const c of cases) {
    const f = buildFestival();
    const before = f.events.find(e => e.id === c.target)!;
    const patch = c.patch(f);
    // Expected audience, written out plainly from the records:
    const changedIds = Object.keys(patch);
    const expected = new Set<string>();
    for (const id of changedIds) {
      const ev = f.events.find(e => e.id === id)!;
      f.tickets.filter(t => t.eventId === id).forEach(t => expected.add(t.personId));
      f.bookings.filter(b => b.eventId === id).forEach(b => expected.add(b.personId));
      ev.guestIds.forEach(g => expected.add(g));
      (patch[id].guestIds ?? []).forEach(g => expected.add(g));
      if (ev.kind === 'qa') {
        const scr = f.events.find(e => e.kind === 'screening' && e.filmId === ev.filmId && e.end === ev.start);
        if (scr) f.tickets.filter(t => t.eventId === scr.id).forEach(t => expected.add(t.personId));
      }
    }
    const touchesFloor = changedIds.some(id => ['start', 'venueId', 'status'].some(k => k in patch[id]));
    const agent = new FestivalAgent(f, null, fixedNow);
    const { actions } = await agent.onGridEdit(edit(f, patch));
    const notify = actions.filter(a => a.kind === 'notify_people').flatMap(a => a.messages ?? []);
    const got = new Set(notify.map(m => m.personId));
    const missing = [...expected].filter(p => !got.has(p));
    const wrong = [...got].filter(p => !expected.has(p));
    const vols = new Set(actions.filter(a => a.kind === 'update_brief').flatMap(a => a.messages ?? []).map(m => m.personId));
    const venues = new Set([before.venueId, ...(patch[c.target].venueId ? [patch[c.target].venueId!] : [])]);
    const wrongVols = [...vols].filter(v => !f.shifts.some(s => s.personId === v && venues.has(s.venueId) && s.day === before.day));
    const allQueued = actions.filter(a => a.kind === 'notify_people').every(a => agent.queue.some(q => q.action.id === a.id && q.status === 'pending'));
    const hasRecs = notify.every(m => (m as { recommendation?: unknown }).recommendation);
    const volsOk = touchesFloor ? vols.size > 0 && wrongVols.length === 0 : vols.size === 0;
    const passed = missing.length === 0 && wrong.length === 0 && volsOk && allQueued && hasRecs;
    results.push({ name: c.name, passed,
      detail: `${got.size} audience/guests notified (expected ${expected.size}), ${vols.size} volunteers briefed${missing.length ? `, missing ${missing.join(',')}` : ''}${wrong.length ? `, wrong ${wrong.join(',')}` : ''}${wrongVols.length ? `, wrong volunteers ${wrongVols.join(',')}` : ''}${allQueued ? '' : ', not queued for approval'}${hasRecs ? '' : ', missing recommendation'}` });
  }
  return { suite: '5 schedule changes', passMark: 'All 5, none to the wrong person', passed: results.filter(r => r.passed).length, total: results.length, cases: results };
}

// ---------------------------------------------------------------- 2. clashes
export async function evalGuestClashes(): Promise<SuiteResult> {
  const planted: { name: string; patch: (f: Festival) => Record<string, Partial<FestivalEvent>>; guest: string; events: [string, string] }[] = [
    { name: 'Director added to a panel during their own screening', guest: 'p-077', events: ['e-013', 'e-055'],
      patch: f => ({ 'e-055': { guestIds: [...f.events.find(e => e.id === 'e-055')!.guestIds, 'p-077'] } }) },
    { name: 'Panel ends 25 min before a screening 35 min away', guest: 'p-078', events: ['e-056', 'e-015'],
      patch: f => ({ 'e-056': { guestIds: [...f.events.find(e => e.id === 'e-056')!.guestIds, 'p-078'] } }) },
    { name: 'Panel moved on top of another panel sharing a guest', guest: 'p-083', events: ['e-054', 'e-055'],
      patch: () => ({ 'e-055': { start: '2027-04-15T11:30', end: '2027-04-15T12:30' } }) },
  ];
  const results: CaseResult[] = [];
  for (const c of planted) {
    const f = buildFestival();
    const agent = new FestivalAgent(f, null, fixedNow);
    const baseline = agent.sweepClashes().length;
    await agent.onGridEdit(edit(f, c.patch(f)));
    const hit = agent.flags.find(a => {
      const k = a.payload as { guestId?: string; a?: FestivalEvent; b?: FestivalEvent } | undefined;
      return k?.guestId === c.guest && !!k.a && !!k.b && new Set([k.a.id, k.b.id]).has(c.events[0]) && new Set([k.a.id, k.b.id]).has(c.events[1]);
    });
    results.push({ name: c.name, passed: baseline === 0 && !!hit, detail: hit ? hit.rationale : `not flagged (baseline clashes: ${baseline})` });
  }
  return { suite: '3 planted guest clashes', passMark: '3 of 3', passed: results.filter(r => r.passed).length, total: results.length, cases: results };
}

// ---------------------------------------------------------------- 3. scans
export function evalScans(): SuiteResult {
  const f = buildFestival();
  const agent = new FestivalAgent(f, null, fixedNow);
  const ticketOf = (pid: string) => f.tickets.find(t => t.personId === pid)!.eventId;
  const startOf = (eid: string) => f.events.find(e => e.id === eid)!.start;
  const p124Ticket = ticketOf('p-124');
  // [label, person, event, time, expected]
  const scans: [string, string, string, string, boolean][] = [
    ['3-day pass → screening', 'p-086', 'e-001', '2027-04-15T09:55', true],
    ['3-day pass → panel', 'p-086', 'e-054', '2027-04-15T10:55', true],
    ['3-day pass → industry market', 'p-086', 'e-064', '2027-04-15T09:05', false],
    ['Day pass (day 1) → day 1 screening', 'p-106', 'e-028', '2027-04-15T09:50', true],
    ['Day pass (day 2) → day 1 screening', 'p-107', 'e-028', '2027-04-15T09:51', false],
    ['Day pass → panel', 'p-106', 'e-054', '2027-04-15T10:56', false],
    ['Single ticket → its screening', 'p-124', p124Ticket, addMinutes(startOf(p124Ticket), -5), true],
    ['Single ticket → a different screening', 'p-124', p124Ticket === 'e-045' ? 'e-028' : 'e-045', '2027-04-15T09:52', false],
    ['VIP → filmmaker reception', 'p-139', 'e-065', '2027-04-15T19:55', true],
    ['Industry badge → market', 'p-145', 'e-064', '2027-04-15T09:00', true],
    ['Press badge → press screening', 'p-155', 'e-051', '2027-04-15T07:55', true],
    ['Industry badge → press screening', 'p-145', 'e-051', '2027-04-15T07:56', false],
    ['Panelist → own panel', 'p-081', 'e-054', '2027-04-15T10:50', true],
    ['Featured filmmaker → market', 'p-071', 'e-064', '2027-04-15T09:10', true],
    ['Volunteer → venue of current shift', 'p-011', 'e-040', '2027-04-15T15:10', true],
    ['Volunteer → venue, off shift', 'p-011', 'e-028', '2027-04-15T09:50', false],
    ['Festival staff → press screening', 'p-001', 'e-051', '2027-04-15T08:30', true],
    ['3-day pass → 20 min after start', 'p-088', 'e-001', '2027-04-15T10:20', false],
    ['3-day pass → first scan', 'p-087', 'e-001', '2027-04-15T09:58', true],
    ['Same pass scanned twice', 'p-087', 'e-001', '2027-04-15T09:59', false],
  ];
  const cases = scans.map(([label, pid, eid, at, expect]) => {
    const r = agent.onScan(qrFor(pid), eid, at);
    return { name: label, passed: r.allowed === expect, detail: `${r.allowed ? 'ALLOW' : 'DENY'}: ${r.reason}` };
  });
  return { suite: '20 QR scans across pass types', passMark: '20 of 20', passed: cases.filter(c => c.passed).length, total: cases.length, cases };
}

// ---------------------------------------------------------------- 4. questions
export async function evalQuestions(llm: LlmClient | null = null): Promise<SuiteResult> {
  const f = buildFestival();
  const agent = new FestivalAgent(f, llm, fixedNow);
  const film = f.films[0];
  const qs: [string, string | null][] = [
    ['Does a day pass get me into panels?', 'doc-access#Day pass'],
    ['Can a volunteer give me a refund?', 'doc-faq#Refunds'],
    ['Where is the box office and when is it open?', 'doc-faq#Box office'],
    ['Which venues have hearing loops?', 'doc-faq#Accessibility'],
    ['How often does the shuttle run between venues?', 'doc-venues#Shuttle'],
    ['Can I come in late to a screening?', 'doc-access#Late entry'],
    ['Where are the press screenings held?', 'doc-venues#Riverside Studio'],
    [`When is ${film.title} showing?`, 'grid'],
    ['Can I bring my dog?', null],
    ['Who won the jury prize last year?', null],
  ];
  const cases: CaseResult[] = [];
  for (const [q, ref] of qs) {
    const a = await agent.onQuestion(q);
    const passed = ref === null ? !a.known && a.text === IDK
      : a.known && a.citations.some(c => c === ref || c.startsWith(`${ref}#`));
    cases.push({ name: q, passed, detail: `${a.known ? `[${a.citations.join(', ')}]` : '(I don\'t know)'} ${a.text}` });
  }
  return { suite: '10 questions about the festival', passMark: '10 of 10', passed: cases.filter(c => c.passed).length, total: cases.length, cases };
}

export async function runAll(llm: LlmClient | null = null): Promise<SuiteResult[]> {
  return [await evalScheduleChanges(), await evalGuestClashes(), evalScans(), await evalQuestions(llm)];
}
