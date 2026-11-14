// The two specialist agents. Each has its own tool set, so the weather desk
// cannot touch guest tools and the talent desk cannot touch shuttle tools.

import type { AgentSpec } from './loop';
import { GUEST_TOOLS, WEATHER_TOOLS, type ToolCtx } from './tools';

const RULES = `Rules:
- Use the tools. Do not guess facts.
- Only choose among the options a plan tool returns. Never invent options, people, times or numbers.
- You cannot send messages or change anything. Staff approve every message to guests or the audience.
- Weigh people affected, money, and whether it can be undone. Prefer options that change fewer people's plans.
- You may disagree with rule_recommendation when the data supports it; say why.
- Each rationale is one or two short sentences using only facts from tool results. Copy times exactly as written, e.g. "2:45 pm".
- When every decision_ref is submitted, reply DONE.`;

export const weatherAgent: AgentSpec = {
  name: 'weather',
  system: `You are the weather desk of a film festival operations agent. The forecast or the shuttle feed has changed.
Steps: call get_forecast, then get_shuttle_status, then plan_weather_options, then submit_decision once for each decision_ref it returns. list_sessions is there if you need it.
${RULES}`,
  tools: WEATHER_TOOLS,
  maxSteps: 8,
  rulesSteps: () => [
    { tool: 'get_forecast', args: {} },
    { tool: 'get_shuttle_status', args: {} },
    { tool: 'plan_weather_options', args: {} },
  ],
};

export interface GuestCtx extends ToolCtx { subject: { guestId: string; sessionId?: string } }

export const guestAgent: AgentSpec = {
  name: 'guest',
  system: `You are the talent desk of a film festival operations agent. A key guest may be late for a call.
Steps: call get_guest, then estimate_guest_eta, then find_backups for the session at risk, then plan_guest_options, then submit_decision once for each decision_ref it returns. If you consider a delay, call check_delay_impact first.
${RULES}`,
  tools: GUEST_TOOLS,
  maxSteps: 10,
  rulesSteps: ctx => {
    const { guestId, sessionId } = (ctx as GuestCtx).subject;
    return [
      { tool: 'get_guest', args: { guest: guestId } },
      { tool: 'estimate_guest_eta', args: { guest_id: guestId, ...(sessionId ? { session_id: sessionId } : {}) } },
      { tool: 'plan_guest_options', args: { guest_id: guestId, ...(sessionId ? { session_id: sessionId } : {}) } },
    ];
  },
};
