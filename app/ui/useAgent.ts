'use client';
// Runs the agent in the browser. Two modes:
//  - shared: when the server has storage, the festival lives there. Organizers
//    run the agent here and save each change; everyone else gets only their
//    own slice and refreshes every few seconds. Changes reach every device.
//  - local: with no storage, state stays in this browser's localStorage.
// Model calls go through /api/llm (server-side key).

import { boardChanged, clearFestivalLocal, readBoard, writeBoard, type Board } from './localkeys';
import type { ArrivalResult } from '../../src/agent/presence';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FestivalAgent } from '../../src/agent/agent';
import { buildSundance } from '../../src/data/sundance';
import { FESTIVAL_NAME, SCENARIOS } from '../../src/data/sundance2027';
import type { LlmClient, ChatMessage } from '../../src/llm/ollama';
import type { Festival } from '../../src/core/types';
import type { ScanResult } from '../../src/rules/access';
import { directory, type ProfileKind, type Who } from '../../src/access/profiles';
import { rebuildFromTabs, type SheetMapping } from '../../src/onboard/workbook';

export const DEFAULT_SHEET = 'https://docs.google.com/spreadsheets/d/18Pp1GAMQz__QzyvKYlddcR-agiG1p7rH5QJq8NV9lNM/edit';

export interface SheetStatus { source: 'built-in' | 'sheet' | 'onboarding'; sheet?: string; loadedAt?: string; errors: string[]; warnings: string[]; message?: string }

const KEY = 'ffa-state-v1';
const SETUP_KEY = 'ffa-setup-v1';
const WHO_KEY = 'ffa-who-v1';
const FID_KEY = 'ffa-fid-v1';
/** The deck's own private copy of the sample festival (shared mode). */
const DECK_FID_KEY = 'usher-deck-fid';
const TOKEN_KEY = 'ffa-token-v1';
/** The demo opens on the morning the producer's flight is cancelled (Day 2). */
const SAMPLE_CLOCK = SCENARIOS.clock;
/** Bumped whenever the built-in demo festival changes, so a demo saved in this browser is rebuilt. */
const SAMPLE_VERSION = 'sundance-2027-v5';
/** Every Usher screen open in this browser (the organizer, a phone frame, another tab) hears each saved change at once. */
const LIVE = 'usher-live';
const liveChannel = () => { try { return typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(LIVE) : null; } catch { return null; } };

/** What the festival chose during onboarding. */
export interface Setup { festivalName: string; city: string; approver: string; channels: string[]; onboardedAt: string; sheetUrl?: string; sheetMapping?: SheetMapping }
const ls = {
  get<T>(k: string): T | null { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) as T : null; } catch { return null; } },
  set(k: string, v: unknown) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export const readSetup = () => ls.get<Setup>(SETUP_KEY);
export const writeSetup = (s: Setup | null) => ls.set(SETUP_KEY, s);
export const readWho = () => ls.get<Who>(WHO_KEY);
/** Signing out also forgets this device's session. */
export function writeWho(w: Who | null) { ls.set(WHO_KEY, w); if (!w) ls.set(TOKEN_KEY, null); }
export const readFid = () => ls.get<string>(FID_KEY);
/** True for the festival the deck made for itself: a demo, safe to start over. */
export const isDeckFestival = (fid: string | null) => !!fid && ls.get<string>(DECK_FID_KEY) === fid;

export const remoteLlm: LlmClient = {
  model: 'server',
  async chat(messages: ChatMessage[], opts?: { json?: boolean }) {
    const r = await fetch('/api/llm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, json: opts?.json }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `LLM ${r.status}`);
    return (await r.json()).content as string;
  },
};

type Mode = 'loading' | 'local' | 'shared';
export interface PublicInfo { fid: string; name: string; city: string; sample: boolean; emailCodes: boolean }

async function api<T = Record<string, unknown>>(method: 'GET' | 'POST', params: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: T }> {
  const token = ls.get<string>(TOKEN_KEY);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = method === 'GET' ? `/api/usher?${new URLSearchParams(params as Record<string, string>)}` : '/api/usher';
  const r = await fetch(url, { method, headers, body: method === 'POST' ? JSON.stringify(params) : undefined, cache: 'no-store' });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) as T };
}

