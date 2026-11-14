// Thin client for Groq's OpenAI-compatible API (free tier available at console.groq.com).
// The key is read from GROQ_API_KEY and never logged.
import type { LlmClient } from './ollama';

export function groqFromEnv(env: Record<string, string | undefined> = process.env): LlmClient | null {
  const key = env.GROQ_API_KEY;
  if (!key) return null;
  const model = env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
  const reasoning = /gpt-oss/i.test(model);
  return {
    model,
    async chat(messages, opts = {}) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model, messages, temperature: 0,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
          ...(reasoning ? { reasoning_effort: 'low' } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}
