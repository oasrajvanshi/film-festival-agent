// Replay a scenario against the backend and print what the agent did.
//
//   npm run ops -- snow                 # rules only (no model), deterministic
//   npm run ops -- guest-late --llm     # with Ollama: qwen3:8b, falling back to llama3.1:8b
//   npm run ops -- snow --model llama3.1:8b   # one model only, no fallback
//   npm run ops -- all --llm --json out.json
//
// Data: data/harbor-lights (snapshot of the team sheet) + data/scenario-extras.
// Set OPS_SHEET_ID to read the Google Sheet live instead.

import { readFile, writeFile } from 'node:fs/promises';
import { loadFestivalData } from '../src/backend/data/load';
import { clock } from '../src/backend/domain/time';
import { teamName } from '../src/backend/domain/view';
import { MemoryStore, initialState } from '../src/backend/engine/store';
import { llmsFromEnv, ollamaHealth } from '../src/backend/llm/ollama';
import { runScenario, type ScenarioFile, type StepResult } from '../src/backend/scenarios';
import { OpsBackend, type RunReport } from '../src/backend/service';
import type { OpsState } from '../src/backend/domain/types';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const names = args.filter((a, i) => !a.startsWith('--') && !['--json', '--model'].includes(args[i - 1] ?? ''));
const which = names[0] ?? 'all';
const files = which === 'all' ? ['snow', 'guest-late'] : [which];

const tty = process.stdout.isTTY;
const c = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = c('2'), bold = c('1'), red = c('31'), green = c('32'), amber = c('33'), cyan = c('36');

if (opt('model')) { process.env.OLLAMA_MODEL = opt('model'); process.env.OLLAMA_FALLBACK_MODEL = 'none'; }
const wantModel = flag('llm') || !!opt('model');
const llms = [];
for (const m of wantModel ? llmsFromEnv() : []) {
  const h = await ollamaHealth(process.env, fetch, m.model);
  if (h.reachable && h.installed && h.tools) llms.push(m);
  else console.log(amber(`${m.model} not usable (${h.error ?? 'cannot call tools'}); skipped.`));
}
const { data, warnings, source } = await loadFestivalData();
const store = new MemoryStore(() => initialState(data));
const backend = new OpsBackend({ data, store, llms, warnings });
console.log(dim(`${data.info.name} | data: ${source} | agent: ${llms.length ? `Ollama ${llms.map(m => m.model).join(', then ')}` : 'rules only'}`));
for (const w of warnings) console.log(dim(`  sheet warning: ${w}`));

let state: OpsState = await backend.state();
const decisionsShown = new Set<string>();

