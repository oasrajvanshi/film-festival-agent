// One festival in shared storage: its agent state, setup, access codes and
// what has already been delivered. Everything a non-organizer receives goes
// through sliceFor, so a phone only ever holds that person's own records.

import { randomBytes, randomInt } from 'node:crypto';
import { FestivalAgent } from '../agent/agent';
import { PROFILES, accessCode, directory, type ProfileKind, type Who } from '../access/profiles';
import type { Festival, Person } from '../core/types';
import type { Kv } from './kv';

export type Snapshot = ReturnType<FestivalAgent['snapshot']>;
export interface SheetStatus { source: string; sheet?: string; loadedAt?: string; errors: string[]; warnings: string[]; message?: string }
export interface Setup { festivalName: string; city: string; approver: string; channels: string[]; onboardedAt: string; sheetUrl?: string; sheetMapping?: unknown }
export interface SharedState { agent: Snapshot; clock: string; sheet: SheetStatus }

export interface FestRecord {
  id: string;
  version: number;
  sample: boolean;
  createdAt: string;
  updatedAt: string;
  setup: Setup;
  state: SharedState;
  /** The festival as it was when it went live, for "Reset". */
  initial: { festival: Festival; clock: string };
  /** `${kind}:${id}` → access code. Never sent to anyone but organizers. */
  codes: Record<string, string>;
  /** The person who set the festival up; they sign in as an organizer. */
  owner: Who;
  /** Outbox and flag keys already delivered, so each goes out once. */
  delivered: string[];
  flagsSeen: string[];
}

export interface Session { fid: string; who: Who; exp: number }

const FKEY = (fid: string) => `usher:f:${fid}`;
const SKEY = (t: string) => `usher:s:${t}`;
export const PUSH_KEY = (fid: string) => `usher:push:${fid}`;
export const FEEDBACK_KEY = (fid: string) => `usher:fb:${fid}`;
const SESSION_DAYS = 14;
const LOG_CAP = 400;

