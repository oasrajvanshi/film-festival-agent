// Durable state. Decisions, timers, the outbox and the idempotency keys live
// here, so a restart neither loses a deadline nor sends a message twice.
// FileStore writes atomically (temp file + rename). Swap in SQLite or
// Postgres behind the same interface for production.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FestivalData, OpsState } from '../domain/types';

export interface Store {
  load(): Promise<OpsState>;
  save(s: OpsState): Promise<void>;
  reset(): Promise<OpsState>;
}

export function initialState(data: FestivalData, clock = `${data.info.dates[1]}T09:00`): OpsState {
  return {
    rev: 0, seq: 0, clock,
    conditions: { shuttleDelays: {}, flights: {}, checkIns: {}, reportedEtas: {} },
    overrides: {}, decisions: [], done: {}, outbox: [], flags: [], briefs: {}, timers: [], processed: [], review: [], audit: [],
  };
}

const clone = <T>(x: T): T => structuredClone(x);

export class MemoryStore implements Store {
  private s: OpsState;
  constructor(private init: () => OpsState) { this.s = init(); }
  async load() { return clone(this.s); }
  async save(s: OpsState) { this.s = clone({ ...s, rev: s.rev + 1 }); }
  async reset() { this.s = this.init(); return clone(this.s); }
}

export class FileStore implements Store {
  constructor(private path: string, private init: () => OpsState) {}

  async load(): Promise<OpsState> {
    try {
      return JSON.parse(await readFile(this.path, 'utf8')) as OpsState;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return this.init();
      throw e;
    }
  }

  async save(s: OpsState) {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ ...s, rev: s.rev + 1 }), 'utf8');
    await rename(tmp, this.path);
  }

  async reset() {
    await rm(this.path, { force: true });
    return this.init();
  }
}
