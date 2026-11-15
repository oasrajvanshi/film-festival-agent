// Shared storage for Usher. Upstash Redis over its REST API when the project
// has it connected (Vercel Storage sets KV_REST_API_URL/TOKEN or
// UPSTASH_REDIS_REST_URL/TOKEN). For tests and local runs, USHER_MEMORY_STORE=1
// keeps everything in this server process. With neither, shared mode is off
// and the app keeps state in each browser as before.

export interface Kv {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Append to a list, keeping at most `max` newest items. */
  push(key: string, value: unknown, max?: number): Promise<void>;
  list<T>(key: string, max?: number): Promise<T[]>;
}

function upstash(url: string, token: string): Kv {
  const call = async (cmd: (string | number)[]) => {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd), cache: 'no-store' });
    const b = await r.json().catch(() => ({})) as { result?: unknown; error?: string };
    if (!r.ok || b.error) throw new Error(`Storage error: ${b.error ?? r.status}`);
    return b.result;
  };
  return {
    async get<T>(key: string) { const v = await call(['GET', key]); return v == null ? null : JSON.parse(String(v)) as T; },
    async set(key, value, ttlSec) { await call(ttlSec ? ['SET', key, JSON.stringify(value), 'EX', ttlSec] : ['SET', key, JSON.stringify(value)]); },
    async del(key) { await call(['DEL', key]); },
    async push(key, value, max = 500) { await call(['LPUSH', key, JSON.stringify(value)]); await call(['LTRIM', key, 0, max - 1]); },
    async list<T>(key: string, max = 500) { const v = await call(['LRANGE', key, 0, max - 1]) as string[]; return (v ?? []).map(x => JSON.parse(x) as T); },
  };
}

type Mem = Map<string, { v: string; exp?: number }>;
function memory(): Kv {
  const g = globalThis as unknown as { __usherMem?: Mem };
  const m = g.__usherMem ??= new Map();
  const live = (k: string) => { const e = m.get(k); if (e && e.exp && e.exp < Date.now()) { m.delete(k); return undefined; } return e; };
  return {
    async get<T>(key: string) { const e = live(key); return e ? JSON.parse(e.v) as T : null; },
    async set(key, value, ttlSec) { m.set(key, { v: JSON.stringify(value), exp: ttlSec ? Date.now() + ttlSec * 1000 : undefined }); },
    async del(key) { m.delete(key); },
    async push(key, value, max = 500) { const cur = JSON.parse(live(key)?.v ?? '[]') as unknown[]; m.set(key, { v: JSON.stringify([value, ...cur].slice(0, max)) }); },
    async list<T>(key: string, max = 500) { return (JSON.parse(live(key)?.v ?? '[]') as T[]).slice(0, max); },
  };
}

export function getKv(): Kv | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstash(url, token);
  if (process.env.USHER_MEMORY_STORE === '1') return memory();
  return null;
}
