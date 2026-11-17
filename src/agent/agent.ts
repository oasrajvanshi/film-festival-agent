// The agent loop: Trigger → Understand → Decide → Act or ask → Log.
// Public or outbound actions wait in the approval queue.

import type { Festival, FestivalEvent } from '../core/types';
import type { LlmClient } from '../llm/ollama';
import { AuditLog } from './log';
import { clock } from '../core/time';
import { gateFor, type Action, type QueueItem } from './approvals';
import { diffSchedules, planPropagation, describeChange } from './propagate';
import { findGuestClashes, findOrphanedQas, otherFlags } from './conflicts';
import { recordScan, type ScanResult } from '../rules/access';
import { answerQuestion, type Answer } from './answer';
import { handleVendorAlert, type VendorAlert } from './vendors';
import { planVoteForm } from './voting';
import { buildBrief, briefText } from './briefs';
import { suggestRedirects, venueView } from './crowd';
import { polishMessages } from './phrase';
import { checkArrival, dayAt, lateGuests, welcomeNote, type ArrivalResult } from './presence';
import { assessWeather, planWeather, riskSummary, type WeatherHour, type WeatherRisk } from './weather';

/** What a person decided before, so the agent can remind them next time. */
export interface Decision { actionId: string; kind: string; title: string; status: 'approved' | 'rejected'; by: string; at: string; note?: string; recipients: number }

export interface Delivery { actionId: string; personId: string; channel: string; subject: string; body: string; at: string }

export interface SortedFlag { id: string; title: string; by: string; at: string; how: string }

export class FestivalAgent {
  log: AuditLog;
  queue: QueueItem[] = [];
  outbox: Delivery[] = [];
  flags: Action[] = [];
  /** Flags a person has sorted out. Their ids are never raised again. */
  sorted: SortedFlag[] = [];
  changeFeed: string[] = [];
  memory: Decision[] = [];
  private runs = 0;

  constructor(public f: Festival, private llm: LlmClient | null = null, private now: () => string = () => new Date().toISOString()) {
    this.log = new AuditLog(now);
  }

  private run(kind: string) { return `run-${++this.runs}-${kind}`; }

  /** Gate and either run or queue each action. */
  private dispatch(runId: string, actions: Action[]) {
    for (const a of actions) {
      const gate = gateFor(a);
      if (gate === 'auto') {
        this.log.add(runId, 'act', a.title, { actionId: a.id, kind: a.kind });
        this.execute(a);
      } else if (gate === 'needs_approval') {
        this.queue.push({ action: a, runId, status: 'pending' });
        this.log.add(runId, 'ask', `Approval needed: ${a.title}`, { actionId: a.id, kind: a.kind, recipients: a.messages?.length ?? 0 });
      } else {
        this.log.add(runId, 'error', `Blocked by policy: ${a.title}`, { actionId: a.id });
      }
    }
  }

  private execute(a: Action) {
    if (a.kind === 'flag') {
      // A flag someone already sorted out, or one already showing, is not raised again.
      if (!this.sorted.some(x => x.id === a.id) && !this.flags.some(x => x.id === a.id)) this.flags.push(a);
      return;
    }
    if (a.kind === 'update_website') {
      const p = a.payload as { after: FestivalEvent | null };
      this.changeFeed.push(`Website updated: ${a.rationale}`);
      void p;
    }
    for (const m of a.messages ?? []) {
      this.outbox.push({ actionId: a.id, personId: m.personId, channel: m.channel, subject: m.subject, body: m.body, at: this.now() });
    }
  }

  // --- Triggers ---------------------------------------------------------

