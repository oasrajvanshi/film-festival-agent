// What the festival's screens remember beyond the schedule itself: the
// alerts the agent raised, the plan before the last approved recommendation,
// and its notes. Kept in this browser, and on a shared festival also sent to
// the server with the rest of the state, so every phone sees the same.

const ALERTS = 'usher-alerts-v3';
const ORIGINAL = 'usher-original-plan-v1';
const NOTES = 'usher-plan-notes-v1';
const PLAN_KEYS = [ALERTS, ORIGINAL, NOTES];

export interface Board { alerts: unknown[]; original: unknown[] | null; notes: Record<string, string> }

const get = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };

export function readBoard(): Board {
  return { alerts: get(ALERTS, [] as unknown[]), original: get(ORIGINAL, null as unknown[] | null), notes: get(NOTES, {} as Record<string, string>) };
}

/** Take the board another device saved (shared festivals). */
export function writeBoard(b: Board | undefined) {
  if (!b) return;
  // Unchanged: leave the screens alone (pulls arrive every few seconds).
  if (JSON.stringify(readBoard()) === JSON.stringify({ alerts: b.alerts ?? [], original: b.original ?? null, notes: b.notes ?? {} })) return;
  try {
    localStorage.setItem(ALERTS, JSON.stringify(b.alerts ?? []));
    if (b.original) localStorage.setItem(ORIGINAL, JSON.stringify(b.original)); else localStorage.removeItem(ORIGINAL);
    localStorage.setItem(NOTES, JSON.stringify(b.notes ?? {}));
  } catch { /* private mode */ }
  try { window.dispatchEvent(new Event('usher-alerts')); window.dispatchEvent(new Event('usher-board')); } catch { /* not in a browser */ }
}

/** The board changed here: save it (the app listens and pushes it on a shared festival). */
export function boardChanged() {
  try { window.dispatchEvent(new Event('usher-board-dirty')); window.dispatchEvent(new Event('usher-board')); } catch { /* not in a browser */ }
}

export function clearFestivalLocal() {
  try { for (const k of PLAN_KEYS) localStorage.removeItem(k); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event('usher-alerts')); window.dispatchEvent(new Event('usher-board')); } catch { /* not in a browser */ }
}
