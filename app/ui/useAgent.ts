'use client';
// Runs the agent in the browser and keeps its state in localStorage, so the
// prototype needs no database. Model calls go through /api/llm (server-side key).

import { useCallback, useEffect, useRef, useState } from 'react';
import { FestivalAgent } from '../../src/agent/agent';
import { buildFestival } from '../../src/data/seed';
import type { LlmClient, ChatMessage } from '../../src/llm/ollama';
import type { Festival } from '../../src/core/types';

export const DEFAULT_SHEET = 'https://docs.google.com/spreadsheets/d/18Pp1GAMQz__QzyvKYlddcR-agiG1p7rH5QJq8NV9lNM/edit';

export interface SheetStatus { source: 'built-in' | 'sheet'; sheet?: string; loadedAt?: string; errors: string[]; warnings: string[]; message?: string }

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
  const [sheet, setSheet] = useState<SheetStatus>({ source: 'built-in', errors: [], warnings: [] });
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const now = useCallback(() => clockRef.current, []);

  if (!agentRef.current) agentRef.current = new FestivalAgent(buildFestival(), null, now);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        agentRef.current = FestivalAgent.restore(s.agent, null, now);
        clockRef.current = s.clock ?? clockRef.current;
        if (s.sheet) setSheet(s.sheet);
        setClockState(clockRef.current);
      } else {
        agentRef.current!.sweepClashes();
      }
    } catch { /* fresh state */ }
    setVersion(v => v + 1);
    fetch('/api/llm', { cache: 'no-store' }).then(r => r.json()).then(setLlmInfo).catch(() => {});
  }, [now]);

  useEffect(() => {
    agentRef.current!.setLlm(useModel && llmInfo.available ? remoteLlm : null);
  }, [useModel, llmInfo.available, version]);

  const commit = useCallback(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ agent: agentRef.current!.snapshot(), clock: clockRef.current, sheet: sheetRef.current })); } catch { /* ignore */ }
    setVersion(v => v + 1);
  }, []);

  const setClock = useCallback((c: string) => { clockRef.current = c; setClockState(c); commit(); }, [commit]);

  const reset = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    agentRef.current = new FestivalAgent(buildFestival(), null, now);
    agentRef.current.sweepClashes();
    clockRef.current = '2027-04-15T09:00';
    setClockState(clockRef.current);
    setSheet({ source: 'built-in', errors: [], warnings: [] });
    setVersion(v => v + 1);
  }, [now]);

  /** mode 'replace' starts fresh from the sheet; 'sync' runs the agent on what changed. */
  const loadSheet = useCallback(async (url: string, mode: 'replace' | 'sync') => {
    const r = await fetch(`/api/festival?sheet=${encodeURIComponent(url)}`);
    const body = await r.json() as { festival?: Festival | null; errors?: string[]; warnings?: string[]; error?: string };
    if (!r.ok || body.error) {
      setSheet(st => ({ ...st, errors: [body.error ?? `HTTP ${r.status}`], message: undefined }));
      return null;
    }
    if (!body.festival) {
      setSheet(st => ({ ...st, errors: body.errors ?? [], warnings: body.warnings ?? [], message: 'The sheet has errors, so nothing was loaded.' }));
      return null;
    }
    const at = new Date().toLocaleTimeString();
    let message: string;
    if (mode === 'replace' || sheetRef.current.source !== 'sheet') {
      const firstDay = body.festival.dates[1];
      agentRef.current = new FestivalAgent(body.festival, null, now);
      agentRef.current.sweepClashes();
      clockRef.current = `${firstDay}T09:00`;
      setClockState(clockRef.current);
      message = `Loaded ${body.festival.events.length} events, ${body.festival.people.length} people and ${body.festival.films.length} films.`;
    } else {
      const res = await agentRef.current!.onSheetSync(body.festival, 'Google Sheet');
      message = res.changes.length ? `${res.changes.length} schedule change(s) found. See Approvals and Overview.` : 'No schedule changes since the last check. Other tabs were refreshed.';
    }
    const next: SheetStatus = { source: 'sheet', sheet: url, loadedAt: at, errors: [], warnings: body.warnings ?? [], message };
    sheetRef.current = next;
    setSheet(next);
    commit();
    return message;
  }, [commit, now]);

  return { agent: agentRef.current!, version, commit, clock, setClock, reset, llmInfo, useModel, setUseModel, sheet, loadSheet };
}

export type AgentStore = ReturnType<typeof useAgent>;