export const newId = (n = 8) => randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n).toLowerCase();
export const SAMPLE_FID = 'sample';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** A random 6-character code with the profile prefix, e.g. GST-7KQ2MX. */
export function randomCode(kind: ProfileKind): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${PROFILES.find(p => p.kind === kind)!.prefix}-${s}`;
}
export const codeKey = (w: { kind: ProfileKind; id: string }) => `${w.kind}:${w.id}`;
export const cleanCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Keep the log from growing without end in storage. */
export function trimSnapshot(s: Snapshot): Snapshot {
  return s.log.length > LOG_CAP ? { ...s, log: s.log.slice(-LOG_CAP) } : s;
}

export async function loadFest(kv: Kv, fid: string) { return kv.get<FestRecord>(FKEY(fid)); }
export async function saveFest(kv: Kv, rec: FestRecord) {
  rec.updatedAt = new Date().toISOString();
  rec.state.agent = trimSnapshot(rec.state.agent);
  await kv.set(FKEY(rec.id), rec);
}

/** Everyone who can sign in, with the codes this festival gave them. */
export function people(rec: FestRecord): Who[] {
  const list = [rec.owner, ...directory(rec.state.agent.f)];
  return list.map(w => ({ ...w, code: rec.codes[codeKey(w)] ?? '' }));
}

/** Give every person and vendor a code. Returns true if any were added. */
export function ensureCodes(rec: FestRecord): boolean {
  let added = false;
  for (const w of [rec.owner, ...directory(rec.state.agent.f)]) {
    const k = codeKey(w);
    if (rec.codes[k]) continue;
    // The public sample keeps its well-known demo codes; real festivals get random ones.
    rec.codes[k] = rec.sample ? accessCode(w.kind, w.id, rec.state.agent.f.name) : randomCode(w.kind);
    added = true;
  }
  return added;
}

export function newRecord(opts: { id: string; festival: Festival; snapshot: Snapshot; clock: string; sheet: SheetStatus; setup: Setup; sample?: boolean }): FestRecord {
  const now = new Date().toISOString();
  const owner: Who = { kind: 'organizer', id: 'owner', name: opts.setup.approver || 'Organizer', detail: 'Set up the festival', code: '' };
  const rec: FestRecord = {
    id: opts.id, version: 1, sample: !!opts.sample, createdAt: now, updatedAt: now, setup: opts.setup,
    state: { agent: opts.snapshot, clock: opts.clock, sheet: opts.sheet },
    initial: { festival: structuredClone(opts.festival), clock: opts.clock },
    codes: {}, owner, delivered: [], flagsSeen: [],
  };
  // Nothing from before go-live counts as new.
  rec.delivered = opts.snapshot.outbox.map(deliveryKey);
  rec.flagsSeen = opts.snapshot.flags.map(fl => fl.id);
  ensureCodes(rec);
  return rec;
}

export async function newSession(kv: Kv, fid: string, who: Who): Promise<string> {
  const token = newId(16) + newId(16);
  await kv.set(SKEY(token), { fid, who: { ...who, code: '' }, exp: Date.now() + SESSION_DAYS * 864e5 } satisfies Session, SESSION_DAYS * 86400);
  return token;
}
export async function readSession(kv: Kv, req: Request): Promise<Session | null> {
  const h = req.headers.get('authorization') ?? '';
  const t = /^Bearer\s+([A-Za-z0-9]{16,64})$/.exec(h)?.[1];
  if (!t) return null;
  const s = await kv.get<Session>(SKEY(t));
  return s && s.exp > Date.now() ? s : null;
}

// ------------------------------------------------------------------ slices
const publicPerson = (p: Person): Person => ({ id: p.id, name: p.name, role: p.role, email: '', channels: [], crowdOptIn: false });
const teamPerson = (p: Person): Person => ({ ...publicPerson(p), staffRole: p.staffRole });

/**
 * What a non-organizer's device receives. The program (events, venues, films,
 * documents) is public. Of people, only guests' names (they're on the
 * program) and, for staff, teammates' names and jobs. Passes, tickets,
 * saved events and messages are the person's own. Check-ins keep counts for
 * crowd levels but not who.
 */
export function sliceFor(s: Snapshot, who: Who): Snapshot {
  const f = s.f;
  const staff = who.kind === 'staff';
  const vendor = who.kind === 'vendor';
  const mine = <T extends { personId: string }>(xs: T[]) => xs.filter(x => x.personId === who.id);
  const sliced: Festival = {
    ...f,
    people: vendor ? [] : f.people.flatMap(p => p.id === who.id ? [p]
      : p.role === 'guest' ? [publicPerson(p)]
      : staff && (p.role === 'volunteer' || p.role === 'festival_staff') ? [teamPerson(p)] : []),
    passes: mine(f.passes),
    tickets: mine(f.tickets),
    bookings: mine(f.bookings),
    shifts: staff ? f.shifts : mine(f.shifts),
    checkIns: staff ? f.checkIns.map(c => ({ ...c, personId: '' })) : [],
  };
  return { f: sliced, queue: [], outbox: vendor ? [] : s.outbox.filter(d => d.personId === who.id), flags: [], changeFeed: s.changeFeed, log: [], runs: s.runs, memory: [] } as Snapshot;
}

// ------------------------------------------------------------------ merging
const logKey = (e: { at: string; runId: string; summary: string }) => `${e.at}|${e.runId}|${e.summary}`;
export const deliveryKey = (d: { actionId: string; personId: string; channel: string }) => `${d.actionId}|${d.personId}|${d.channel}`;

/**
 * Two writers changed the festival since the same version (an organizer on
 * another device, or a door scan). Keep the incoming state and add what only
 * the stored one has: check-ins, log lines, queue items, messages, flags. For
 * a queue item both have, a decision beats "pending".
 */
export function mergeSnapshots(stored: Snapshot, incoming: Snapshot): Snapshot {
  const out = structuredClone(incoming) as Snapshot & Record<string, unknown>;
  const ids = new Set(out.f.checkIns.map(c => c.id));
  out.f.checkIns.push(...stored.f.checkIns.filter(c => !ids.has(c.id)));
  const logs = new Set(out.log.map(logKey));
  let seq = out.log.reduce((m, e) => Math.max(m, e.seq), 0);
  for (const e of stored.log) if (!logs.has(logKey(e))) out.log.push({ ...e, seq: ++seq });
  for (const q of stored.queue) {
    const mine = out.queue.find(x => x.action.id === q.action.id);
    if (!mine) out.queue.push(q);
    else if (mine.status === 'pending' && q.status !== 'pending') Object.assign(mine, q);
  }
  const sent = new Set(out.outbox.map(deliveryKey));
  out.outbox.push(...stored.outbox.filter(d => !sent.has(deliveryKey(d))));
  const flagIds = new Set(out.flags.map(x => x.id));
  out.flags.push(...stored.flags.filter(x => !flagIds.has(x.id)));
  const feed = new Set(out.changeFeed);
  out.changeFeed.push(...stored.changeFeed.filter(c => !feed.has(c)));
  out.runs = Math.max(out.runs, stored.runs);
  // Any other list the agent keeps (decision memory, resolved flags...): union.
  for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
    if (['f', 'queue', 'outbox', 'flags', 'changeFeed', 'log', 'runs'].includes(k) || !Array.isArray(v)) continue;
    const cur = Array.isArray(out[k]) ? out[k] as unknown[] : [];
    const seen = new Set(cur.map(x => JSON.stringify(x)));
    out[k] = [...cur, ...v.filter(x => !seen.has(JSON.stringify(x)))];
  }
  return out;
}

/** Restore an agent from stored state to run one server-side action. */
export function agentFor(rec: FestRecord) {
  return FestivalAgent.restore(rec.state.agent, null, () => rec.state.clock);
}