  /** A schedule-grid edit: staff saved a new version of the grid. */
  async onGridEdit(newEvents: FestivalEvent[], editedBy = 'staff') {
    const runId = this.run('grid');
    const changes = diffSchedules(this.f.events, newEvents);
    this.log.add(runId, 'trigger', `Grid edited by ${editedBy}: ${changes.length} change(s)`, { changes: changes.map(c => ({ id: c.eventId, fields: c.fields })) });
    // Plan against the old state for "who was affected", then commit the new grid.
    const planned: Action[] = [];
    for (const c of changes) {
      const desc = describeChange(this.f, c);
      this.log.add(runId, 'understand', desc, { eventId: c.eventId });
      planned.push(...planPropagation(this.f, c));
      this.changeFeed.push(desc);
    }
    const clashesBefore = new Set(findGuestClashes(this.f).map(k => `${k.guestId}|${k.a.id}|${k.b.id}`));
    const flagsBefore = new Set(otherFlags(this.f).map(k => k.id));
    this.f.events = newEvents;
    for (const k of findGuestClashes(this.f)) {
      if (clashesBefore.has(`${k.guestId}|${k.a.id}|${k.b.id}`)) continue;
      planned.push({ id: `clash-${k.guestId}-${k.a.id}-${k.b.id}`, kind: 'flag', title: `Guest clash: ${k.guestName}`, rationale: k.summary, payload: k });
    }
    for (const k of otherFlags(this.f)) {
      if (flagsBefore.has(k.id)) continue;
      planned.push({ ...k, kind: 'flag' });
    }
    for (const q of findOrphanedQas(this.f)) {
      planned.push({ id: `orphan-${q.id}`, kind: 'flag', title: `Q&A left behind: ${q.title}`, rationale: 'Its screening moved but the Q&A did not.', payload: { eventId: q.id } });
    }
    // One step: merge every outbound notice from this edit into one bundle,
    // one message per person, for a single approval.
    const notices = planned.filter(a => a.kind === 'notify_people');
    if (notices.length > 1) {
      const byPerson = new Map<string, NonNullable<Action['messages']>[number]>();
      for (const m of notices.flatMap(a => a.messages ?? [])) {
        const prev = byPerson.get(m.personId);
        // Keep the first change's one-line subject; say how many more are in the message.
        const more = prev ? Number(/ \+ (\d+) more$/.exec(prev.subject)?.[1] ?? 0) + 1 : 0;
        byPerson.set(m.personId, prev ? { ...prev, subject: `${prev.subject.replace(/ \+ \d+ more$/, '')} + ${more} more`, body: `${prev.body}\n\n${m.body}` } : m);
      }
      const merged: Action = { id: `notify-${runId}`, kind: 'notify_people', title: `Notify ${byPerson.size} affected people`,
        rationale: notices.map(a => a.rationale).join(' '), messages: [...byPerson.values()] };
      planned.splice(0, planned.length, merged, ...planned.filter(a => a.kind !== 'notify_people'));
    }
    const listings = planned.filter(a => a.kind === 'update_website');
    if (listings.length > 1) {
      const merged: Action = { id: `web-${runId}`, kind: 'update_website', title: `Update ${listings.length} public listings`,
        rationale: listings.map(a => a.rationale).join(' '), payload: listings.map(a => a.payload) };
      const at = planned.indexOf(listings[0]);
      const rest = planned.filter(a => a.kind !== 'update_website');
      rest.splice(at, 0, merged);
      planned.splice(0, planned.length, ...rest);
    }
    for (const a of planned) if (a.messages && this.llm) a.messages = await polishMessages(this.llm, a.messages);
    this.log.add(runId, 'decide', `${planned.length} action(s) planned`, { actions: planned.map(a => ({ id: a.id, kind: a.kind, gate: gateFor(a) })) });
    this.dispatch(runId, planned);
    return { runId, changes, actions: planned };
  }

  /**
   * The Google Sheet changed. Reference data (people, passes, tickets, shifts,
   * documents...) is replaced first, then the schedule grid goes through the
   * normal grid-edit run so the right people hear about changes.
   */
  async onSheetSync(next: Festival, by = 'Google Sheet') {
    const runId = this.run('sync');
    this.log.add(runId, 'trigger', `Sheet sync from ${by}`);
    const { events, checkIns: _c, arrivals: _a, ...rest } = next;
    void _c; void _a;
    Object.assign(this.f, rest);
    return this.onGridEdit(events, by);
  }

