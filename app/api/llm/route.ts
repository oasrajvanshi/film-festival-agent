// Server-side proxy to Ollama so the API key never reaches the browser.
import { ollamaFromEnv, type ChatMessage } from '../../../src/llm/ollama';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const llm = ollamaFromEnv();
  // ?test=1 makes one tiny model call, to check the key and model from a browser.
  if (llm && new URL(req.url).searchParams.get('test')) {
    const t0 = Date.now();
    try {
      const reply = await llm.chat([{ role: 'user', content: 'Reply with the single word OK.' }]);
      return Response.json({ available: true, model: llm.model, test: 'ok', ms: Date.now() - t0, reply: reply.slice(0, 40) });
    } catch (e) {
      console.error(`[llm] test failed model=${llm.model}: ${(e as Error).message}`);
      return Response.json({ available: true, model: llm.model, test: 'failed', ms: Date.now() - t0, error: (e as Error).message.slice(0, 300) });
    }
  }
  return Response.json({ available: !!llm, model: llm?.model ?? null });
}

export async function POST(req: Request) {
  const llm = ollamaFromEnv();
  if (!llm) return Response.json({ error: 'OLLAMA_API_KEY is not set' }, { status: 503 });
  const body = await req.json() as { messages: ChatMessage[]; json?: boolean };
  if (!Array.isArray(body.messages) || body.messages.length > 10) return Response.json({ error: 'bad request' }, { status: 400 });
  try {
    const content = await llm.chat(body.messages, { json: !!body.json });
    console.log(`[llm] ok model=${llm.model} chars=${content.length}`);
    return Response.json({ content });
  } catch (e) {
    console.error(`[llm] failed model=${llm.model}: ${(e as Error).message}`);
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
