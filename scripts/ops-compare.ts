// Run both scenarios once per model, each model on its own (no fallback),
// plus a rules-only baseline, and compare.
//
//   npm run ops:compare                                  # qwen3:8b and llama3.1:8b
//   npm run ops:compare -- --models qwen3:8b,llama3.2:3b

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadFestivalData } from '../src/backend/data/load';
import { MemoryStore, initialState } from '../src/backend/engine/store';
import { DEFAULT_MODELS, ollama, ollamaHealth, type Llm } from '../src/backend/llm/ollama';
import { runScenario, type ScenarioFile } from '../src/backend/scenarios';
import { OpsBackend } from '../src/backend/service';

const i = process.argv.indexOf('--models');
const models = i >= 0 ? process.argv[i + 1].split(',') : DEFAULT_MODELS;
const scenarios = await Promise.all(['snow', 'guest-late'].map(async n => JSON.parse(await readFile(`data/scenarios/${n}.json`, 'utf8')) as ScenarioFile));
const { data } = await loadFestivalData();

interface Row { model: string; checks: string; picked: string; agrees: string; toolCalls: number; failedCalls: number; turns: number; seconds: number; inbound: string; fellBack: number; note?: string }

async function measure(model: string, llm: Llm | null): Promise<Row> {
  const backend = new OpsBackend({ data, store: new MemoryStore(() => initialState(data)), llm });
  let pass = 0, total = 0, picked = 0, decisions = 0, agrees = 0, calls = 0, failed = 0, turns = 0, ms = 0, inboundLlm = 0, inbound = 0, fellBack = 0;
  const t0 = Date.now();
  for (const file of scenarios) {
    const res = await runScenario(backend, file);
    pass += res.checks.filter(c => c.pass).length; total += res.checks.length;
    for (const d of res.state.decisions) {
      decisions++;
      if (d.agentRecommendation.via === 'llm') { picked++; if (d.agentRecommendation.key === d.ruleRecommendation) agrees++; }
    }
    for (const r of res.steps.flatMap(s => s.reports)) {
      for (const a of r.agents) {
        turns += a.llmCalls; ms += a.llmMs;
        const byModel = a.tools.filter(x => x.via === 'llm');
        calls += byModel.length; failed += byModel.filter(x => !x.ok).length;
        if (a.error) fellBack++;
      }
      // Messages from unknown senders never reach a model, so they do not count here.
      if (r.trigger.startsWith('Inbound') && !r.routes.some(x => x.reason.includes('not on the guest or staff sheets'))) { inbound++; if (r.routedBy === 'llm') inboundLlm++; }
    }
  }
  return {
    model, checks: `${pass}/${total}`, picked: llm ? `${picked}/${decisions}` : '-', agrees: llm ? `${agrees}/${picked}` : '-',
    toolCalls: calls, failedCalls: failed, turns, seconds: Math.round((llm ? ms : Date.now() - t0) / 100) / 10,
    inbound: llm ? `${inboundLlm}/${inbound}` : '-', fellBack,
  };
}

const rows: Row[] = [];
for (const m of models) {
  const h = await ollamaHealth(process.env, fetch, m);
  if (!h.installed || !h.tools) { rows.push({ model: m, checks: '-', picked: '-', agrees: '-', toolCalls: 0, failedCalls: 0, turns: 0, seconds: 0, inbound: '-', fellBack: 0, note: h.error ?? 'cannot call tools' }); continue; }
  process.stdout.write(`running ${m} ... `);
  rows.push(await measure(m, ollama({ host: process.env.OLLAMA_HOST, model: m, apiKey: process.env.OLLAMA_API_KEY })));
  console.log('done');
}
rows.push(await measure('rules only', null));

const head = ['Model', 'Checks', 'Model picked', 'Agrees with rules', 'Tool calls', 'Refused calls', 'Model turns', 'Model time (s)', 'Emails read by model', 'Model errors'];
const table = [head, ...rows.map(r => [r.model, r.checks, r.picked, r.agrees, String(r.toolCalls), String(r.failedCalls), String(r.turns), String(r.seconds), r.inbound, r.note ?? String(r.fellBack)])];
const widths = head.map((_, c) => Math.max(...table.map(r => r[c].length)));
console.log('\n' + table.map(r => r.map((x, c) => x.padEnd(widths[c])).join('  ')).join('\n'));
await mkdir('.data', { recursive: true });
await writeFile('.data/model-compare.json', JSON.stringify(rows, null, 2));
