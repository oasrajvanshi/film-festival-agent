// Server-side proxy to Ollama so the API key never reaches the browser.
import { ollamaFromEnv, type ChatMessage } from '../../../src/llm/ollama';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const llm = ollamaFromEnv();
  return Response.json({ available: !!llm, model: llm?.model ?? null });
}

export async function POST(req: Request) {
  const llm = ollamaFromEnv();
  if (!llm) return Response.json({ error: 'OLLAMA_API_KEY is not set' }, { status: 503 });
  const body = await req.json() as { messages: ChatMessage[]; json?: boolean };
  if (!Array.isArray(body.messages) || body.messages.length > 10) return Response.json({ error: 'bad request' }, { status: 400 });
  try {
    const content = await llm.chat(body.messages, { json: !!body.json });
    return Response.json({ content });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
