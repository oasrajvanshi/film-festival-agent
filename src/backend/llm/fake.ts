// A scripted stand-in for the model, for tests. Each turn returns either
// tool calls or text, chosen by a function of the conversation so far.

import type { ChatRequest, Llm, LlmMessage } from './ollama';

export type Script = (req: ChatRequest, turn: number) => Partial<LlmMessage> & { content?: string };

export function fakeLlm(script: Script, model = 'fake'): Llm & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  return {
    model,
    calls,
    async chat(req) {
      calls.push(structuredClone(req));
      const m = script(req, calls.length - 1);
      return { message: { role: 'assistant', content: m.content ?? '', ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) }, ms: 0 };
    },
  };
}

export const call = (name: string, args: Record<string, unknown> = {}) => ({ function: { name, arguments: args } });

/** The tool results the model has seen so far, by tool name. */
export function toolResults(req: ChatRequest, name: string): unknown[] {
  return req.messages.filter(m => m.role === 'tool' && m.tool_name === name).map(m => JSON.parse(m.content));
}
