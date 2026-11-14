// One backend per server process, shared by the API routes. State lives in
// a JSON file (OPS_STORE, default .data/ops-state.json), so deadlines and
// re-check timers survive a restart. On a serverless host, point a cron at
// POST /api/ops/tick every minute; the filesystem there is temporary, so use
// a real database behind the Store interface before deploying.

import { loadFestivalData, type SheetError } from './data/load';
import { isDecisionError } from './engine/decisions';
import { FileStore, initialState } from './engine/store';
import { integrationsFromEnv } from './integrations';
import { llmFromEnv } from './llm/ollama';
import { OpsBackend } from './service';

interface Holder { backend?: Promise<{ backend: OpsBackend; source: string }> }
const holder = globalThis as unknown as { __opsBackend?: Holder };
const h: Holder = (holder.__opsBackend ??= {});

export function getBackend(): Promise<{ backend: OpsBackend; source: string }> {
  h.backend ??= (async () => {
    const { data, warnings, source } = await loadFestivalData();
    const store = new FileStore(process.env.OPS_STORE ?? '.data/ops-state.json', () => initialState(data));
    return { backend: new OpsBackend({ data, store, llm: llmFromEnv(), integrations: integrationsFromEnv(), warnings }), source };
  })().catch(e => { h.backend = undefined; throw e; });
  return h.backend;
}

/** Re-read the sheets ("Check sheet for changes"). Live state is kept. */
export async function reloadBackend() {
  h.backend = undefined;
  return getBackend();
}

export function errorResponse(e: unknown): Response {
  if (isDecisionError(e)) {
    const status = { not_found: 404, conflict: 409, forbidden: 403, bad_request: 400 }[e.code];
    return Response.json({ error: e.code, message: e.message }, { status });
  }
  if ((e as Error)?.name === 'SheetError') return Response.json({ error: 'sheet', problems: (e as SheetError).problems }, { status: 422 });
  return Response.json({ error: 'server', message: (e as Error).message }, { status: 500 });
}
