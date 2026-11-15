import { describe, expect, it } from 'vitest';
import { festivalDates } from '../src/onboard/mapping';
import { festivalDays } from '../src/core/types';

describe('festival length', () => {
  it('supports festivals longer than three days', () => {
    const d = festivalDates({ name: 'Long Fest', startDate: '2027-04-15', days: 10 });
    expect(d).toHaveLength(10);
    expect(d[9]).toBe('2027-04-24');
    expect(festivalDays({ dates: Object.fromEntries(d.map((x, i) => [i + 1, x])) })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('keeps one-day festivals to one date', () => {
    expect(festivalDates({ name: 'One', startDate: '2027-04-15', days: 1 })).toEqual(['2027-04-15']);
  });
});
