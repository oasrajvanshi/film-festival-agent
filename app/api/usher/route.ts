// Usher's shared server: festivals, sign-in, per-person views, door scans,
// vendor reports, push subscriptions, feedback and test-mode delivery.
// With no storage connected, `status` says so and the app stays in
// single-browser mode.
import { after } from 'next/server';
import { getKv, type Kv } from '../../../src/server/kv';
import {
  FEEDBACK_KEY, PUSH_KEY, SAMPLE_FID, agentFor, cleanCode, codeKey, deliveryKey, ensureCodes, loadFest, mergeSnapshots, newId, newRecord,
  newSession, people, readSession, saveFest, sliceFor, type FestRecord, type Session, type SharedState, type Snapshot,
} from '../../../src/server/festivals';
import { channels, codeHtml, digestHtml, sendEmail, sendPush, sendSms, vapid, type OutMsg } from '../../../src/server/deliver';
import { DEMO_PEOPLE, PROFILES, directory, lookupForCode, type ProfileKind } from '../../../src/access/profiles';
import { dayAt } from '../../../src/agent/presence';
import type { Arrival } from '../../../src/core/types';
import { FestivalAgent } from '../../../src/agent/agent';
import type { VendorAlert } from '../../../src/agent/vendors';
import { fetchSheetTables, sheetIdFrom, tablesToFestival } from '../../../src/data/sheet';
import { fetchWorkbook, rebuildFromTabs, type SheetMapping } from '../../../src/onboard/workbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'Cache-Control': 'no-store' } });
const bad = (error: string, status = 400) => json({ error }, status);
const KINDS = PROFILES.map(p => p.kind);

async function sessionFor(kv: Kv, req: Request, fid: string | null, kinds?: ProfileKind[]): Promise<Session | null> {
  const s = await readSession(kv, req);
  if (!s || (fid && s.fid !== fid)) return null;
  if (kinds && !kinds.includes(s.who.kind)) return null;
  return s;
}

function viewFor(rec: FestRecord, s: Session) {
  const organizer = s.who.kind === 'organizer';
  const state: SharedState = organizer ? rec.state : { ...rec.state, agent: sliceFor(rec.state.agent, s.who), sheet: { source: rec.state.sheet.source, errors: [], warnings: [] } };
  return { version: rec.version, state, setup: organizer ? rec.setup : { festivalName: rec.setup.festivalName, city: rec.setup.city }, who: s.who, sample: rec.sample };
}

/** Add arrivals from the per-day list that the festival record doesn't have yet. */
function unionArrivals(rec: FestRecord, extra: Arrival[]) {
  const f = rec.state.agent.f;
  const have = new Set((f.arrivals ?? []).map(a => a.id));
  const missing = extra.filter(a => !have.has(a.id));
  if (missing.length) f.arrivals = [...(f.arrivals ?? []), ...missing].sort((a, b) => a.at.localeCompare(b.at));
}

/** Run after the response where the platform allows it (Vercel), else in the background. */
function later(fn: () => Promise<void>) {
  try { after(fn); } catch { void fn().catch(() => {}); }
}

/** Send anything new since the last delivery: one email, one text, organizer push. */
function deliverNew(kv: Kv, rec: FestRecord, origin: string) {
  const a = rec.state.agent;
  const done = new Set(rec.delivered);
  const fresh = a.outbox.filter(d => !done.has(deliveryKey(d)));
  const seen = new Set(rec.flagsSeen);
  const newFlags = a.flags.filter(fl => !seen.has(fl.id));
  const newAsks = a.queue.filter(q => q.status === 'pending' && !seen.has(`q:${q.action.id}`));
  if (!fresh.length && !newFlags.length && !newAsks.length) return;
  rec.delivered = [...rec.delivered, ...fresh.map(deliveryKey)].slice(-5000);
  rec.flagsSeen = [...rec.flagsSeen, ...newFlags.map(x => x.id), ...newAsks.map(q => `q:${q.action.id}`)].slice(-5000);
  const want = new Set(rec.setup.channels ?? ['push', 'email', 'sms']);
  const fest = a.f.name;
  later(async () => {
    const jobs: Promise<unknown>[] = [];
    // Outbound messages to people: only those meant for attendees, guests and staff (not the website).
    const msgs: OutMsg[] = fresh.filter(d => d.channel !== 'website').map(d => {
      const p = a.f.people.find(x => x.id === d.personId) ?? directory(a.f).find(x => x.id === d.personId);
      return { personName: p?.name ?? d.personId, personEmail: p?.email ?? '', channel: d.channel, subject: d.subject, body: d.body };
    });
    if (msgs.length) {
      const byAction = [...new Set(fresh.map(d => d.actionId))].map(id => a.queue.find(q => q.action.id === id)?.action.title).filter(Boolean);
      const title = byAction.length === 1 ? String(byAction[0]) : msgs.length === 1 ? `${msgs[0].subject}: ${msgs[0].personName}` : `${msgs.length} updates sent`;
      if (want.has('email')) jobs.push(sendEmail(`[Usher test] ${title}`, digestHtml(fest, title, msgs)));
      if (want.has('sms')) jobs.push(sendSms(`Usher test (${fest}): ${title}. ${msgs.length} message${msgs.length === 1 ? '' : 's'} went out, e.g. to ${msgs[0].personName}: "${msgs[0].subject}"`));
    }
    if (want.has('push')) {
      if (newAsks.length) jobs.push(sendPush(kv, rec.id, { title: `${newAsks.length} update${newAsks.length > 1 ? 's' : ''} to approve`, body: newAsks.at(-1)!.action.title, url: `${origin}/app#approvals` }));
      if (newFlags.length) jobs.push(sendPush(kv, rec.id, { title: 'Needs attention', body: newFlags.length > 1 ? `${newFlags.at(-1)!.title} and ${newFlags.length - 1} more` : newFlags[0].title, url: `${origin}/app#approvals` }));
    }
    await Promise.allSettled(jobs);
  });
}

