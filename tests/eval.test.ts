import { describe, expect, it } from 'vitest';
import { evalGuestClashes, evalQuestions, evalScans, evalScheduleChanges } from '../src/eval/scenarios';

// The proposal's four pass marks, as tests.
describe('evaluation on the scripted festival day', () => {
  it('5 schedule changes: all 5, none to the wrong person', async () => {
    const r = await evalScheduleChanges();
    expect(r.cases.filter(c => !c.passed)).toEqual([]);
    expect(r.total).toBe(5);
  });
  it('3 planted guest clashes: 3 of 3', async () => {
    const r = await evalGuestClashes();
    expect(r.cases.filter(c => !c.passed)).toEqual([]);
    expect(r.total).toBe(3);
  });
  it('20 QR scans: 20 of 20', () => {
    const r = evalScans();
    expect(r.cases.filter(c => !c.passed)).toEqual([]);
    expect(r.total).toBe(20);
  });
  it('10 questions: 10 of 10, from documents or "I don\'t know"', async () => {
    const r = await evalQuestions();
    expect(r.cases.filter(c => !c.passed)).toEqual([]);
    expect(r.total).toBe(10);
  });
});

describe('random festivals with planted problems', async () => {
  const { evalRandomFestivals } = await import('../src/eval/fuzz');
  it('finds every planted problem with no false alarms', () => {
    const r = evalRandomFestivals(20);
    expect(r.passed).toBe(r.total);
  });
});
