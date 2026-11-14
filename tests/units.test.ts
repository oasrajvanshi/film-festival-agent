import { describe, expect, it } from 'vitest';
import { buildFestival } from '../src/data/seed';
import { FestivalAgent } from '../src/agent/agent';
import { GATE_POLICY } from '../src/agent/approvals';
import { findGuestClashes, findVenueClashes } from '../src/agent/conflicts';
import { keepsFacts, polishMessages } from '../src/agent/phrase';
import { ACCESS_RULES, PASS_LABELS, parseQr, qrFor } from '../src/rules/access';
import type { LlmClient } from '../src/llm/ollama';

const now = () => '2027-04-15T09:00';

describe('mock festival', () => {
  const f = buildFestival();
  it('matches the proposal sizes', () => {
    expect(f.films).toHaveLength(40);
    expect(f.venues).toHaveLength(4);
    expect(Object.keys(f.dates)).toHaveLength(3);
    expect(new Set(f.passes.map(p => p.type)).size).toBe(10);
    expect(f.people.filter(p => p.role === 'guest')).toHaveLength(15);
    expect(f.events.filter(e => e.kind === 'panel')).toHaveLength(10);
    expect(f.people.filter(p => p.role === 'volunteer')).toHaveLength(60);
  });
  it('is deterministic and starts with no guest clashes', () => {
    expect(JSON.stringify(buildFestival())).toBe(JSON.stringify(buildFestival()));
    expect(findGuestClashes(f)).toEqual([]);
    expect(findVenueClashes(f)).toEqual([]);
  });
  it('uses only made-up contact details', () => {
    expect(f.people.every(p => p.email.endsWith('@example.test'))).toBe(true);
  });
});

describe('access rules', () => {
  it('has one rule per pass type and a matching policy section', () => {
    const f = buildFestival();
    const headings = f.docs.find(d => d.id === 'doc-access')!.sections.map(s => s.heading.toLowerCase());
    for (const t of Object.keys(ACCESS_RULES) as (keyof typeof ACCESS_RULES)[]) {
      expect(headings.some(h => PASS_LABELS[t].toLowerCase().startsWith(h))).toBe(true);
    }
  });
  it('rejects forged QR codes', () => {
    expect(parseQr(qrFor('p-086'))).toBe('p-086');
    expect(parseQr('HLFF1.p-086.XXXX')).toBeNull();
  });
});

describe('approval gate', () => {
  it('never lets outbound or public actions run without a person', () => {
    for (const k of ['notify_people', 'update_website', 'public_announcement', 'roster_change', 'send_vote_form', 'vendor_contingency'] as const) {
      expect(GATE_POLICY[k]).toBe('needs_approval');
    }
  });
  it('sends nothing to attendees until approved, then sends it', async () => {
    const f = buildFestival();
    const agent = new FestivalAgent(f, null, now);
    await agent.onGridEdit(f.events.map(e => e.id === 'e-023' ? { ...e, status: 'cancelled' as const } : e));
    const audience = new Set(f.people.filter(p => ['attendee', 'industry', 'press', 'guest'].includes(p.role)).map(p => p.id));
    expect(agent.outbox.some(d => audience.has(d.personId))).toBe(false);
    const item = agent.queue.find(q => q.action.kind === 'notify_people')!;
    agent.approve(item.action.id, 'ops-lead');
    expect(agent.outbox.some(d => audience.has(d.personId))).toBe(true);
    expect(agent.log.entries.some(e => e.kind === 'approval' && e.summary.includes('ops-lead'))).toBe(true);
  });
  it('only sends the voting form to people who checked in', () => {
    const f = buildFestival();
    const agent = new FestivalAgent(f, null, now);
    agent.onScan(qrFor('p-086'), 'e-001', '2027-04-15T09:55');
    agent.onScan(qrFor('p-107'), 'e-001', '2027-04-15T09:56'); // denied: day 2 pass
    const a = agent.proposeVoteForm('e-001')!;
    expect(a.messages!.map(m => m.personId)).toEqual(['p-086']);
  });
});

describe('model phrasing guard', () => {
  it('rejects a rewrite that drops a time or title', async () => {
    const draft = 'Open Gods: now starts at 1:30 pm. Leave Riverside Studio by 12:50 pm (30 min to "Harbor").';
    expect(keepsFacts(draft, 'Open Gods moved to 1:30 pm, leave by 12:50 pm, 30 min to "Harbor".')).toBe(true);
    const liar: LlmClient = { model: 'fake', chat: async () => 'Open Gods now starts at 2:00 pm!' };
    const [m] = await polishMessages(liar, [{ personId: 'p', channel: 'email', subject: 's', body: draft }]);
    expect(m.body).toBe(draft);
  });
});

describe('vendor feed', () => {
  it('flags a guest whose delayed flight lands after their event and drafts (not sends) a message', () => {
    const f = buildFestival();
    const agent = new FestivalAgent(f, null, now);
    agent.onVendorAlert({ type: 'flight_delay', guestId: 'p-071', flight: 'XY123', newArrival: '2027-04-15T09:30', arrivalVenueMin: 45 });
    expect(agent.flags.some(a => a.title.includes('Salt Houses'))).toBe(true);
    expect(agent.queue.some(q => q.action.kind === 'vendor_contingency')).toBe(true);
    expect(agent.outbox.some(d => d.personId === 'p-071')).toBe(false);
  });
});