  /** Full clash sweep, e.g. on load. */
  sweepClashes() {
    const runId = this.run('sweep');
    const clashes = findGuestClashes(this.f);
    this.log.add(runId, 'trigger', 'Clash sweep');
    this.dispatch(runId, [
      ...clashes.map(k => ({ id: `clash-${k.guestId}-${k.a.id}-${k.b.id}`, kind: 'flag' as const, title: `Guest clash: ${k.guestName}`, rationale: k.summary, payload: k })),
      ...otherFlags(this.f).map(k => ({ ...k, kind: 'flag' as const })),
    ]);
    this.sweepPresence();
    return clashes;
  }

  /**
   * Flag guests who are on soon but haven't been scanned in, and clear those
   * flags by themselves once the guest arrives or the event is over.
   */
  sweepPresence(at = this.now()) {
    const late = lateGuests(this.f, at);
    const still = new Set(late.map(k => k.id));
    for (const fl of this.flags.filter(x => x.id.startsWith('noshow-') && !still.has(x.id))) {
      const g = (fl.payload as { guestId?: string } | undefined)?.guestId;
      const arr = (this.f.arrivals ?? []).find(a => a.personId === g && a.day === dayAt(this.f, at));
      this.resolveFlag(fl.id, 'Usher', arr ? `Arrived at ${clock(arr.at)}` : 'Event is over');
    }
    const fresh = late.filter(k => !this.flags.some(x => x.id === k.id) && !this.sorted.some(x => x.id === k.id));
    if (fresh.length) this.dispatch(this.run('presence'), fresh.map(k => ({ ...k, kind: 'flag' as const })));
  }

  /**
   * Someone's QR was scanned at a venue entrance. The first scan of the day is
   * their arrival: it's recorded, guests and vendors get a welcome note with
   * what they have next, and any "not here yet" flag for them clears.
   */
  onArrival(qr: string, venueId: string, at: string, scannedBy = 'door'): ArrivalResult {
    const runId = this.run('arrival');
    const res = checkArrival(this.f, qr, at);
    const day = dayAt(this.f, at);
    const id = qr.trim().split('.')[1];
    if (res.allowed && day != null && res.kind) {
      const list = (this.f.arrivals ??= []);
      list.push({ id: `a-${day}-${id}-${at.slice(11, 16).replace(':', '')}-${list.length + 1}`, personId: id, kind: res.kind, day, venueId, at, by: scannedBy, reentry: !!res.reentry });
      const note = res.reentry ? null : welcomeNote(this.f, id, res.kind, venueId, res.next);
      if (note) this.outbox.push({ actionId: `arrive-${day}-${id}`, personId: id, channel: 'app_push', subject: note.subject, body: note.body, at });
    }
    this.log.add(runId, 'act', `${res.allowed ? (res.reentry ? 'BACK IN' : 'ARRIVED') : 'DENY'} ${res.personName ?? 'unknown'} at ${venueId}: ${res.reason}`, { scannedBy, at });
    this.sweepPresence(at);
    return res;
  }

  onScan(qr: string, eventId: string, at: string, scannedBy = 'volunteer'): ScanResult {
    const runId = this.run('scan');
    const res = recordScan(this.f, qr, eventId, at);
    this.log.add(runId, 'act', `${res.allowed ? 'ALLOW' : 'DENY'} ${res.personName ?? 'unknown'} at ${eventId}: ${res.reason}`, { scannedBy, at });
    return res;
  }

