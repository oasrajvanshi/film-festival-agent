import { describe, expect, it } from 'vitest';
import { normalizeHeader, parseCsv } from '../../src/backend/data/csv';
import { buildFestivalData, SheetError } from '../../src/backend/data/load';
import { tablesFromDir } from '../../src/backend/data/sheets';
import { FestivalView } from '../../src/backend/domain/view';
import { initialState } from '../../src/backend/engine/store';
import { parseTime, timeFromText } from '../../src/backend/domain/time';
import { loadData, t } from './helpers';

describe('reading the team workbook', () => {
  it('parses quoted CSV and normalizes headers', () => {
    const rows = parseCsv('"Event ID","Guest IDs","Title"\n"e-1","p-1, p-2","Q&A: ""Salt"", part 2"\n\n');
    expect(rows).toEqual([{ event_id: 'e-1', guest_ids: 'p-1, p-2', title: 'Q&A: "Salt", part 2' }]);
    expect(normalizeHeader('From \\ To (minutes)')).toBe('from_to_minutes');
    expect(normalizeHeader('Runtime (min)')).toBe('runtime_min');
  });

  it('loads Harbor Lights from the snapshot plus the scenario tabs', async () => {
    const d = await loadData();
    expect(d.info.name).toBe('Harbor Lights Film Festival');
    expect(d.info.dates[1]).toBe('2027-04-15');
    expect(d.sessions).toHaveLength(69);
    expect(d.guests).toHaveLength(15);
    expect(d.staff.filter(s => s.lead)).toHaveLength(10);
    expect(d.travel['pl-airport']['v-pier9']).toBe(30);
    expect(d.travel['v-pier9']['pl-airport']).toBe(30);
    const pavel = d.guests.find(g => g.id === 'p-073')!;
    expect(pavel.trips[0]).toMatchObject({ mode: 'flight', flight: 'DL2207', arrival: t('14:20') });
    expect(pavel.assistant?.name).toBe('Mara Quist');
  });

  it('gives speakers a default call time and keeps sheet rows and backups', async () => {
    const d = await loadData();
    const v = new FestivalView(d, initialState(d));
    const calls = v.callsForSession('e-056');
    expect(calls.find(c => c.guestId === 'p-073')).toMatchObject({ callTime: t('15:30'), callSource: 'sheet' });
    expect(calls.find(c => c.guestId === 'p-085')).toMatchObject({ callTime: t('15:30'), callSource: 'default' });
    expect(calls.find(c => c.guestId === 'p-084')).toMatchObject({ role: 'backup', callTime: undefined });
  });

  it('refuses a sheet with a broken reference, naming the tab and row', async () => {
    const tables = await tablesFromDir('data/harbor-lights', 'data/scenario-extras');
    tables.schedule[3] = { ...tables.schedule[3], venue_id: 'v-nowhere' };
    expect(() => buildFestivalData(tables)).toThrow(SheetError);
    try { buildFestivalData(tables); } catch (e) { expect((e as SheetError).problems.join()).toContain('Schedule grid row 5'); }
  });

  it('runs without the scenario tabs', async () => {
    const d = buildFestivalData(await tablesFromDir('data/harbor-lights')).data;
    expect(d.shuttles).toHaveLength(0);
    expect(d.guests.every(g => g.trips.length === 0)).toBe(true);
  });

  it('reads times from sheets and from messages', () => {
    expect(parseTime('14:30', '2027-04-15')).toBe('2027-04-15T14:30');
    expect(parseTime('4:00 PM', '2027-04-15')).toBe('2027-04-15T16:00');
    expect(timeFromText('Our new ETA is 4:20.', '2027-04-15')).toBe('2027-04-15T16:20');
    expect(timeFromText('around 11am', '2027-04-15')).toBe('2027-04-15T11:00');
  });
});
