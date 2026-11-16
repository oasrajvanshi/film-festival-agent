// What one browser remembers about the festival on screen: the demo alerts,
// the plan before the last approved recommendation, and its notes. Cleared
// whenever the festival itself changes (reset, a new festival, the sample).

const PLAN_KEYS = ['usher-alerts-v3', 'usher-original-plan-v1', 'usher-plan-notes-v1'];

export function clearFestivalLocal() {
  try { for (const k of PLAN_KEYS) localStorage.removeItem(k); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event('usher-alerts')); } catch { /* not in a browser */ }
}
