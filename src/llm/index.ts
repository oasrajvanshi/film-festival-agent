// Picks the language model from the environment: Groq if GROQ_API_KEY is set, otherwise Ollama.
import { groqFromEnv } from './groq';
import { ollamaFromEnv, type LlmClient } from './ollama';

export type { LlmClient, ChatMessage } from './ollama';

export function llmFromEnv(env: Record<string, string | undefined> = process.env): (LlmClient & { provider: 'groq' | 'ollama' }) | null {
  const g = groqFromEnv(env);
  if (g) return Object.assign(g, { provider: 'groq' as const });
  const o = ollamaFromEnv(env);
  return o ? Object.assign(o, { provider: 'ollama' as const }) : null;
}
