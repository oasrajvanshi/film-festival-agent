import { describe, expect, it } from 'vitest';
import { call, fakeLlm, toolResults } from '../../src/backend/llm/fake';
import { ungrounded } from '../../src/backend/agents/tools';
import { backendFor, loadData, snowAt } from './helpers';

type Plan = { decisions: { decision_ref: string; rule_recommendation: string }[] };

describe('the model drives the tools; rules guard and finish', () => {
  it('follows tool calls, corrects a bad call, and records the model pick', async () => {
    const llm = fakeLlm((req, turn) => {
      const plans = toolResults(req, 'plan_weather_options') as Plan[];
      const isWeather = req.messages[0].content.includes('weather desk');
      if (!isWeather) return { content: 'DONE' };
      const errors = req.messages.filter(m => m.role === 'tool' && m.content.includes('"error"')).length;
      if (!req.messages.some(m => m.tool_name === 'get_forecast')) return { tool_calls: [call('get_forecast'), call('no_such_tool')] };
      if (!plans.length) return { tool_calls: [call('plan_weather_options')] };
      const refs = plans[0].decisions.map(d => d.decision_ref);
      if (errors < 2) return { tool_calls: [call('submit_decision', { decision_ref: refs[0], recommended_option: 'B', rationale: 'Snow starts at 9:15 pm.' })] };
      return { tool_calls: refs.map(r => call('submit_decision', { decision_ref: r, recommended_option: 'B', rationale: 'Holding is reversible and nobody is messaged yet.' })) };
      void turn;
    });
    const b = backendFor(await loadData(), llm);
    await b.ingest({ type: 'shuttle_update', at: '2027-04-15T13:05', routeId: 'r-loop', delayMin: 12 });
    const [r] = (await b.ingest(snowAt('13:10'))).slice(-1);
    const weather = r.agents.find(a => a.agent === 'weather')!;
    expect(weather.via).toBe('llm');
    expect(weather.tools.find(x => x.tool === 'no_such_tool')?.error).toContain('Unknown tool');
    expect(weather.tools.find(x => x.tool === 'submit_decision' && !x.ok)?.error).toContain('9:15');
    const s = await b.state();
    const notice = s.decisions.find(d => d.key.startsWith('weather:notice'))!;
    expect(notice.ruleRecommendation).toBe('A');
    expect(notice.agentRecommendation).toMatchObject({ key: 'B', via: 'llm', rationale: 'Holding is reversible and nobody is messaged yet.' });
  });

  it('finishes on rules when the model stops early or fails', async () => {
    const silent = fakeLlm(() => ({ content: 'I think everything is fine.' }));
    const b1 = backendFor(await loadData(), silent);
    await b1.ingest(snowAt('13:10'));
    const s1 = await b1.state();
    expect(s1.decisions.length).toBeGreaterThanOrEqual(2);
    expect(s1.decisions.every(d => d.agentRecommendation.via === 'rules')).toBe(true);

    const broken = { model: 'down', chat: async () => { throw new Error('connection refused'); } };
    const b2 = backendFor(await loadData(), broken);
    const [r] = (await b2.ingest(snowAt('13:10'))).slice(-1);
    expect(r.agents[0].error).toContain('connection refused');
    expect((await b2.state()).decisions.length).toBe(s1.decisions.length);
  });

  it('checks that numbers and times in a reason come from tool results', () => {
    const evidence = JSON.stringify({ eta: { latest: '3:38 pm' }, load_pct: 19, seats: 75 });
    expect(ungrounded('Latest ETA 3:38 pm; load 19% of 75 seats.', evidence)).toEqual([]);
    expect(ungrounded('Latest ETA 3:45 pm; 120 riders.', evidence)).toEqual(['3:45', '120']);
  });

  it('gives the weather desk no guest tools, and neither desk a send tool', async () => {
    const { WEATHER_TOOLS, GUEST_TOOLS } = await import('../../src/backend/agents/tools');
    expect(WEATHER_TOOLS.map(x => x.name)).not.toContain('get_guest');
    expect([...WEATHER_TOOLS, ...GUEST_TOOLS].some(x => /send|message|notify/.test(x.name))).toBe(false);
  });
});
