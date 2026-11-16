import { beforeAll, describe, expect, it } from 'vitest';
import { FestivalAgent } from '../src/agent/agent';
import { buildFestival } from '../src/data/seed';
import { mergeSnapshots, sliceFor } from '../src/server/festivals';
import { qrFor } from '../src/rules/access';
import { directory } from '../src/access/profiles';

beforeAll(() => {
  process.env.USHER_MEMORY_STORE = '1';
  delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.RESEND_API_KEY;
});

const route = () => import('../app/api/usher/route');
const post = async (body: unknown, token?: string) => {
  const { POST } = await route();
  const r = await POST(new Request('http://t/api/usher', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const get = async (q: Record<string, string>, token?: string) => {
  const { GET } = await route();
  const r = await GET(new Request(`http://t/api/usher?${new URLSearchParams(q)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
  return { status: r.status, body: await r.json() };
};
const setup = { festivalName: 'Harbor Lights Film Festival', city: 'New York', approver: 'Dana Ops', channels: ['push', 'email'], onboardedAt: '2026-11-15' };

describe('shared festival on the server', () => {
  it('creates a festival, signs people in with random codes, and gives each only their slice', async () => {
    expect((await get({ action: 'status' })).body.shared).toBe(true);
    const a = new FestivalAgent(buildFestival(), null, () => '2027-04-15T09:00');
    a.sweepClashes();
    const made = await post({ action: 'create', snapshot: a.snapshot(), clock: '2027-04-15T09:00', sheet: { source: 'onboarding', errors: [], warnings: [] }, setup });
    expect(made.status).toBe(200);
    const { fid, token: org } = made.body;
    expect(made.body.who.code).toMatch(/^ORG-[A-Z0-9]{6}$/);

    // The organizer sees everything; codes are only for organizers.
    const full = await get({ action: 'state', f: fid }, org);
    expect(full.body.state.agent.f.people.length).toBe(a.f.people.length);
    const codes = (await get({ action: 'codes', f: fid }, org)).body.people as { kind: string; id: string; email: string; name: string; code: string }[];
    const att = codes.find(w => w.kind === 'attendee')!;
    expect(att.code).toMatch(/^ATT-[A-Z0-9]{6}$/);

    // An attendee asks for a code by name and email (no email configured: shown on screen), then signs in.
    const req = await post({ action: 'signin-request', f: fid, kind: 'attendee', name: att.name, email: att.email });
    expect(req.body).toMatchObject({ ok: true, sent: false, code: att.code });
    // Demo: a code from another profile still opens the chosen profile, as its first person.
    const other = await post({ action: 'signin-verify', f: fid, kind: 'guest', code: att.code });
    expect(other.body.ok).toBe(true);
    expect(other.body.who.kind).toBe('guest');
    const ok = await post({ action: 'signin-verify', f: fid, kind: 'attendee', code: att.code.toLowerCase() });
    expect(ok.body.ok).toBe(true);
    const mine = await get({ action: 'state', f: fid }, ok.body.token);
    const f = mine.body.state.agent.f;
    expect(f.passes.every((p: { personId: string }) => p.personId === att.id)).toBe(true);
    expect(f.people.every((p: { id: string; role: string; email: string }) => p.id === att.id || (p.role === 'guest' && p.email === ''))).toBe(true);
    expect(mine.body.state.agent.queue).toEqual([]);
    expect((await get({ action: 'codes', f: fid }, ok.body.token)).status).toBe(403);
    expect((await post({ action: 'put', f: fid, baseVersion: 1, state: mine.body.state }, ok.body.token)).status).toBe(403);
  });

  it('merges a door scan on the server with an organizer edit made from an older version', async () => {
    const a = new FestivalAgent(buildFestival(), null, () => '2027-04-15T09:00');
    const made = await post({ action: 'create', snapshot: a.snapshot(), clock: '2027-04-15T18:00', sheet: { source: 'onboarding', errors: [], warnings: [] }, setup });
    const { fid, token } = made.body;
    const start = await get({ action: 'state', f: fid }, token);
    const pass = a.f.passes.find(p => p.type === 'three_day')!;
    const ev = a.f.events.find(e => e.kind === 'screening' && e.day === 1)!;
    const scan = await post({ action: 'scan', f: fid, qr: qrFor(pass.personId), eventId: ev.id, at: ev.start }, token);
    expect(scan.body.result).toHaveProperty('allowed');
    // Organizer, still on the starting version, cancels an event.
    const org = FestivalAgent.restore(start.body.state.agent, null, () => '2027-04-15T18:00');
    await org.onGridEdit(org.f.events.map(e => e.id === ev.id ? { ...e, status: 'cancelled' as const } : e), 'test');
    const put = await post({ action: 'put', f: fid, baseVersion: start.body.version, state: { ...start.body.state, agent: org.snapshot() } }, token);
    expect(put.body.merged).toBe(true);
    expect(put.body.state.agent.f.checkIns.length).toBe(1);
    expect(put.body.state.agent.f.events.find((e: { id: string }) => e.id === ev.id).status).toBe('cancelled');
  });
});

describe('slices and merges', () => {
  it('a vendor sees no people; staff see teammates but no emails', () => {
    const a = new FestivalAgent(buildFestival());
    const vendor = directory(a.f).find(w => w.kind === 'vendor')!;
    expect(sliceFor(a.snapshot(), vendor).f.people).toEqual([]);
    const staff = directory(a.f).find(w => w.kind === 'staff')!;
    const s = sliceFor(a.snapshot(), staff).f;
    expect(s.people.filter(p => p.id !== staff.id).every(p => p.email === '')).toBe(true);
    expect(s.tickets.every(t => t.personId === staff.id)).toBe(true);
  });
  it('keeps a decision made on either side', () => {
    const a = new FestivalAgent(buildFestival());
    const base = a.snapshot();
    base.queue = [{ action: { id: 'x', kind: 'notify_people', title: 'T', rationale: '' }, runId: 'r', status: 'pending' }];
    const stored = structuredClone(base); stored.queue[0].status = 'rejected';
    const incoming = structuredClone(base);
    expect(mergeSnapshots(stored, incoming).queue[0].status).toBe('rejected');
  });
});
