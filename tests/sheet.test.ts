import { describe, expect, it } from 'vitest';
import { buildFestival } from '../src/data/seed';
import { festivalToTables, parseCsv, parseTime, tablesToFestival } from '../src/data/sheet';

describe('Google Sheet format', () => {
  it('round-trips the mock festival exactly', () => {
    const f = buildFestival();
    const { festival, errors } = tablesToFestival(festivalToTables(f));
    expect(errors).toEqual([]);
    expect(festival).toEqual(f);
  });
  it('reads times the way Sheets may show them', () => {
    expect(parseTime('10:00')).toBe('10:00');
    expect(parseTime('10:00:00')).toBe('10:00');
    expect(parseTime('2:30 PM')).toBe('14:30');
    expect(parseTime('12:15 am')).toBe('00:15');
    expect(parseTime('noon')).toBeNull();
  });
  it('reports bad rows with the tab and row number instead of loading', () => {
    const t = festivalToTables(buildFestival());
    t['Schedule grid'][3][6] = 'v-nowhere';
    t['Schedule grid'][4][2] = 'later';
    const { festival, errors } = tablesToFestival(t);
    expect(festival).toBeNull();
    expect(errors).toContain('Schedule grid, row 4: unknown venue "v-nowhere"');
    expect(errors.some(e => e.startsWith('Schedule grid, row 5: Start must be a time'))).toBe(true);
  });
  it('parses quoted CSV', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  });
  it('accepts "1,2,3" valid days that Sheets turned into 123', () => {
    const t = festivalToTables(buildFestival());
    const row = t.Passes.findIndex(r => r[1] === 'three_day');
    t.Passes[row][2] = '123';
    expect(tablesToFestival(t).festival!.passes[row - 1].validDays).toEqual([1, 2, 3]);
  });
});

import { fetchSheetTables, TABS } from '../src/data/sheet';
describe('reading the published sheet', () => {
  const toCsv = (t: string[][]) => t.map(r => r.map(c => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\n');
  it('fetches every tab by its fixed gid and loads the festival', async () => {
    const f = buildFestival();
    const tables = festivalToTables(f);
    const byGid = Object.fromEntries(Object.entries(TABS).map(([name, v]) => [v.gid, tables[name as keyof typeof tables]]));
    const fake = (async (url: string) => {
      const gid = Number(/gid=(\d+)/.exec(url)![1]);
      return new Response(toCsv(byGid[gid]), { status: 200 });
    }) as unknown as typeof fetch;
    const { festival, errors } = tablesToFestival(await fetchSheetTables('x'.repeat(30), fake));
    expect(errors).toEqual([]);
    expect(festival).toEqual(f);
  });
  it('explains a private sheet instead of parsing the login page', async () => {
    const fake = (async () => new Response('<html>Sign in</html>', { status: 200 })) as unknown as typeof fetch;
    await expect(fetchSheetTables('x'.repeat(30), fake)).rejects.toThrow(/anyone with the link can view/);
  });
});