function printReport(r: RunReport, s: OpsState) {
  const pad = '       ';
  if (r.duplicate) { console.log(`${pad}${dim('duplicate trigger ignored')}`); return; }
  if (r.routes.length) console.log(`${pad}${cyan('route')}   ${r.routes.map(x => `${x.to}${'guestId' in x ? ` ${data.guests.find(g => g.id === x.guestId)?.name}` : ''}`).join(' + ')}${r.routedBy === 'llm' ? dim(' (model read the message)') : ''}  ${dim(r.routes.map(x => x.reason).join(' | '))}`);
  for (const a of r.agents) {
    const tools = a.tools.map(t => `${t.ok ? '' : '!'}${t.tool}${t.via === 'rules' && a.via === 'llm' ? '(rules)' : ''}`).join(' > ');
    console.log(`${pad}${cyan('agent')}   ${a.agent}${a.subject ? ` ${a.subject}` : ''} ${dim(`[${a.via === 'llm' ? `${a.model}, ${a.llmCalls} turns, ${(a.llmMs / 1000).toFixed(1)} s` : 'rules'}]`)} ${tools}${a.error ? red(` model error: ${a.error}`) : ''}`);
    for (const t of a.tools.filter(t => !t.ok)) console.log(`${pad}        ${amber(`! ${t.tool}: ${t.error}`)}`);
  }
  for (const x of r.automatic) console.log(`${pad}${green('auto')}    ${x}`);
  for (const x of r.watching) console.log(`${pad}${amber('watch')}   ${x}`);
  for (const x of r.review) console.log(`${pad}${amber('review')}  ${x}`);
  for (const x of r.deadlines) console.log(`${pad}${amber('timer')}   ${x}`);
  for (const d of r.decisions) {
    if (d.change !== 'created') { console.log(`${pad}${dim(`decision ${d.id} ${d.change}: ${d.title}`)}`); continue; }
    if (decisionsShown.has(d.id)) continue;
    decisionsShown.add(d.id);
    const dec = s.decisions.find(x => x.id === d.id)!;
    console.log(`${pad}${red(bold('DECISION'))} ${dec.id}  ${bold(dec.title)}  ${dim(`owner ${teamName(dec.owner)}, due ${clock(dec.deadline)}`)}`);
    console.log(`${pad}         ${dim(dec.why)}`);
    for (const o of dec.options) {
      const mark = o.key === dec.agentRecommendation.key ? bold('*') : ' ';
      const cost = `${o.cost.people} ${o.cost.people === 1 ? 'person' : 'people'}, ${o.cost.messages} ${o.cost.messages === 1 ? 'message' : 'messages'}${o.cost.money ? `, $${o.cost.money}` : ''}, ${o.cost.reversible ? 'reversible' : 'not reversible'}`;
      console.log(`${pad}         ${mark}${o.key} ${o.title} ${dim(`(${cost})`)}${o.key === dec.defaultOption ? dim(' [safe default]') : ''}`);
    }
    const agree = dec.agentRecommendation.key === dec.ruleRecommendation ? 'agrees with rules' : amber(`disagrees: rules say ${dec.ruleRecommendation}`);
    console.log(`${pad}         ${dim(`${dec.agentRecommendation.via === 'llm' ? `model (${dec.agentRecommendation.model})` : 'rules'} picks ${dec.agentRecommendation.key}, ${agree}:`)} ${dec.agentRecommendation.rationale}`);
  }
}

function printStep(st: StepResult, s: OpsState) {
  const t = clock(st.at).padStart(8);
  if (st.kind === 'decide') {
    const d = st.decide!;
    const who = data.staff.find(x => x.id === d.by);
    const res = d.result === 'ok' ? green('ok') : amber(d.result);
    console.log(`${bold(t)}  ${st.note ?? ''}\n       ${cyan('decide')}  ${who?.name ?? d.by} (${who ? teamName(who.team) : '?'}) picks ${d.option} on ${d.id}: ${res}${d.message ? dim(` ${d.message}`) : ''}`);
    if (d.result === 'ok') {
      const dec = s.decisions.find(x => x.id === d.id)!;
      const sent = s.outbox.filter(o => o.key.startsWith(`${dec.id}:${d.option}`));
      for (const o of sent) console.log(`       ${green('sent')}    ${o.channel.padEnd(6)} ${o.to}: ${dim(o.text)}`);
    }
  } else {
    console.log(`${bold(t)}  ${st.note ?? (st.kind === 'tick' ? 'Clock moves on' : '')}`);
  }
  for (const r of st.reports) printReport(r, s);
}

const results = [];
let allPassed = true;
for (const name of files) {
  const file = JSON.parse(await readFile(`data/scenarios/${name}.json`, 'utf8')) as ScenarioFile;
  console.log(`\n${bold(`== ${file.title} ==`)}\n${dim(file.description)}\n`);
  const res = await runScenario(backend, file, async st => { state = await backend.state(); printStep(st, state); });
  console.log(`\n${bold('Checks')}`);
  for (const ch of res.checks) console.log(`  ${ch.pass ? green('pass') : red('FAIL')}  ${ch.label} ${dim(`(${ch.detail})`)}`);
  const s = res.state;
  console.log(dim(`\n  ${s.decisions.length} decisions, ${s.outbox.length} messages in the outbox, ${s.flags.length} flags, ${s.timers.filter(t => !t.fired).length} timers waiting, ${s.audit.length} audit entries`));
  allPassed &&= res.passed;
  results.push({ name, passed: res.passed, checks: res.checks, decisions: s.decisions, outbox: s.outbox, flags: s.flags, audit: s.audit });
}
if (opt('json')) await writeFile(opt('json')!, JSON.stringify(results, null, 2));
console.log(`\n${allPassed ? green(bold('All checks passed')) : red(bold('Some checks failed'))}`);
process.exitCode = allPassed ? 0 : 1;
