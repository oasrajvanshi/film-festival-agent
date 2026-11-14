// Every input, tool call, output and approval is logged (proposal: The Agent Loop, step 5).

export type LogKind = 'trigger' | 'understand' | 'decide' | 'act' | 'ask' | 'approval' | 'tool' | 'error';

export interface LogEntry {
  seq: number;
  at: string;
  runId: string;
  kind: LogKind;
  summary: string;
  data?: unknown;
}

export class AuditLog {
  entries: LogEntry[] = [];
  private seq = 0;
  constructor(private now: () => string = () => new Date().toISOString()) {}

  add(runId: string, kind: LogKind, summary: string, data?: unknown): LogEntry {
    const e = { seq: ++this.seq, at: this.now(), runId, kind, summary, data };
    this.entries.push(e);
    return e;
  }

  restore(entries: LogEntry[]) {
    this.entries = entries;
    this.seq = entries.reduce((m, e) => Math.max(m, e.seq), 0);
  }

  forRun(runId: string) {
    return this.entries.filter(e => e.runId === runId);
  }
}