export async function GET(req: Request) {
  const kv = getKv();
  const u = new URL(req.url);
  const action = u.searchParams.get('action') ?? 'status';
  if (action === 'status') return json({ shared: !!kv, channels: channels() });
  if (!kv) return bad('Shared storage is not connected.', 503);
  const fid = u.searchParams.get('f') ?? '';
  if (action === 'vapid') return json({ publicKey: (await vapid(kv)).publicKey });
  const rec = await loadFest(kv, fid);
  if (!rec) return bad('Festival not found.', 404);
  if (action === 'public') {
    const f = rec.state.agent.f;
    return json({ fid, name: f.name, city: rec.setup.city, dates: f.dates, sample: rec.sample, emailCodes: channels().email });
  }
  const s = await sessionFor(kv, req, fid);
  if (!s) return bad('Please sign in again.', 401);
  if (action === 'version') return json({ version: rec.version });
  if (action === 'state') return json(viewFor(rec, s));
  if (s.who.kind !== 'organizer') return bad('Organizers only.', 403);
  if (action === 'codes') {
    if (ensureCodes(rec)) await saveFest(kv, rec);
    return json({ people: people(rec) });
  }
  if (action === 'feedback') return json({ items: await kv.list(FEEDBACK_KEY(fid), 200) });
  return bad('Unknown action.');
}

