import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/backend/scenarios';
import { backendFor, loadData, scenario } from './helpers';

describe('the two scenarios, on rules only', () => {
  for (const name of ['snow', 'guest-late']) {
    it(`${name}: every check passes`, async () => {
      const res = await runScenario(backendFor(await loadData()), await scenario(name));
      expect(res.checks.filter(c => !c.pass)).toEqual([]);
    });
  }
});
