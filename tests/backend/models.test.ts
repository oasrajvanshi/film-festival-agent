import { describe, expect, it } from 'vitest';
import { FestivalView } from '../../src/backend/domain/view';
import { initialState } from '../../src/backend/engine/store';
import { assess, backupsFor } from '../../src/backend/model/eta';
import { shuttleLoad } from '../../src/backend/model/shuttle';
import { summarizeSnow, travelRange } from '../../src/backend/model/snow';
import { loadData, SNOW, t } from './helpers';

describe('snow, ETA and shuttle models', () => {
  it('summarizes the forecast for the rest of the day', async () => {
    const d = await loadData();
    const s = summarizeSnow(SNOW, d.info, t('13:10'));
    expect(s).toMatchObject({ level: 'moderate', start: t('14:00'), end: t('19:00'), totalIn: 3, crossed: true });
    expect(summarizeSnow(SNOW, d.info, t('18:30')).crossed).toBe(false);
  });

  it('slows trips that overlap the snow, not the ones before it', async () => {
    const d = await loadData();
    const s = summarizeSnow(SNOW, d.info, t('13:10'));
    expect(travelRange(30, t('14:35'), s)).toEqual({ early: 30, likely: 44, late: 63, inSnow: true });
    expect(travelRange(10, t('11:00'), s).inSnow).toBe(false);
  });

  it('puts Pavel Kettering at risk at 1:10 pm and late after the email', async () => {
    const d = await loadData();
    const state = initialState(d, t('13:10'));
    state.conditions.forecast = SNOW;
    const v = new FestivalView(d, state);
    const entry = v.callsForSession('e-056').find(c => c.guestId === 'p-073')!;
    const snow = summarizeSnow(SNOW, d.info, t('13:10'));
    const a = assess(v, entry, t('13:10'), snow);
    expect(a.status).toBe('at_risk');
    expect(a.eta).toMatchObject({ early: t('15:05'), likely: t('15:19'), late: t('15:38') });

    state.conditions.reportedEtas['p-073'] = { key: 'reported_eta', value: t('16:20'), source: { kind: 'message', ref: 'Mara Quist (email)', quote: 'ETA is 4:20', at: t('14:58') } };
    expect(assess(v, entry, t('14:58'), snow).status).toBe('will_miss_start');
  });

  it('lists the named backup first, then free guests nearby', async () => {
    const d = await loadData();
    const state = initialState(d, t('13:10'));
    const v = new FestivalView(d, state);
    const b = backupsFor(v, 'e-056', t('13:10'), summarizeSnow(undefined, d.info, t('13:10')));
    expect(b[0]).toMatchObject({ guestId: 'p-084', designated: true, noCallTime: true });
    expect(b[0].basis[0]).toContain('Documentary Ethics Now');
    expect(b.slice(1).every(x => !x.designated)).toBe(true);
    // Guests on the panel, or busy at that time, are never offered.
    expect(b.map(x => x.guestId)).not.toContain('p-071');
    expect(b.map(x => x.guestId)).not.toContain('p-072');
  });

  it('computes shuttle load with the delay', async () => {
    const d = await loadData();
    const r = d.shuttles[0];
    const l = shuttleLoad(r, { routeId: r.id, from: t('14:00'), to: t('16:00'), expectedRiders: 60 }, 12);
    expect(l.capacity).toBe(75);
    expect(Math.round(l.load * 100)).toBe(80);
  });
});
