import { describe, expect, it } from 'vitest';
import type { DecisionOption } from '../../src/backend/domain/types';
import { canDecide, checkAction, defaultFor, isSafeDefault } from '../../src/backend/engine/policy';
import { render } from '../../src/backend/engine/templates';
import { loadData } from './helpers';

const opt = (key: 'A' | 'B', kind: DecisionOption['actions'][number]['kind'], reversible = true): DecisionOption => ({
  key, title: key, pros: '', cons: '', cost: { people: 0, messages: 0, money: 0, reversible }, actions: [{ kind, summary: kind }],
});

describe('approval gate and safety rules', () => {
  it('never runs a mass message or a guest message as a deadline default', () => {
    expect(isSafeDefault(opt('A', 'broadcast'))).toBe(false);
    expect(isSafeDefault(opt('A', 'message_guest'))).toBe(false);
    expect(isSafeDefault(opt('A', 'watch'))).toBe(true);
    expect(isSafeDefault(opt('A', 'watch', false))).toBe(false);
    expect(defaultFor([opt('A', 'broadcast'), opt('B', 'watch')], 'A')).toBe('B');
    expect(defaultFor([opt('A', 'broadcast'), opt('B', 'vendor_order')], 'A')).toBeNull();
  });

  it('only addresses people and segments that exist in the sheets', async () => {
    const d = await loadData();
    const ok = { kind: 'message_guest' as const, summary: '', to: [{ kind: 'guest' as const, id: 'p-084' }], template: 'remote_join', vars: { name: 'Yara', session: 'x', start: '4:00 pm' } };
    expect(checkAction(d, ok)).toEqual([]);
    expect(checkAction(d, { ...ok, to: [{ kind: 'guest', id: 'p-999' }] })).toContain('unknown guest p-999');
    expect(checkAction(d, { ...ok, to: [{ kind: 'segment', id: 'day:1' }] })).toContain('message_guest cannot address a segment');
    expect(checkAction(d, { kind: 'broadcast', summary: '', to: [{ kind: 'segment', id: 'everyone' }], template: 'weather_notice', vars: { snowSpan: 'x', shuttleNote: '' } }))
      .toContain('unknown audience segment everyone');
    expect(checkAction(d, { kind: 'message_guest', summary: '', to: [{ kind: 'guest', id: 'p-084' }] })).toContain('message_guest needs a template');
  });

  it('refuses half-filled templates', () => {
    expect(() => render('remote_join', { name: 'Yara' })).toThrow(/missing session, start/);
    expect(() => render('free_text', {})).toThrow(/Unknown template/);
  });

  it('lets festival staff decide for their own team, and operations for any team', async () => {
    const d = await loadData();
    expect(canDecide(d, 'p-008', 'comms')).toBe(true);       // Comms
    expect(canDecide(d, 'p-008', 'guest_relations')).toBe(false);
    expect(canDecide(d, 'p-002', 'guest_relations')).toBe(true); // Operations
    expect(canDecide(d, 'p-011', 'operations')).toBe(false);  // a door volunteer
    expect(canDecide(d, 'p-086', 'comms')).toBe(false);       // an attendee
  });
});