  async onQuestion(question: string, askedBy = 'anonymous'): Promise<Answer> {
    const runId = this.run('question');
    this.log.add(runId, 'trigger', `Question from ${askedBy}`, { question });
    const ans = await answerQuestion(this.f, question, this.llm);
    this.log.add(runId, 'act', ans.known ? 'Answered' : "Said I don't know", { answer: ans.text, citations: ans.citations, via: ans.via });
    return ans;
  }

  onVendorAlert(alert: VendorAlert) {
    const runId = this.run('vendor');
    this.log.add(runId, 'trigger', `Vendor feed: ${alert.type}`, alert);
    const actions = handleVendorAlert(this.f, alert);
    this.log.add(runId, 'decide', `${actions.length} action(s)`, actions.map(a => a.id));
    this.dispatch(runId, actions);
    return actions;
  }

  /**
   * A guest's flight changed (live flight status or someone on the phone).
   * Their arrival time is updated, the usual delay actions are drafted, and
   * any appearance they can no longer make is flagged.
   */
  onFlightUpdate(guestId: string, flight: string, newArrival: string, arrivalVenueMin: number) {
    const guest = this.f.people.find(p => p.id === guestId);
    if (!guest) return [];
    const before = new Set(this.flags.map(fl => fl.id));
    guest.arrives = newArrival;
    if (flight && !(guest.travelNote ?? '').includes(flight)) guest.travelNote = guest.travelNote ? `${flight}, ${guest.travelNote}` : flight;
    const actions = this.onVendorAlert({ type: 'flight_delay', guestId, flight: flight || 'their flight', newArrival, arrivalVenueMin });
    const late = otherFlags(this.f).filter(k => k.id.startsWith(`arrival-${guestId}-`) && !before.has(k.id));
    this.dispatch(this.run('flight'), late.map(k => ({ ...k, kind: 'flag' as const })));
    return [...actions, ...late];
  }

  /** A weather forecast arrived (live or a demo scenario). Only new risk windows produce actions. */
  async onWeather(hours: WeatherHour[], source: string) {
    const runId = this.run('weather');
    const risks = assessWeather(hours);
    this.log.add(runId, 'trigger', `Weather forecast from ${source}: ${hours.length} hours`, { risks: risks.map(riskSummary) });
    const seen = new Set(this.flags.map(fl => (fl.payload as { risk?: WeatherRisk } | undefined)?.risk).filter(Boolean).map(r => `${r!.hazard}|${r!.from}`));
    const fresh = risks.filter(r => !seen.has(`${r.hazard}|${r.from}`));
    this.log.add(runId, 'understand', fresh.length ? fresh.map(riskSummary).join('; ') : 'No new weather risks', {});
    const actions = planWeather(this.f, fresh, source);
    for (const a of actions) if (a.messages && this.llm && a.kind === 'notify_people') a.messages = await polishMessages(this.llm, a.messages);
    this.log.add(runId, 'decide', `${actions.length} action(s)`, actions.map(a => a.id));
    this.dispatch(runId, actions);
    return { risks, fresh, actions };
  }

  proposeVoteForm(eventId: string) {
    const runId = this.run('vote');
    const a = planVoteForm(this.f, eventId);
    if (a) this.dispatch(runId, [a]);
    return a;
  }

  brief(personId: string, at: string) {
    return briefText(buildBrief(this.f, personId, at, this.changeFeed));
  }

  crowd(at: string) {
    return { venues: venueView(this.f, at), redirects: suggestRedirects(this.f, at) };
  }

  // --- People sorting out flags ------------------------------------------

  /** A person marks a flag as sorted. It leaves Needs attention and is not raised again. */
  resolveFlag(id: string, by: string, how = 'Marked as sorted') {
    const fl = this.flags.find(x => x.id === id);
    if (!fl) return null;
    this.flags = this.flags.filter(x => x.id !== id);
    const done: SortedFlag = { id, title: fl.title, by, at: this.now(), how };
    this.sorted.push(done);
    this.log.add(this.run('sorted'), 'act', `${by} sorted out "${fl.title}": ${how}`, { flagId: id });
    return done;
  }

