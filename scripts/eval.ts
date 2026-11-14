// npm run eval            → offline (no model)
// npm run eval -- --llm   → uses Ollama if OLLAMA_API_KEY is set
import { runAll } from '../src/eval/scenarios';
import { ollamaFromEnv } from '../src/llm/ollama';

const useLlm = process.argv.includes('--llm');
const llm = useLlm ? ollamaFromEnv() : null;
if (useLlm && !llm) console.log('No OLLAMA_API_KEY set; running offline.\n');

const suites = await runAll(llm);
let allPass = true;
for (const s of suites) {
  const ok = s.passed === s.total;
  allPass &&= ok;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.suite}: ${s.passed}/${s.total}  (pass mark: ${s.passMark})`);
  for (const c of s.cases) console.log(`   ${c.passed ? '✓' : '✗'} ${c.name} — ${c.detail}`);
  console.log();
}
process.exit(allPass ? 0 : 1);
