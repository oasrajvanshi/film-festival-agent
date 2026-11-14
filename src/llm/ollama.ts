// Thin client for the Ollama API (Ollama Cloud by default).
// The key is read from OLLAMA_API_KEY and never logged. With no key, callers
// fall back to deterministic behaviour, so tests and demos run offline.

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface LlmClient {
  chat(messages: ChatMessage[], opts?: { json?: boolean }): Promise<string>;
  readonly model: string;
}

export function ollamaFromEnv(env: Record<string, string | undefined> = process.env): LlmClient | null {
  const key = env.OLLAMA_API_KEY;
  const host = (env.OLLAMA_HOST ?? 'https://ollama.com').replace(/\/$/, '');
  const model = env.OLLAMA_MODEL ?? 'gpt-oss:120b';
  // A local Ollama needs no key; Ollama Cloud does.
  if (!key && host.includes('ollama.com')) return null;
  return {
    model,
    async chat(messages, opts = {}) {
      const res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model, messages, stream: false, ...(opts.json ? { format: 'json' } : {}), options: { temperature: 0 } }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json() as { message?: { content?: string } };
      return data.message?.content ?? '';
    },
  };
}
