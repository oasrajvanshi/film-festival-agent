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
  return {
    model,
    async chat(req) {
      const t0 = Date.now();
      const res = await f(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}) },
        body: JSON.stringify({
          model, stream: false, think: opts.think ?? false, keep_alive: '15m',
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
      return {
        message: { role: 'assistant', content: m.content ?? '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) },
        ms: Date.now() - t0, promptTokens: j.prompt_eval_count, outputTokens: j.eval_count,
      };
    },
  };
}

/** OPS_LLM=off disables the model; everything then runs on rules. */
export function llmFromEnv(env: Record<string, string | undefined> = process.env): Llm | null {
  if (env.OPS_LLM === 'off') return null;
  const host = env.OLLAMA_HOST ?? 'http://localhost:11434';
  if (host.includes('ollama.com') && !env.OLLAMA_API_KEY) return null;
  return ollama({ host, model: env.OLLAMA_MODEL ?? 'qwen3:8b', apiKey: env.OLLAMA_API_KEY, think: env.OLLAMA_THINK === 'on' });
}

export interface LlmHealth { host: string; model: string; reachable: boolean; installed: boolean; tools: boolean; error?: string }

/** Is Ollama up, is the model pulled, and can it call tools? */
export async function ollamaHealth(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<LlmHealth> {
  const host = (env.OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/$/, '');
  const model = env.OLLAMA_MODEL ?? 'qwen3:8b';
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
