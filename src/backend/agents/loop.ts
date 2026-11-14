// The tool-calling loop for one specialist agent.
//
//   model turn ─▶ tool calls ─▶ validate args ─▶ run tool ─▶ result back to model ─▶ ...
//                                   │ bad args / unknown tool / ungrounded reason
//                                   └─▶ error back to model, which can correct itself
//
// The loop ends when every decision from the plan tools is submitted, the
// model stops calling tools, or the step limit is hit. Whatever the model
// leaves undone is finished by rules, and if the model is unreachable the
// whole run falls back to rules. A decision always exists either way.

import type { Audit } from '../engine/audit';
import type { Llm, LlmMessage, ToolCall } from '../llm/ollama';
import { validate } from './schema';
import { toolSpec, type Tool, type ToolCtx } from './tools';

export interface ToolTrace { step: number; tool: string; args: unknown; ok: boolean; result?: unknown; error?: string; via: 'llm' | 'rules' }

export interface AgentOutcome {
  via: 'llm' | 'rules';
  model?: string;
  trace: ToolTrace[];
  final?: string;
  error?: string;
  llmCalls: number;
  llmMs: number;
}

export interface AgentSpec {
  name: 'weather' | 'guest';
  system: string;
  tools: Tool[];
  maxSteps: number;
  /** The fixed tool sequence the rules runner uses. */
  rulesSteps(ctx: ToolCtx): { tool: string; args: Record<string, unknown> }[];
}

const MAX_RESULT_CHARS = 6000;

export async function invokeTool(tools: Tool[], call: ToolCall, ctx: ToolCtx, audit: Audit, step: number, via: 'llm' | 'rules'): Promise<ToolTrace> {
  const name = call.function.name;
  let args: unknown = call.function.arguments;
  const trace: ToolTrace = { step, tool: name, args, ok: false, via };
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    trace.error = `Unknown tool "${name}". Available: ${tools.map(t => t.name).join(', ')}`;
  } else {
    if (typeof args === 'string') {
      try { args = args.trim() ? JSON.parse(args) : {}; } catch { args = undefined; }
    }
    // Small models (Llama 3.1) often send guest / session for guest_id / session_id.
    if (args && typeof args === 'object') {
      const a = args as Record<string, unknown>;
      for (const [alias, real] of [['guest', 'guest_id'], ['session', 'session_id'], ['ref', 'decision_ref']]) {
        if (a[alias] !== undefined && a[real] === undefined && tool.parameters.properties?.[real] && !tool.parameters.properties?.[alias]) { a[real] = a[alias]; delete a[alias]; }
      }
    }
    const checked = validate(tool.parameters, args);
    if (!checked.ok) trace.error = `Bad arguments: ${checked.errors.join('; ')}`;
    else {
      try {
        trace.result = await tool.run(ctx, checked.value as Record<string, unknown>);
        trace.args = checked.value;
        trace.ok = true;
        ctx.scratch.evidence.push(JSON.stringify(trace.result));
      } catch (e) {
        trace.error = (e as Error).message;
      }
    }
  }
  audit('tool', `${via === 'llm' ? 'model' : 'rules'} -> ${name}(${shortArgs(trace.args)})${trace.ok ? '' : ` failed: ${trace.error}`}`, { args: trace.args, ok: trace.ok, error: trace.error });
  return trace;
}

function shortArgs(a: unknown): string {
  if (!a || typeof a !== 'object') return '';
  return Object.entries(a as Record<string, unknown>).map(([k, v]) => `${k}=${typeof v === 'string' && v.length > 40 ? v.slice(0, 40) + '...' : JSON.stringify(v)}`).join(', ');
}

function pending(ctx: ToolCtx): string[] {
  return [...ctx.scratch.candidates.keys()].filter(r => !ctx.scratch.submitted.has(r));
}

