// Append-only audit log: every trigger, route, model call, tool call,
// decision, approval and executed step, with the run it belongs to.

import type { AuditEntry, AuditKind, OpsState } from '../domain/types';

const MAX_ENTRIES = 5000;

export type Audit = (kind: AuditKind, summary: string, data?: unknown) => AuditEntry;

export function auditFor(state: OpsState, runId: string): Audit {
  return (kind, summary, data) => {
    const prev = state.audit[state.audit.length - 1];
    const e: AuditEntry = { seq: (prev?.seq ?? 0) + 1, at: state.clock, runId, kind, summary, data };
    state.audit.push(e);
    if (state.audit.length > MAX_ENTRIES) state.audit.splice(0, state.audit.length - MAX_ENTRIES);
    return e;
  };
}

export function nextId(state: OpsState, prefix: string): string {
  return `${prefix}-${++state.seq}`;
}
