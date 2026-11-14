// Runs one planned action against the state. Each step has an idempotency key
// and runs at most once, so a retried trigger or a restarted server never
// sends the same message twice. Outbound items land in the outbox; the
// messaging adapters deliver them after the state is saved.

import type { Channel, FestivalData, Iso, OpsState, OutboxItem, PlannedAction, Recipient, StaffMember } from '../domain/types';
import { FestivalView } from '../domain/view';
import { nextId, type Audit } from './audit';
import { checkAction } from './policy';
import { render } from './templates';

export interface ExecResult { ran: boolean; outbox: OutboxItem[]; note: string }

function pick<T extends string>(preferred: T[], available: T[]): T | undefined {
  return preferred.find(c => available.includes(c)) ?? available[0];
}

function addressFor(ch: Channel, p: { email?: string; phone?: string; id?: string }): string {
  if (ch === 'email') return p.email ?? `email:${p.id ?? ''}`;
  if (ch === 'sms') return p.phone ?? `sms:${p.id ?? ''}`;
  if (ch === 'slack') return `slack:${p.id ?? ''}`;
  return `push:${p.id ?? ''}`;
}

/**
 * Staff for a recipient. A team at a venue means the volunteers on shift
 * there today; if nobody is, the house managers, then Operations.
 */
export function resolveStaff(v: FestivalView, r: Recipient, now: Iso): StaffMember[] {
  if (r.kind === 'staff') return v.data.staff.filter(s => s.id === r.id);
  if (r.kind !== 'team') return [];
  const members = v.team(r.id, r.venueId, r.venueId ? now : undefined);
  if (members.length) return members;
  for (const fallback of ['house_manager', 'operations']) {
    const f = v.team(fallback);
    if (f.length) return f;
  }
  return [];
}

export function execute(data: FestivalData, state: OpsState, now: Iso, a: PlannedAction, key: string, audit: Audit): ExecResult {
  if (state.done[key]) return { ran: false, outbox: [], note: 'already done' };
  const problems = checkAction(data, a);
  if (problems.length) {
    audit('blocked', `Blocked: ${a.summary}`, { key, problems });
    return { ran: false, outbox: [], note: problems.join('; ') };
  }
  const v = new FestivalView(data, state);
  const text = a.template ? render(a.template, a.vars) : a.summary;
  const out: OutboxItem[] = [];
  const push = (item: Omit<OutboxItem, 'id' | 'at' | 'key' | 'kind' | 'delivered' | 'template' | 'text'>) => {
    out.push({ id: nextId(state, 'msg'), at: now, key, kind: a.kind, template: a.template, text, delivered: 'mock', ...item });
  };

  switch (a.kind) {
    case 'flag':
      state.flags.push({ id: nextId(state, 'flag'), at: now, level: a.level ?? 'amber', text: a.summary, key });
      break;
    case 'update_brief':
      for (const r of a.to ?? []) {
        const id = r.kind === 'team' ? `${r.id}${r.venueId ? `@${r.venueId}` : ''}` : r.id;
        (state.briefs[id] ??= []).push({ at: now, text, key });
      }
      break;
    case 'staff_heads_up': {
      const seen = new Set<string>();
      for (const s of (a.to ?? []).flatMap(r => resolveStaff(v, r, now))) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        const ch = pick<Channel>(['slack', 'sms', 'push', 'email'], s.channels) ?? 'email';
        push({ channel: ch, to: `${s.name} (${s.title})`, address: addressFor(ch, s) });
      }
      break;
    }
    case 'message_guest':
      for (const r of a.to ?? []) {
        const g = v.guest(r.id)!;
        if (r.kind === 'assistant') {
          const ch: Channel = g.assistant!.email ? 'email' : 'sms';
          push({ channel: ch, to: `${g.assistant!.name} (assistant to ${g.name})`, address: addressFor(ch, { ...g.assistant!, id: `${g.id}-assistant` }) });
        } else {
          const ch = pick<Channel>(a.channels ?? ['sms', 'email'], g.channels) ?? 'email';
          push({ channel: ch, to: g.name, address: addressFor(ch, g) });
        }
      }
      break;
    case 'broadcast':
      for (const r of a.to ?? []) {
        const seg = v.segment(r.id)!;
        for (const ch of a.channels ?? ['push']) push({ channel: ch, to: `${seg.label} (${seg.count})`, address: `segment:${r.id}` });
      }
      break;
    case 'schedule_change': {
      const c = a.change!;
      const o = (state.overrides[c.sessionId] ??= {});
      if (c.start) o.start = c.start;
      if (c.end) o.end = c.end;
      if (c.addSpeaker) o.addedSpeakers = [...new Set([...(o.addedSpeakers ?? []), c.addSpeaker])];
      if (c.note) o.notes = [...(o.notes ?? []), c.note];
      break;
    }
    case 'vendor_order':
      push({ channel: 'vendor', to: a.vendor!.vendor, address: `vendor:${a.vendor!.vendor}` });
      break;
    case 'watch': {
      const w = a.watch!;
      const exists = state.timers.some(t => !t.fired && t.kind === 'recheck' && t.at === w.at && JSON.stringify(t.trigger) === JSON.stringify({ ...w.trigger, at: w.at }));
      if (!exists) state.timers.push({ id: nextId(state, 'timer'), at: w.at, kind: 'recheck', ref: key, trigger: { ...w.trigger, at: w.at }, fired: false });
      break;
    }
  }
  state.outbox.push(...out);
  state.done[key] = now;
  audit('act', a.summary, { key, kind: a.kind, messages: out.length });
  return { ran: true, outbox: out, note: '' };
}