export async function POST(req: Request) {
  const kv = getKv();
  if (!kv) return bad('Shared storage is not connected.', 503);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad('Bad request.'); }
  const action = String(b.action ?? '');
  const origin = new URL(req.url).origin;
  const fid = String(b.f ?? '');

  if (action === 'create') {
    const snapshot = b.snapshot as Snapshot, setup = b.setup as FestRecord['setup'];
    if (!snapshot?.f?.events || !setup) return bad('Missing festival.');
    const sample = b.sample === true;
    if (sample) {
      const have = await loadFest(kv, SAMPLE_FID);
      // Keep the shared sample, unless the built-in sample has since changed (e.g. a new demo festival).
      if (have && have.initial.festival.name === snapshot.f.name) return json({ fid: SAMPLE_FID });
    }
    const id = sample ? SAMPLE_FID : newId(8);
    const rec = newRecord({ id, festival: snapshot.f, snapshot, clock: String(b.clock ?? ''), sheet: b.sheet as FestRecord['state']['sheet'], setup, sample });
    await saveFest(kv, rec);
    if (sample) return json({ fid: id });
    const token = await newSession(kv, id, rec.owner);
    return json({ fid: id, token, who: { ...rec.owner, code: rec.codes[codeKey(rec.owner)] } });
  }

  const rec = await loadFest(kv, fid);
  if (!rec) return bad('Festival not found.', 404);
  const f = rec.state.agent.f;

  if (action === 'signin-request') {
    const kind = String(b.kind) as ProfileKind;
    if (!KINDS.includes(kind)) return bad('Pick a profile.');
    if (ensureCodes(rec)) await saveFest(kv, rec);
    const r = lookupForCode(f, kind, String(b.name ?? '').slice(0, 80), String(b.email ?? '').slice(0, 120));
    if (!r.ok) return json({ ok: false, reason: r.reason });
    const code = rec.codes[codeKey(r.who)];
    const profile = PROFILES.find(p => p.kind === kind)!.label;
    const link = `${origin}/app?f=${rec.id}`;
    const sent = await sendEmail(`Your ${f.name} access code: ${code}`, codeHtml({ name: r.who.name, email: String(b.email), code, festival: f.name, profile, link })).catch(() => false);
    // Without email, show the code on screen (demo only); with email, never.
    return json({ ok: true, sent, code: sent ? undefined : code });
  }

  if (action === 'signin-verify') {
    const kind = String(b.kind) as ProfileKind;
    const ip = (req.headers.get('x-forwarded-for') ?? 'x').split(',')[0].trim();
    const rl = `usher:rl:${fid}:${ip}`;
    const tries = (await kv.get<number>(rl)) ?? 0;
    if (tries >= 12) return json({ ok: false, reason: 'too_many' }, 429);
    const code = cleanCode(String(b.code ?? ''));
    const key = Object.entries(rec.codes).find(([k, c]) => k.startsWith(`${kind}:`) && cleanCode(c) === code)?.[0];
    // Demo: any code opens the chosen profile. A real code opens its own person;
    // anything else opens the first person with that profile.
    const who = (key ? people(rec).find(w => codeKey(w) === key) : undefined) ?? people(rec).find(w => w.kind === kind && DEMO_PEOPLE.includes(w.name)) ?? people(rec).find(w => w.kind === kind);
    if (!who) { await kv.set(rl, tries + 1, 900); return json({ ok: false, reason: 'no_match' }); }
    const token = await newSession(kv, fid, who);
    return json({ ok: true, token, who: { ...who, code: '' } });
  }

  if (action === 'feedback') {
    const s = await sessionFor(kv, req, fid);
    const text = String(b.text ?? '').trim().slice(0, 2000);
    if (!text) return bad('Write something first.');
    await kv.push(FEEDBACK_KEY(fid), { at: new Date().toISOString(), role: s?.who.kind ?? String(b.role ?? 'visitor').slice(0, 20), name: s?.who.name ?? '', rating: Number(b.rating) || null, text });
    return json({ ok: true });
  }

  const s = await sessionFor(kv, req, fid);
  if (!s) return bad('Please sign in again.', 401);

  if (action === 'signout') return json({ ok: true });

  if (action === 'scan') {
    if (s.who.kind !== 'staff' && s.who.kind !== 'organizer') return bad('Staff only.', 403);
    const agent = agentFor(rec);
    const at = String(b.at ?? rec.state.clock);
    const res = agent.onScan(String(b.qr ?? '').slice(0, 80), String(b.eventId ?? ''), at, s.who.name);
    rec.state.agent = agent.snapshot();
    rec.version++;
    await saveFest(kv, rec);
    return json({ result: res, version: rec.version });
  }

  if (action === 'arrive') {
    if (s.who.kind !== 'staff' && s.who.kind !== 'organizer') return bad('Staff only.', 403);
    const at = String(b.at ?? rec.state.clock);
    const venueId = String(b.venueId ?? '');
    if (!rec.state.agent.f.venues.some(v => v.id === venueId)) return bad('Pick the venue you are scanning at.');
    const day = dayAt(rec.state.agent.f, at);
    // Every arrival is also appended to that day's list on its own, so two doors
    // scanning at the same moment never lose one. Pull in any the record missed.
    const dayKey = `usher:arr:${fid}:${day}`;
    if (day != null) unionArrivals(rec, await kv.list<Arrival>(dayKey, 5000));
    const agent = agentFor(rec);
    const res = agent.onArrival(String(b.qr ?? '').slice(0, 80), venueId, at, s.who.name);
    const added = agent.f.arrivals?.at(-1);
    if (res.allowed && added && day != null) await kv.push(dayKey, added, 5000);
    rec.state.agent = agent.snapshot();
    rec.version++;
    deliverNew(kv, rec, origin);
    await saveFest(kv, rec);
    return json({ result: res, version: rec.version });
  }

  // An attendee or guest changes their own plan: save an event, or drop one (a swap does both).
  if (action === 'booking') {
    if (s.who.kind !== 'attendee' && s.who.kind !== 'guest') return bad('Only attendees and guests keep a plan.', 403);
    const f = rec.state.agent.f;
    const add = b.add ? String(b.add) : null;
    const drop = b.drop ? String(b.drop) : null;
    if (add && !f.events.some(e => e.id === add && e.status === 'scheduled')) return bad('That event is not on the programme.');
    f.bookings = f.bookings.filter(x => !(x.personId === s.who.id && x.eventId === drop));
    if (add && !f.bookings.some(x => x.personId === s.who.id && x.eventId === add)) f.bookings.push({ personId: s.who.id, eventId: add });
    rec.version++;
    await saveFest(kv, rec);
    return json({ ok: true, version: rec.version });
  }

  if (action === 'vendor-report') {
    if (s.who.kind !== 'vendor') return bad('Vendors only.', 403);
    const type = String(b.type);
    const agent = agentFor(rec);
    let alert: VendorAlert | null = null;
    const eta = String(b.newEta ?? '');
    if (type === 'print_delay' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(eta)) alert = { type: 'print_delay', filmId: String(b.filmId ?? ''), newEta: eta };
    if (type === 'vendor_cancel') alert = { type: 'vendor_cancel', vendor: s.who.name, service: String(b.service ?? s.who.detail).slice(0, 80), day: Number(b.day) || 1 };
    if (!alert) return bad('Unknown report.');
    const actions = agent.onVendorAlert(alert);
    agent.log.add(`vendor-${Date.now()}`, 'trigger', `Reported by ${s.who.name}: ${String(b.note ?? '').slice(0, 300)}`);
    rec.state.agent = agent.snapshot();
    rec.version++;
    deliverNew(kv, rec, origin);
    await saveFest(kv, rec);
    return json({ ok: true, actions: actions.length });
  }

  if (s.who.kind !== 'organizer') return bad('Organizers only.', 403);

  if (action === 'put') {
    const state = b.state as SharedState;
    if (!state?.agent?.f) return bad('Missing state.');
    const base = Number(b.baseVersion);
    const merged = base !== rec.version;
    rec.state = merged ? { ...state, agent: mergeSnapshots(rec.state.agent, state.agent) } : state;
    if (b.setup) rec.setup = { ...rec.setup, ...(b.setup as object) };
    rec.version++;
    deliverNew(kv, rec, origin);
    await saveFest(kv, rec);
    return json(merged ? { version: rec.version, merged: true, state: rec.state } : { version: rec.version, merged: false });
  }

  if (action === 'reset') {
    const agent = new FestivalAgent(structuredClone(rec.initial.festival), null, () => rec.initial.clock);
    agent.sweepClashes();
    await Promise.all(Object.keys(rec.initial.festival.dates).map(d => kv.del(`usher:arr:${fid}:${d}`)));
    rec.state = { agent: agent.snapshot(), clock: rec.initial.clock, sheet: rec.state.sheet };
    rec.delivered = agent.outbox.map(deliveryKey);
    rec.flagsSeen = agent.flags.map(x => x.id);
    rec.version++;
    await saveFest(kv, rec);
    return json(viewFor(rec, s));
  }

  if (action === 'sheet-sync') {
    // Re-read the festival's Google Sheet and run the agent on what changed.
    // Organizer devices ask every minute; the server does it at most once a minute.
    const setup = rec.setup as FestRecord['setup'] & { sheetMapping?: SheetMapping; lastSheetSync?: number };
    const id = setup.sheetUrl ? sheetIdFrom(setup.sheetUrl) : null;
    if (!id) return json({ synced: false, reason: 'no_sheet' });
    if (!b.force && setup.lastSheetSync && Date.now() - setup.lastSheetSync < 55_000) return json({ synced: false, reason: 'recent', version: rec.version });
    setup.lastSheetSync = Date.now();
    await saveFest(kv, rec);
    try {
      const res = setup.sheetMapping ? rebuildFromTabs(setup.sheetMapping, await fetchWorkbook(id)) : tablesToFestival(await fetchSheetTables(id));
      if (!res.festival) return json({ synced: false, reason: 'errors', errors: res.errors.slice(0, 5) });
      const agent = agentFor(rec);
      const r = await agent.onSheetSync(res.festival, 'Google Sheet (auto-sync)');
      rec.state.agent = agent.snapshot();
      rec.state.sheet = { ...rec.state.sheet, source: 'sheet', sheet: setup.sheetUrl, loadedAt: new Date().toISOString(), errors: [], warnings: res.warnings ?? [],
        message: r.changes.length ? `${r.changes.length} schedule change(s) found in the sheet.` : 'Sheet checked: no schedule changes.' };
      rec.version++;
      deliverNew(kv, rec, origin);
      await saveFest(kv, rec);
      return json({ synced: true, changes: r.changes.length, version: rec.version });
    } catch (e) {
      return json({ synced: false, reason: 'fetch', error: (e as Error).message });
    }
  }

  if (action === 'push-subscribe') {
    const sub = b.sub as { endpoint?: string };
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint)) return bad('Bad subscription.');
    const subs = await kv.list<{ endpoint: string }>(PUSH_KEY(fid), 50);
    if (!subs.some(x => x.endpoint === sub.endpoint)) await kv.push(PUSH_KEY(fid), sub, 50);
    return json({ ok: true });
  }

  if (action === 'push-test') {
    const n = await sendPush(kv, fid, { title: 'Alerts are on', body: `You'll hear about ${f.name} approvals and flags on this device.`, url: `${origin}/app#approvals` });
    return json({ sent: n });
  }

  return bad('Unknown action.');
}
