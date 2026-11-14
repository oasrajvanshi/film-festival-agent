import { describe, expect, it } from 'vitest';
import { fakeLlm, call } from '../../src/backend/llm/fake';
import { llmsFromEnv, ollama, toolCallsFromText } from '../../src/backend/llm/ollama';
import { backendFor, loadData, snowAt } from './helpers';
import { OpsBackend } from '../../src/backend/service';
import { MemoryStore, initialState } from '../../src/backend/engine/store';

describe('Qwen and Llama', () => {
  it('reads Llama-style tool calls written as JSON text, known tools only', () => {
    const names = ['get_forecast', 'submit_decision'];
    expect(toolCallsFromText('{"name": "get_forecast", "parameters": {}}', names)).toEqual([call('get_forecast', {})]);
    expect(toolCallsFromText('<|python_tag|>{"name": "submit_decision", "parameters": {"decision_ref": "x", "recommended_option": "A", "rationale": "a {b}"}}; {"name": "get_forecast", "parameters": {}}', names))
      .toEqual([call('submit_decision', { decision_ref: 'x', recommended_option: 'A', rationale: 'a {b}' }), call('get_forecast', {})]);
    expect(toolCallsFromText('{"name": "send_sms", "parameters": {"to": "everyone"}}', names)).toEqual([]);
    expect(toolCallsFromText('The forecast looks fine.', names)).toEqual([]);
  });

  it('defaults to qwen3:8b first and llama3.1:8b as fallback', () => {
    expect(llmsFromEnv({}).map(m => m.model)).toEqual(['qwen3:8b', 'llama3.1:8b']);
    expect(llmsFromEnv({ OLLAMA_FALLBACK_MODEL: 'none' }).map(m => m.model)).toEqual(['qwen3:8b']);
    expect(llmsFromEnv({ OLLAMA_MODEL: 'llama3.1:8b' }).map(m => m.model)).toEqual(['llama3.1:8b']);
    expect(llmsFromEnv({ OPS_LLM: 'off' })).toEqual([]);
  });

  it('sends think only to models that can think', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      if (url.endsWith('/api/show')) return new Response(JSON.stringify({ capabilities: body.model.startsWith('qwen') ? ['completion', 'tools', 'thinking'] : ['completion', 'tools'] }));
      bodies.push(body);
      return new Response(JSON.stringify({ message: { role: 'assistant', content: 'ok' } }));
    }) as unknown as typeof fetch;
    await ollama({ model: 'qwen3:8b', fetchImpl }).chat({ messages: [] });
    await ollama({ model: 'llama3.1:8b', fetchImpl }).chat({ messages: [] });
    expect(bodies[0]).toHaveProperty('think', false);
    expect(bodies[1]).not.toHaveProperty('think');
  });

  it('falls back from Qwen to Llama when Qwen fails, then the decision is Llama\'s', async () => {
    const qwen = { model: 'qwen3:8b', chat: async () => { throw new Error('model not found'); } };
    const llama = fakeLlm(req => {
      const tools = req.messages.filter(m => m.role === 'tool').map(m => m.tool_name);
      if (!req.messages[0].content.includes('weather desk')) return { content: 'DONE' };
      if (!tools.includes('plan_weather_options')) return { tool_calls: [call('plan_weather_options')] };
      const plan = JSON.parse(req.messages.filter(m => m.tool_name === 'plan_weather_options').pop()!.content);
      return { tool_calls: plan.decisions.map((d: { decision_ref: string; rule_recommendation: string }) => call('submit_decision', { decision_ref: d.decision_ref, recommended_option: d.rule_recommendation, rationale: 'Same as the rules.' })) };
    }, 'llama3.1:8b');
    const d = await loadData();
    const b = new OpsBackend({ data: d, store: new MemoryStore(() => initialState(d)), llms: [qwen, llama] });
    const [r] = (await b.ingest(snowAt('13:10'))).slice(-1);
    const weather = r.agents.find(a => a.agent === 'weather')!;
    expect(weather).toMatchObject({ via: 'llm', model: 'llama3.1:8b' });
    expect(weather.error).toContain('qwen3:8b: model not found');
    const s = await b.state();
    expect(s.decisions.find(x => x.key.startsWith('weather:notice'))!.agentRecommendation).toMatchObject({ via: 'llm', model: 'llama3.1:8b' });
    expect(s.audit.some(e => e.summary.includes('trying llama3.1:8b'))).toBe(true);
  });

  it('finishes on rules when both models fail', async () => {
    const down = (model: string) => ({ model, chat: async () => { throw new Error('connection refused'); } });
    const d = await loadData();
    const b = new OpsBackend({ data: d, store: new MemoryStore(() => initialState(d)), llms: [down('qwen3:8b'), down('llama3.1:8b')] });
    await b.ingest(snowAt('13:10'));
    const rulesOnly = backendFor(d);
    await rulesOnly.ingest(snowAt('13:10'));
    expect((await b.state()).decisions.map(x => x.key)).toEqual((await rulesOnly.state()).decisions.map(x => x.key));
  });
});
