'use client';
// Runs the agent in the browser and keeps its state in localStorage, so the
// prototype needs no database. Model calls go through /api/llm (server-side key).

import { useCallback, useEffect, useRef, useState } from 'react';
import { FestivalAgent } from '../../src/agent/agent';
import { buildFestival } from '../../src/data/seed';
import type { LlmClient, ChatMessage } from '../../src/llm/ollama';

const KEY = 'ffa-state-v1';

export const remoteLlm: LlmClient = {
  model: 'server',
  async chat(messages: ChatMessage[], opts?: { json?: boolean }) {
    const r = await fetch('/api/llm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, json: opts?.json }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `LLM ${r.status}`);
    return (await r.json()).content as string;
  },
};

export function useAgent() {
  const clockRef = useRef('2027-04-15T09:00');
  const [clock, setClockState] = useState(clockRef.current);
  const [version, setVersion] = useState(0);
  const [llmInfo, setLlmInfo] = useState<{ available: boolean; model: string | null }>({ available: false, model: null });
  const [useModel, setUseModel] = useState(false);
  const agentRef = useRef<FestivalAgent | null>(null);
  const now = useCallback(() => clockRef.current, []);

  if (!agentRef.current) agentRef.current = new FestivalAgent(buildFestival(), null, now);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        agentRef.current = FestivalAgent.restore(s.agent, null, now);
        clockRef.current = s.clock ?? clockRef.current;
        setClockState(clockRef.current);
      } else {
        agentRef.current!.sweepClashes();
      }
    } catch { /* fresh state */ }
    setVersion(v => v + 1);
    fetch('/api/llm').then(r => r.json()).then(setLlmInfo).catch(() => {});
  }, [now]);

  useEffect(() => {
    agentRef.current!.setLlm(useModel && llmInfo.available ? remoteLlm : null);
  }, [useModel, llmInfo.available, version]);

  const commit = useCallback(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ agent: agentRef.current!.snapshot(), clock: clockRef.current })); } catch { /* ignore */ }
    setVersion(v => v + 1);
  }, []);

  const setClock = useCallback((c: string) => { clockRef.current = c; setClockState(c); commit(); }, [commit]);

  const reset = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    agentRef.current = new FestivalAgent(buildFestival(), null, now);
    agentRef.current.sweepClashes();
    clockRef.current = '2027-04-15T09:00';
    setClockState(clockRef.current);
    setVersion(v => v + 1);
  }, [now]);

  return { agent: agentRef.current!, version, commit, clock, setClock, reset, llmInfo, useModel, setUseModel };
}

export type AgentStore = ReturnType<typeof useAgent>;