export async function runWithModel(llm: Llm, spec: AgentSpec, ctx: ToolCtx, audit: Audit): Promise<AgentOutcome> {
  const out: AgentOutcome = { via: 'llm', model: llm.model, trace: [], llmCalls: 0, llmMs: 0 };
  const tools = spec.tools.map(toolSpec);
  const messages: LlmMessage[] = [{ role: 'system', content: spec.system }, { role: 'user', content: ctx.brief }];
  let nudged = false;
  for (let step = 0; step < spec.maxSteps; step++) {
    const res = await llm.chat({ messages, tools });
    out.llmCalls++; out.llmMs += res.ms;
    const calls = res.message.tool_calls ?? [];
    audit('llm', `${spec.name} agent, turn ${step + 1}: ${calls.length ? calls.map(c => c.function.name).join(', ') : `"${res.message.content.slice(0, 80)}"`}`,
      { ms: res.ms, promptTokens: res.promptTokens, outputTokens: res.outputTokens });
    messages.push(res.message);
    if (!calls.length) {
      out.final = res.message.content;
      const left = pending(ctx);
      if ((left.length || !ctx.scratch.planned) && !nudged) {
        nudged = true;
        messages.push({ role: 'user', content: ctx.scratch.planned
          ? `You still need to call submit_decision for: ${left.join(', ')}.`
          : 'Call the plan tool first, then submit_decision for each decision_ref.' });
        continue;
      }
      break;
    }
    for (const call of calls) {
      const t = await invokeTool(spec.tools, call, ctx, audit, step, 'llm');
      out.trace.push(t);
      messages.push({ role: 'tool', tool_name: call.function.name, ...(call.id ? { tool_call_id: call.id } : {}),
        content: JSON.stringify(t.ok ? t.result : { error: t.error }).slice(0, MAX_RESULT_CHARS) });
    }
    if (ctx.scratch.planned && !pending(ctx).length) break;
  }
  return out;
}

export async function runWithRules(spec: AgentSpec, ctx: ToolCtx, audit: Audit, prior?: AgentOutcome): Promise<AgentOutcome> {
  const out: AgentOutcome = prior ?? { via: 'rules', trace: [], llmCalls: 0, llmMs: 0 };
  const step = (prior?.trace.length ?? 0) + 100;
  if (!ctx.scratch.planned) {
    for (const s of spec.rulesSteps(ctx)) out.trace.push(await invokeTool(spec.tools, { function: { name: s.tool, arguments: s.args } }, ctx, audit, step, 'rules'));
  }
  // Finish any decision the model left without a recommendation.
  for (const ref of pending(ctx)) {
    const c = ctx.scratch.candidates.get(ref)!;
    ctx.scratch.submitted.set(ref, { key: c.ruleRecommendation, rationale: c.ruleReason, via: 'rules' });
    audit('tool', `rules -> submit_decision(decision_ref="${ref}", recommended_option="${c.ruleRecommendation}")`, { ref });
  }
  return out;
}

/**
 * Models in order (Qwen, then Llama), rules for whatever is left. If a model
 * fails (down, not pulled, timed out), the next one starts over on the same
 * scratch; anything it already submitted stands. After the last, rules finish.
 */
export async function runAgent(llm: Llm | Llm[] | null, spec: AgentSpec, ctx: ToolCtx, audit: Audit): Promise<AgentOutcome> {
  const chain = Array.isArray(llm) ? llm : llm ? [llm] : [];
  const errors: string[] = [];
  for (const [i, m] of chain.entries()) {
    try {
      const out = await runWithModel(m, spec, ctx, audit);
      const done = await runWithRules(spec, ctx, audit, out);
      return errors.length ? { ...done, error: errors.join('; ') } : done;
    } catch (e) {
      errors.push(`${m.model}: ${(e as Error).message}`);
      const next = chain[i + 1];
      audit('error', `${spec.name} agent: ${m.model} failed (${(e as Error).message}); ${next ? `trying ${next.model}` : 'finishing on rules'}`);
    }
  }
  const out = await runWithRules(spec, ctx, audit);
  return errors.length ? { ...out, error: errors.join('; ') } : out;
}
