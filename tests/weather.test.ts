import { describe, expect, it } from 'vitest';
import { assessWeather, scenarioHours } from '../src/agent/weather';
import { FestivalAgent } from '../src/agent/agent';
import { buildFestival } from '../src/data/seed';

describe('weather watch', () => {
  it('finds the storm window and merges hours', () => {
    const r = assessWeather(scenarioHours('2027-04-15', 'storm'));
    expect(r.map(x => [x.hazard, x.from.slice(11), x.to.slice(11)])).toEqual([['storm', '15:00', '18:00']]);
    expect(assessWeather(scenarioHours('2027-04-15', 'clear'))).toEqual([]);
  });
  it('drafts updates for people with plans, staff heads-up runs on its own, and repeats are ignored', async () => {
    const a = new FestivalAgent(buildFestival());
    const { actions } = await a.onWeather(scenarioHours('2027-04-15', 'snow'), 'Demo');
    const notify = actions.filter(x => x.kind === 'notify_people');
    expect(notify.length).toBeGreaterThan(0);
    expect(a.queue.every(q => q.action.kind === 'notify_people')).toBe(true);
    expect(a.outbox.length).toBeGreaterThan(0);
    for (const m of notify.flatMap(x => x.messages ?? [])) {
      const p = a.f.people.find(x => x.id === m.personId)!;
      expect(['festival_staff', 'volunteer']).not.toContain(p.role);
      expect(m.body).toMatch(/arrive by/);
    }
    const again = await a.onWeather(scenarioHours('2027-04-15', 'snow'), 'Demo');
    expect(again.actions).toEqual([]);
  });
});
