// Server-side proxy to Ollama so the API key never reaches the browser.
import { llmFromEnv, type ChatMessage } from '../../../src/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  // ?model= lets the test try another model without changing settings.
  const testModel = u.searchParams.get('test') ? u.searchParams.get('model') : null;
  const llm = llmFromEnv(testModel && /^[\w./:-]{1,80}$/.test(testModel) ? { ...process.env, OLLAMA_MODEL: testModel, GROQ_MODEL: testModel } : process.env);
  // ?test=1 makes one tiny model call, to check the key and model from a browser.
  if (llm && u.searchParams.get('test')) {
    const t0 = Date.now();
    try {
      const reply = await llm.chat([{ role: 'user', content: 'Reply with the single word OK.' }]);
      return Response.json({ available: true, provider: llm.provider, model: llm.model, test: 'ok', ms: Date.now() - t0, reply: reply.slice(0, 40) });
    } catch (e) {
      console.error(`[llm] test failed ${llm.provider} model=${llm.model}: ${(e as Error).message}`);
      return Response.json({ available: true, provider: llm.provider, model: llm.model, test: 'failed', ms: Date.now() - t0, error: (e as Error).message.slice(0, 300) });
    }
  }
  return Response.json({ available: !!llm, provider: llm?.provider ?? null, model: llm?.model ?? null });
}

export async function POST(req: Request) {
  const llm = llmFromEnv();
  if (!llm) return Response.json({ error: 'No model key is set (GROQ_API_KEY or OLLAMA_API_KEY)' }, { status: 503 });
  const body = await req.json() as { messages: ChatMessage[]; json?: boolean };
  if (!Array.isArray(body.messages) || body.messages.length > 10) return Response.json({ error: 'bad request' }, { status: 400 });
  try {
    const content = await llm.chat(body.messages, { json: !!body.json });
    console.log(`[llm] ok ${llm.provider} model=${llm.model} chars=${content.length}`);
    return Response.json({ content });
  } catch (e) {
    console.error(`[llm] failed ${llm.provider} model=${llm.model}: ${(e as Error).message}`);
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