  /** Give an uncovered shift to a volunteer who is free, tell them, and close the flag. */
  assignCover(flagId: string, coverName: string, by: string) {
    const fl = this.flags.find(x => x.id === flagId);
    const gap = fl?.payload as { shiftId?: string; personName?: string } | undefined;
    const shift = this.f.shifts.find(s => s.id === gap?.shiftId);
    const cover = this.f.people.find(p => p.name === coverName && p.role === 'volunteer');
    if (!fl || !shift || !cover) return null;
    shift.personId = cover.id;
    const venue = this.f.venues.find(v => v.id === shift.venueId)?.name ?? shift.venueId;
    const when = `${new Date(`${shift.start.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}, ${clock(shift.start)}–${clock(shift.end)}`;
    this.outbox.push({ actionId: `cover-${shift.id}`, personId: cover.id, channel: 'volunteer brief', subject: 'New shift',
      body: `You're now covering ${gap?.personName ?? 'a'}'s shift: ${shift.task} at ${venue}, ${when}. Thank you!`, at: this.now() });
    return this.resolveFlag(flagId, by, `${cover.name} now covers the shift (was ${gap?.personName ?? 'unassigned'})`);
  }

  // --- Persistence (the dashboard keeps state in the browser) -----------

  snapshot() {
    return { f: this.f, queue: this.queue, outbox: this.outbox, flags: this.flags, sorted: this.sorted, changeFeed: this.changeFeed, log: this.log.entries, runs: this.runs, memory: this.memory };
  }

  static restore(s: Omit<ReturnType<FestivalAgent['snapshot']>, 'memory' | 'sorted'> & { memory?: Decision[]; sorted?: SortedFlag[] }, llm: LlmClient | null, now: () => string) {
    const a = new FestivalAgent(s.f, llm, now);
    a.queue = s.queue; a.outbox = s.outbox; a.flags = s.flags; a.changeFeed = s.changeFeed; a.runs = s.runs;
    a.sorted = s.sorted ?? [];
    a.memory = s.memory ?? [];
    a.log.restore(s.log);
    return a;
  }

  setLlm(llm: LlmClient | null) { this.llm = llm; }
  /** Run something without the model (e.g. approving a recommendation whose wording is already set): fast and deterministic. */
  async withoutModel<T>(fn: () => Promise<T>): Promise<T> {
    const keep = this.llm; this.llm = null;
    try { return await fn(); } finally { this.llm = keep; }
  }

  // --- Human decisions --------------------------------------------------

  approve(actionId: string, by: string, note?: string) { return this.decide(actionId, by, 'approved', note); }
  reject(actionId: string, by: string, note?: string) { return this.decide(actionId, by, 'rejected', note); }

  private decide(actionId: string, by: string, status: 'approved' | 'rejected', note?: string) {
    const item = this.queue.find(q => q.action.id === actionId && q.status === 'pending');
    if (!item) throw new Error(`No pending action ${actionId}`);
    item.status = status; item.decidedBy = by; item.decidedAt = this.now(); item.note = note;
    this.log.add(item.runId, 'approval', `${status === 'approved' ? 'Approved' : 'Rejected'} by ${by}: ${item.action.title}`, { actionId, note });
    this.memory.push({ actionId, kind: item.action.kind, title: item.action.title, status, by, at: this.now(), note, recipients: item.action.messages?.length ?? 0 });
    if (this.memory.length > 200) this.memory = this.memory.slice(-200);
    if (status === 'approved') { this.execute(item.action); item.status = 'done'; }
    return item;
  }

  /** Earlier decisions on the same kind of action, newest first. */
  pastDecisions(a: { id: string; kind: string }, n = 3): Decision[] {
    return this.memory.filter(d => d.kind === a.kind && d.actionId !== a.id).slice(-n).reverse();
  }
}
