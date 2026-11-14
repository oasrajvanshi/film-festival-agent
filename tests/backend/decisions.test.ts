import { describe, expect, it } from 'vitest';
import { DecisionError } from '../../src/backend/engine/decisions';
import { backendFor, loadData, snowAt, t } from './helpers';

describe('decision state machine and durable timers', () => {
  it('serializes two people deciding at once', async () => {
    const b = backendFor(await loadData());
    await b.ingest(snowAt('13:10'));
    const s = await b.state();
    const d = s.decisions.find(x => x.key.startsWith('weather:notice'))!;
    await b.decide(d.id, { action: 'approve', option: 'A', by: 'p-008', version: d.version });
    await expect(b.decide(d.id, { action: 'approve', option: 'B', by: 'p-002', version: d.version })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects a stale version even while the decision is open', async () => {
    const b = backendFor(await loadData());
    await b.ingest(snowAt('13:10'));
    const d = (await b.state()).decisions.find(x => x.key.startsWith('guest:p-073'))!;
    const err = await b.decide(d.id, { action: 'approve', option: 'A', by: 'p-005', version: d.version - 1 }).catch(e => e);
    expect(err).toBeInstanceOf(DecisionError);
    expect(err.message).toContain('changed since you loaded it');
  });

  it('sends each message once, even if the same trigger arrives twice', async () => {
    const b = backendFor(await loadData());
    await b.ingest(snowAt('13:10'));
    const before = (await b.state()).outbox.length;
    const [again] = (await b.ingest(snowAt('13:10'))).slice(-1);
    expect(again.duplicate).toBe(true);
    expect((await b.state()).outbox.length).toBe(before);
  });

  it('runs the safe default at the deadline, or escalates when there is none', async () => {
    const b = backendFor(await loadData());
    await b.ingest({ type: 'shuttle_update', at: t('13:05'), routeId: 'r-loop', delayMin: 12 });
    await b.ingest(snowAt('13:10'));
    await b.tick(t('13:45'));
    const s = await b.state();
    const notice = s.decisions.find(x => x.key.startsWith('weather:notice'))!;
    const bus = s.decisions.find(x => x.key.startsWith('weather:shuttle'))!;
    // Weather notice: the safe default is "hold", so nothing public went out.
    expect(notice.chosen).toMatchObject({ key: 'B', via: 'deadline' });
    expect(s.outbox.filter(o => o.kind === 'broadcast')).toHaveLength(0);
    expect(bus.chosen).toMatchObject({ key: 'A', via: 'deadline' });
    expect(s.outbox.some(o => o.template === 'default_ran')).toBe(true);
  });

  it('escalates a late-guest decision with no safe option', async () => {
    const b = backendFor(await loadData());
    await b.ingest(snowAt('14:30'));
    await b.ingest({ type: 'inbound_message', at: t('14:58'), channel: 'email', from: 'mara.quist@example.test', text: 'Car stuck in snow, new ETA 4:20.' });
    await b.tick(t('15:50'));
    const s = await b.state();
    // The earlier at-risk decision ran its safe default ("wait") at 2:45 pm; the newest one is the late decision.
    expect(s.decisions.find(x => x.key === 'guest:p-073:e-056')!.chosen).toMatchObject({ key: 'B', via: 'deadline' });
    const d = [...s.decisions].reverse().find(x => x.key === 'guest:p-073:e-056')!;
    expect(d.defaultOption).toBeNull();
    expect(d).toMatchObject({ status: 'open', escalated: true });
    expect(s.outbox.filter(o => o.template === 'escalation').map(o => o.to).join()).toContain('Kaia Ivers');
    expect(s.outbox.filter(o => o.kind === 'message_guest')).toHaveLength(0);
  });

  it('keeps timers in the store, so a restarted backend still fires them', async () => {
    const d = await loadData();
    const b1 = backendFor(d);
    await b1.ingest(snowAt('13:10'));
    const saved = await b1.state();
    const { OpsBackend } = await import('../../src/backend/service');
    const { MemoryStore } = await import('../../src/backend/engine/store');
    const b2 = new OpsBackend({ data: d, store: new MemoryStore(() => structuredClone(saved)) });
    const reports = await b2.tick(t('16:00'));
    expect(reports.some(r => r.trigger.startsWith('Deadline'))).toBe(true);
    expect(reports.some(r => r.trigger.startsWith('Re-check'))).toBe(true);
  });
});