export function useAgent() {
  const clockRef = useRef(SAMPLE_CLOCK);
  const [clock, setClockState] = useState(clockRef.current);
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState<Mode>('loading');
  const [pub, setPub] = useState<PublicInfo | null>(null);
  const [who, setWhoState] = useState<Who | null>(null);
  const [notice, setNotice] = useState('');
  const [llmInfo, setLlmInfo] = useState<{ available: boolean; model: string | null }>({ available: false, model: null });
  const [useModel, setUseModel] = useState(true);
  const agentRef = useRef<FestivalAgent | null>(null);
  const [sheet, setSheet] = useState<SheetStatus>({ source: 'built-in', errors: [], warnings: [] });
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const modeRef = useRef<Mode>('loading');
  const fidRef = useRef<string | null>(null);
  const whoRef = useRef<Who | null>(null);
  const serverVersion = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const dirty = useRef(false);
  const now = useCallback(() => clockRef.current, []);

  if (!agentRef.current) agentRef.current = new FestivalAgent(buildSundance(), null, now);

  // The deck's phone frame shares its sign-in with the organizer frame beside it: it never clears
  // that shared sign-in (a stray rejected request there must not sign the presenter out).
  const follower = typeof window !== 'undefined' && (() => { const q = new URLSearchParams(location.search); return q.get('demoframe') === '1' && (q.get('as') ?? 'organizer') !== 'organizer'; })();
  const setWho = (w: Who | null) => { whoRef.current = w; setWhoState(w); if (w || !follower) writeWho(w); };
  const bump = () => setVersion(v => v + 1);

  /** Replace what this device holds with the server's copy. */
  const hydrate = useCallback((b: { version: number; state: { agent: ReturnType<FestivalAgent['snapshot']>; clock: string; sheet: SheetStatus; board?: Board }; setup?: Partial<Setup> }) => {
    agentRef.current = FestivalAgent.restore(b.state.agent, null, now);
    // Alerts and the plan before the last approval are shared too, so every phone sees them.
    writeBoard(b.state.board ?? { alerts: [], original: null, notes: {} });
    clockRef.current = b.state.clock || clockRef.current;
    setClockState(clockRef.current);
    if (b.state.sheet) { sheetRef.current = b.state.sheet; setSheet(b.state.sheet); }
    if (b.setup?.festivalName) writeSetup({ approver: '', channels: [], onboardedAt: '', city: '', ...readSetup(), ...b.setup } as Setup);
    serverVersion.current = b.version;
    bump();
  }, [now]);

  const pull = useCallback(async () => {
    if (modeRef.current !== 'shared' || !fidRef.current || !whoRef.current) return;
    // Our own change is still on its way to the server: don't read the old copy over it.
    if (dirty.current || saving.current) return;
    const r = await api<{ version: number; state: never; setup: never }>('GET', { action: 'state', f: fidRef.current });
    if (r.status === 401) { setWho(null); return; }
    if (r.ok && !dirty.current && !saving.current) hydrate(r.body);
  }, [hydrate]);

  // ---------------------------------------------------------------- start up
  useEffect(() => {
    let alive = true;
    (async () => {
      fetch('/api/llm', { cache: 'no-store' }).then(r => r.json()).then(setLlmInfo).catch(() => {});
      const st = await fetch('/api/usher?action=status', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ shared: false }));
      if (!alive) return;
      if (!st.shared) {
        modeRef.current = 'local'; setMode('local');
        try {
          const raw = localStorage.getItem(KEY);
          const saved = raw ? JSON.parse(raw) : null;
          // A demo saved from an older version of the sample is rebuilt; festivals people set up are kept.
          const stale = saved && (!saved.sheet || saved.sheet.source === 'built-in') && saved.sampleVersion !== SAMPLE_VERSION;
          if (stale) { localStorage.removeItem(KEY); clearFestivalLocal(); }
          if (raw && !stale) {
            const s = saved;
            agentRef.current = FestivalAgent.restore(s.agent, null, now);
            clockRef.current = s.clock ?? clockRef.current;
            if (s.sheet) setSheet(s.sheet);
            setClockState(clockRef.current);
          } else agentRef.current!.sweepClashes();
        } catch { /* fresh state */ }
        setWhoState(readWho()); whoRef.current = readWho();
        bump();
        return;
      }
      modeRef.current = 'shared';
      // A join link (?f=...) picks the festival; otherwise the one this device used last.
      const u = new URL(location.href);
      const linked = u.searchParams.get('f');
      if (linked) {
        if (linked !== readFid()) { ls.set(FID_KEY, linked); writeWho(null); }
        u.searchParams.delete('f');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
      let fid = readFid();
      // A festival set up before shared storage existed moves to the server once, for its organizer.
      if (!fid && readSetup() && readWho()?.kind === 'organizer' && localStorage.getItem(KEY)) {
        try {
          const s = JSON.parse(localStorage.getItem(KEY)!);
          const r = await api<{ fid: string; token: string; who: Who }>('POST', { action: 'create', snapshot: s.agent, clock: s.clock, sheet: s.sheet ?? sheetRef.current, setup: readSetup() });
          if (r.ok) { fid = r.body.fid; ls.set(FID_KEY, fid); ls.set(TOKEN_KEY, r.body.token); ls.set(WHO_KEY, { ...readWho(), ...r.body.who }); }
        } catch { /* stays local-looking until onboarding */ }
      }
      fidRef.current = fid;
      if (fid) {
        const p = await api<PublicInfo>('GET', { action: 'public', f: fid });
        if (p.ok) setPub(p.body);
        else if (p.status === 404) { ls.set(FID_KEY, null); writeWho(null); fidRef.current = null; }
      }
      const w = fidRef.current && ls.get<string>(TOKEN_KEY) ? readWho() : null;
      whoRef.current = w; setWhoState(w);
      if (w) await pull();
      if (!alive) return;
      setMode('shared');
      bump();
    })();
    return () => { alive = false; };
  }, [now, pull]);

  // Keep every device current: organizers check the version often, others refresh their slice.
  useEffect(() => {
    if (mode !== 'shared' || !who) return;
    // The deck's phone frame follows the organizer frame beside it (live snapshots, then a pull once
    // each save lands). Polling on its own could read a half-saved state and wipe the alerts.
    const q = new URLSearchParams(location.search);
    if (q.get('demoframe') === '1' && (q.get('as') ?? 'organizer') !== 'organizer') return;
    const organizer = who.kind === 'organizer';
    const t = setInterval(async () => {
      if (document.hidden || saving.current) return;
      if (organizer) {
        const r = await api<{ version: number }>('GET', { action: 'version', f: fidRef.current! });
        if (r.status === 401) { setWho(null); return; }
        if (r.ok && r.body.version > serverVersion.current && !saving.current) await pull();
      } else await pull();
    }, organizer ? 4000 : 8000);
    return () => clearInterval(t);
  }, [mode, who, pull]);

  // Auto-sync: while an organizer has Usher open, re-read the festival's Google Sheet every minute.
  useEffect(() => {
    if (mode === 'loading' || who?.kind !== 'organizer') return;
    const tick = async () => {
      const setup = readSetup();
      if (document.hidden || !setup?.sheetUrl || saving.current) return;
      if (modeRef.current === 'shared') {
        const r = await api<{ synced: boolean; changes?: number; version?: number }>('POST', { action: 'sheet-sync', f: fidRef.current });
        if (r.ok && (r.body.version ?? 0) > serverVersion.current) await pull();
        return;
      }
      if (!setup.sheetMapping) { await loadSheetRef.current?.(setup.sheetUrl, 'sync'); return; }
      const t = await fetch(`/api/festival?tabs=1&sheet=${encodeURIComponent(setup.sheetUrl)}`).then(x => x.json()).catch(() => null);
      if (!t?.tabs) return;
      const res = rebuildFromTabs(setup.sheetMapping, t.tabs);
      if (!res.festival) return;
      const out = await agentRef.current!.onSheetSync(res.festival, 'Google Sheet (auto-sync)');
      if (out.changes.length) commit();
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [mode, who, pull]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    agentRef.current!.setLlm(useModel && llmInfo.available ? remoteLlm : null);
  }, [useModel, llmInfo.available, version]);

  // ---------------------------------------------------------------- saving
  const pushState = useCallback(async () => {
    while (dirty.current) {
      dirty.current = false;
      const state = { agent: agentRef.current!.snapshot(), clock: clockRef.current, sheet: sheetRef.current, board: readBoard() };
      const r = await api<{ version: number; merged: boolean; state?: never }>('POST', { action: 'put', f: fidRef.current, baseVersion: serverVersion.current, state }).catch(() => null);
      if (!r || !r.ok) {
        if (r?.status === 401) { setWho(null); return; }
        setNotice('Couldn’t save to the server. Retrying…');
        dirty.current = true;
        await new Promise(res => setTimeout(res, 3000));
        continue;
      }
      setNotice('');
      serverVersion.current = r.body.version;
      live.current?.postMessage({ kind: 'pull' });
      if (r.body.merged && r.body.state && !dirty.current) {
        hydrate({ version: r.body.version, state: r.body.state });
        setNotice('Merged with changes made on another device.');
        setTimeout(() => setNotice(''), 4000);
      }
    }
  }, [hydrate]);

  const commit = useCallback(() => {
    if (modeRef.current === 'shared') {
      bump();
      if (whoRef.current?.kind !== 'organizer') return;
      // Phones open in this browser (the presenting view) get the new plan now, before the server round-trip.
      try { live.current?.postMessage({ kind: 'snapshot', state: { agent: agentRef.current!.snapshot(), clock: clockRef.current, board: readBoard() } }); } catch { /* too large or closed */ }
      dirty.current = true;
      if (!saving.current) saving.current = pushState().finally(() => { saving.current = null; });
      return;
    }
    try { localStorage.setItem(KEY, JSON.stringify({ agent: agentRef.current!.snapshot(), clock: clockRef.current, sheet: sheetRef.current, sampleVersion: SAMPLE_VERSION })); } catch { /* ignore */ }
    bump();
    live.current?.postMessage({ kind: 'state' });
  }, [pushState]);

  // Live: another screen in this browser saved a change (the organizer approved a plan, an
  // attendee changed their plan). Take it at once, so every open app shows the same festival.
  const live = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const ch = liveChannel();
    live.current = ch;
    const reload = () => {
      if (modeRef.current === 'shared') { void pull(); return; }
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        const st = JSON.parse(raw);
        agentRef.current = FestivalAgent.restore(st.agent, null, now);
        clockRef.current = st.clock ?? clockRef.current;
        setClockState(clockRef.current);
        bump();
      } catch { /* keep what we have */ }
    };
    if (ch) ch.onmessage = e => {
      if (e.data?.kind === 'snapshot' && e.data.state) {
        // Another screen in this browser just changed the plan: show it now; the server copy follows.
        try {
          agentRef.current = FestivalAgent.restore(e.data.state.agent, null, now);
          if (e.data.state.board) writeBoard(e.data.state.board);
          clockRef.current = e.data.state.clock || clockRef.current;
          setClockState(clockRef.current);
          bump();
        } catch { /* keep what we have */ }
        return;
      }
      if (e.data?.kind === 'state' || e.data?.kind === 'pull') reload();
    };
    // Other tabs, and browsers without BroadcastChannel: the storage event.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && modeRef.current !== 'shared') reload();
      else if (e.key && e.key.startsWith('usher-')) bump();
    };
    window.addEventListener('storage', onStorage);
    return () => { ch?.close(); live.current = null; window.removeEventListener('storage', onStorage); };
  }, [now, pull]);
  // The organizer raised or handled alerts, or approved a plan: save that too.
  useEffect(() => {
    const on = () => commit();
    window.addEventListener('usher-board-dirty', on);
    return () => window.removeEventListener('usher-board-dirty', on);
  }, [commit]);

  const setClock = useCallback((c: string) => { clockRef.current = c; setClockState(c); commit(); }, [commit]);

  const reset = useCallback(async () => {
    clearFestivalLocal();
    if (modeRef.current === 'shared') {
      const r = await api<never>('POST', { action: 'reset', f: fidRef.current });
      if (r.ok) hydrate(r.body);
      return;
    }
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    agentRef.current = new FestivalAgent(buildSundance(), null, now);
    agentRef.current.sweepClashes();
    clockRef.current = SAMPLE_CLOCK;
    setClockState(clockRef.current);
    setSheet({ source: 'built-in', errors: [], warnings: [] });
    bump();
  }, [now, hydrate]);

  /** Start a fresh agent on a festival: clock on its first day before the first sweep. */
  const startAgent = useCallback((festival: Festival, clockAt?: string) => {
    clockRef.current = clockAt ?? `${festival.dates[1]}T09:00`;
    setClockState(clockRef.current);
    agentRef.current = new FestivalAgent(festival, null, now);
    agentRef.current.sweepClashes();
  }, [now]);

  /**
   * Go live with a festival that onboarding built. Shared: saved on the
   * server and this device is signed in as its organizer. Local: this browser.
   */
  const goLive = useCallback(async (festival: Festival, source: string, setup: Setup): Promise<Who> => {
    startAgent(festival);
    const next: SheetStatus = { source: 'onboarding', sheet: source, loadedAt: new Date().toLocaleTimeString(), errors: [], warnings: [],
      message: `Onboarded ${festival.events.length} events, ${festival.people.length} people and ${festival.films.length} films.` };
    sheetRef.current = next; setSheet(next);
    writeSetup(setup);
    clearFestivalLocal();
    const owner: Who = { kind: 'organizer', id: 'owner', name: setup.approver || 'Organizer', detail: 'Set up the festival', code: '' };
    if (modeRef.current === 'shared') {
      const r = await api<{ fid: string; token: string; who: Who; error?: string }>('POST', { action: 'create', snapshot: agentRef.current!.snapshot(), clock: clockRef.current, sheet: next, setup });
      if (!r.ok) throw new Error(r.body.error ?? 'Could not save the festival.');
      ls.set(FID_KEY, r.body.fid); ls.set(TOKEN_KEY, r.body.token);
      fidRef.current = r.body.fid;
      setWho(r.body.who);
      return r.body.who;
    }
    commit();
    setWho(owner);
    return owner;
  }, [commit, startAgent]);

  /** The public sample festival. Everyone shares one copy in shared mode. */
  const openSample = useCallback(async () => {
    const setup: Setup = { festivalName: FESTIVAL_NAME, city: 'Boulder', approver: 'Operations lead', channels: ['push', 'email'], onboardedAt: new Date().toISOString() };
    writeSetup(setup); writeWho(null);
    clearFestivalLocal();
    // Local mode: start the sample fresh rather than restoring an older festival.
    if (modeRef.current !== 'shared') { try { localStorage.removeItem(KEY); } catch { /* ignore */ } return; }
    const a = new FestivalAgent(buildSundance(), null, () => SAMPLE_CLOCK);
    a.sweepClashes();
    const r = await api<{ fid: string }>('POST', { action: 'create', sample: true, snapshot: a.snapshot(), clock: SAMPLE_CLOCK, sheet: { source: 'built-in', errors: [], warnings: [] }, setup });
    if (r.ok) ls.set(FID_KEY, r.body.fid);
  }, []);

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
      startAgent(body.festival);
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
  }, [commit, startAgent]);

  const loadSheetRef = useRef(loadSheet);
  loadSheetRef.current = loadSheet;

  // ---------------------------------------------------------------- sign in
  const requestCode = useCallback(async (kind: ProfileKind, name: string, email: string) => {
    const r = await api<{ ok: boolean; reason?: string; sent?: boolean; code?: string }>('POST', { action: 'signin-request', f: fidRef.current, kind, name, email });
    return r.body;
  }, []);
  const verifyCode = useCallback(async (kind: ProfileKind, code: string) => {
    const r = await api<{ ok: boolean; reason?: string; token?: string; who?: Who }>('POST', { action: 'signin-verify', f: fidRef.current, kind, code });
    if (r.body.ok && r.body.token && r.body.who) {
      ls.set(TOKEN_KEY, r.body.token);
      setWho(r.body.who);
      await pull();
      return { ok: true as const, who: r.body.who };
    }
    return { ok: false as const, reason: r.status === 429 ? 'too_many' : r.body.reason ?? 'no_match' };
  }, [pull]);
  const signOut = useCallback(() => { setWho(null); }, []);

  /**
   * The presentation's demo frames, on a device that has never signed in. Local: the built-in
   * sample, as its organizer. Shared: a private copy of the sample that only this deck knows
   * (nobody else opening the public demo can change or reset it). The organizer frame makes the
   * copy; the phone frame beside it waits for it and joins. Never used for a real festival.
   */
  const demoSignIn = useCallback(async () => {
    if (whoRef.current) return true;
    if (modeRef.current !== 'shared') {
      if (sheetRef.current.source !== 'built-in') return false;
      if (!readSetup()) writeSetup({ festivalName: FESTIVAL_NAME, city: 'Boulder', approver: 'Operations lead', channels: ['push', 'email'], onboardedAt: new Date().toISOString() });
      const all = directory(agentRef.current!.f).filter(w => w.kind === 'organizer');
      const w = all.find(x => x.name === SCENARIOS.organizer) ?? all[0];
      if (w) { setWho({ ...w, code: '' }); bump(); }
      return !!w;
    }
    const q = new URLSearchParams(location.search);
    const follower = (q.get('as') ?? 'organizer') !== 'organizer';
    const join = async (fid: string) => {
      const p = await api<PublicInfo>('GET', { action: 'public', f: fid });
      if (!p.ok) return false;
      fidRef.current = fid; ls.set(FID_KEY, fid); setPub(p.body);
      setWho(readWho()); whoRef.current = readWho();
      await pull(); bump();
      return true;
    };
    if (follower) {
      // Wait (up to 20 s) for the organizer frame to make the deck's copy and sign in.
      for (let i = 0; i < 40; i++) {
        const fid = ls.get<string>(DECK_FID_KEY);
        if (fid && ls.get<string>(TOKEN_KEY) && readWho() && readFid() === fid) return join(fid);
        await new Promise(r => setTimeout(r, 500));
      }
      return false;
    }
    const setup: Setup = { festivalName: FESTIVAL_NAME, city: 'Boulder', approver: SCENARIOS.organizer, channels: ['push', 'email'], onboardedAt: new Date().toISOString() };
    const a = new FestivalAgent(buildSundance(), null, () => SAMPLE_CLOCK);
    a.sweepClashes();
    const r = await api<{ fid: string; token: string; who: Who }>('POST', { action: 'create', snapshot: a.snapshot(), clock: SAMPLE_CLOCK, sheet: { source: 'built-in', errors: [], warnings: [] }, setup });
    if (!r.ok || !r.body.token) return false;
    writeSetup(setup);
    clearFestivalLocal();
    ls.set(TOKEN_KEY, r.body.token);
    ls.set(WHO_KEY, r.body.who);
    ls.set(DECK_FID_KEY, r.body.fid);
    ls.set(FID_KEY, r.body.fid);
    return join(r.body.fid);
  }, [pull]);

  // ---------------------------------------------------------------- actions others can take
  /** A door scan. Shared: checked on the server against everyone's passes. */
  const scan = useCallback(async (qr: string, eventId: string): Promise<ScanResult> => {
    if (modeRef.current !== 'shared') { const res = agentRef.current!.onScan(qr, eventId, clockRef.current, whoRef.current?.name); commit(); return res; }
    const r = await api<{ result: ScanResult; error?: string }>('POST', { action: 'scan', f: fidRef.current, qr, eventId, at: clockRef.current });
    if (!r.ok) return { allowed: false, reason: r.body.error ?? 'Could not reach the server. Try again.' };
    void pull();
    return r.body.result;
  }, [commit, pull]);

  /** A venue entrance scan: records that someone has arrived today. */
  const arrive = useCallback(async (qr: string, venueId: string): Promise<ArrivalResult> => {
    if (modeRef.current !== 'shared') { const res = agentRef.current!.onArrival(qr, venueId, clockRef.current, whoRef.current?.name ?? 'Door'); commit(); return res; }
    const r = await api<{ result: ArrivalResult; error?: string }>('POST', { action: 'arrive', f: fidRef.current, qr, venueId, at: clockRef.current });
    if (!r.ok) return { allowed: false, reason: r.body.error ?? 'Could not reach the server. Try again.' };
    void pull();
    return r.body.result;
  }, [commit, pull]);

  /** Generic call for vendor reports, feedback, codes and push. */
  const call = useCallback(async <T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}, method: 'GET' | 'POST' = 'POST') => {
    const r = await api<T>(method, { action, f: fidRef.current ?? '', ...body });
    if (r.ok && action === 'vendor-report') void pull();
    return r;
  }, [pull]);

  return {
    // A getter: code holding this object across an await (a reset, a demo wait) still reaches the live agent.
    get agent() { return agentRef.current!; },
    version, commit, clock, setClock, reset, llmInfo, useModel, setUseModel, sheet, loadSheet, goLive, openSample,
    mode, shared: mode === 'shared', pub, who, fid: fidRef.current, notice, requestCode, verifyCode, signOut, demoSignIn, signInAs: setWho, scan, arrive, call, pull,
    festivalName: pub?.name ?? agentRef.current!.f.name,
  };
}

export type AgentStore = ReturnType<typeof useAgent>;
