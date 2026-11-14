// Ollama client for the backend: native tool calling (`tools`), structured
// output (`format` with a JSON schema), and thinking switched off for speed.
// Local by default (http://localhost:11434, qwen3:8b). For Ollama Cloud set
// OLLAMA_HOST=https://ollama.com and OLLAMA_API_KEY.

export interface ToolCall { id?: string; function: { name: string; arguments: Record<string, unknown> | string } }

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
  tool_call_id?: string;
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  messages: LlmMessage[];
  tools?: ToolSpec[];
  /** 'json' or a JSON schema the reply must follow. */
  format?: 'json' | Record<string, unknown>;
}

export interface ChatResult { message: LlmMessage; ms: number; promptTokens?: number; outputTokens?: number }

export interface Llm {
  readonly model: string;
  chat(req: ChatRequest): Promise<ChatResult>;
}

export interface OllamaOptions {
  host?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  /** Thinking models (qwen3, gpt-oss) think before answering; off is faster and fine for tool calls. */
  think?: boolean;
  numCtx?: number;
  fetchImpl?: typeof fetch;
}

export function ollama(opts: OllamaOptions = {}): Llm {
  const host = (opts.host ?? 'http://localhost:11434').replace(/\/$/, '');
  const model = opts.model ?? 'qwen3:8b';
  const f = opts.fetchImpl ?? fetch;
  const auth: Record<string, string> = opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {};
  // Only thinking models (qwen3, gpt-oss) accept `think`; Llama 3.1 rejects it. Ask Ollama once.
  let caps: Promise<string[]> | undefined;
  const capabilities = () => (caps ??= f(`${host}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(5_000) })
    .then(r => (r.ok ? r.json() : {}) as Promise<{ capabilities?: string[] }>).then(j => j.capabilities ?? []).catch(() => []));
  return {
    model,
    async chat(req) {
      const t0 = Date.now();
      const thinking = (await capabilities()).includes('thinking');
      const res = await f(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          model, stream: false, keep_alive: '15m',
          ...(thinking ? { think: opts.think ?? false } : {}),
          messages: req.messages,
          ...(req.tools?.length ? { tools: req.tools } : {}),
          ...(req.format ? { format: req.format } : {}),
          options: { temperature: 0, num_ctx: opts.numCtx ?? 16384 },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const j = await res.json() as { message?: LlmMessage; prompt_eval_count?: number; eval_count?: number };
      const m = j.message ?? { role: 'assistant', content: '' };
      let calls = m.tool_calls ?? [];
      let content = m.content ?? '';
      if (!calls.length && req.tools?.length) {
        const parsed = toolCallsFromText(content, req.tools.map(t => t.function.name));
        if (parsed.length) { calls = parsed; content = ''; }
      }
      return {
        message: { role: 'assistant', content, ...(calls.length ? { tool_calls: calls } : {}) },
        ms: Date.now() - t0, promptTokens: j.prompt_eval_count, outputTokens: j.eval_count,
      };
    },
  };
}

/**
 * Llama 3.1 sometimes writes a tool call as JSON text instead of a real tool
 * call: {"name": "get_forecast", "parameters": {}}, maybe after
 * <|python_tag|>, maybe several separated by ";". Only known tool names count.
 */
export function toolCallsFromText(text: string, names: string[]): ToolCall[] {
  const t = text.replace(/<\|python_tag\|>/g, '').replace(/```(?:json)?/g, '').trim();
  if (!t.includes('{')) return [];
  const out: ToolCall[] = [];
  let depth = 0, start = -1, inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && depth > 0 && --depth === 0) {
      try {
        const o = JSON.parse(t.slice(start, i + 1)) as { name?: string; function?: { name?: string; arguments?: unknown }; parameters?: unknown; arguments?: unknown };
        const name = o.name ?? o.function?.name;
        const args = o.parameters ?? o.arguments ?? o.function?.arguments ?? {};
        if (name && names.includes(name)) out.push({ function: { name, arguments: args as Record<string, unknown> | string } });
      } catch { /* not a tool call */ }
    }
  }
  return out;
}

export const DEFAULT_MODELS = ['qwen3:8b', 'llama3.1:8b'];

/**
 * The models to try, in order: OLLAMA_MODEL (default qwen3:8b), then
 * OLLAMA_FALLBACK_MODEL (default llama3.1:8b; "none" for no fallback).
 * If a model fails, the next one takes over; after the last, rules finish.
 * OPS_LLM=off disables models; everything then runs on rules.
 */
export function llmsFromEnv(env: Record<string, string | undefined> = process.env): Llm[] {
  if (env.OPS_LLM === 'off') return [];
  // On a hosted deploy there is no local Ollama: use rules unless a host is set.
  if (env.VERCEL && !env.OLLAMA_HOST) return [];
  const host = env.OLLAMA_HOST ?? 'http://localhost:11434';
  if (host.includes('ollama.com') && !env.OLLAMA_API_KEY) return [];
  const names = [env.OLLAMA_MODEL ?? DEFAULT_MODELS[0], env.OLLAMA_FALLBACK_MODEL ?? DEFAULT_MODELS[1]]
    .filter((m, i, xs) => m && m !== 'none' && xs.indexOf(m) === i);
  return names.map(model => ollama({ host, model, apiKey: env.OLLAMA_API_KEY, think: env.OLLAMA_THINK === 'on' }));
}

/** The first model only. */
export function llmFromEnv(env: Record<string, string | undefined> = process.env): Llm | null {
  return llmsFromEnv(env)[0] ?? null;
}

export interface LlmHealth { host: string; model: string; reachable: boolean; installed: boolean; tools: boolean; error?: string }

/** Is Ollama up, is the model pulled, and can it call tools? */
export async function ollamaHealth(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch, modelName?: string): Promise<LlmHealth> {
  const host = (env.OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/$/, '');
  const model = modelName ?? env.OLLAMA_MODEL ?? DEFAULT_MODELS[0];
  const auth: Record<string, string> = env.OLLAMA_API_KEY ? { Authorization: `Bearer ${env.OLLAMA_API_KEY}` } : {};
  try {
    const r = await fetchImpl(`${host}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(5_000) });
    if (r.status === 404) return { host, model, reachable: true, installed: false, tools: false, error: `Model not pulled: run "ollama pull ${model}"` };
    if (!r.ok) return { host, model, reachable: true, installed: false, tools: false, error: `Ollama ${r.status}` };
    const j = await r.json() as { capabilities?: string[] };
    return { host, model, reachable: true, installed: true, tools: (j.capabilities ?? []).includes('tools') };
  } catch (e) {
    return { host, model, reachable: false, installed: false, tools: false, error: (e as Error).message };
  }
}
