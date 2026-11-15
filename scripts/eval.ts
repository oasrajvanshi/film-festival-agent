// npm run eval            → offline (no model)
// npm run eval -- --llm   → uses Groq or Ollama if GROQ_API_KEY or OLLAMA_API_KEY is set
import { runAll } from '../src/eval/scenarios';
import { evalRandomFestivals } from '../src/eval/fuzz';
import { llmFromEnv } from '../src/llm';

const useLlm = process.argv.includes('--llm');
const llm = useLlm ? llmFromEnv() : null;
if (useLlm && !llm) console.log('No GROQ_API_KEY or OLLAMA_API_KEY set; running offline.\n');

const suites = [...await runAll(llm), evalRandomFestivals(50)];
let allPass = true;
for (const s of suites) {
  const ok = s.passed === s.total;
  allPass &&= ok;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.suite}: ${s.passed}/${s.total}  (pass mark: ${s.passMark})`);
  for (const c of s.cases) console.log(`   ${c.passed ? '✓' : '✗'} ${c.name} — ${c.detail}`);
  console.log();
}
process.exit(allPass ? 0 : 1);
