// GET /api/ops/state: what the dashboard needs. ?full=1 returns the whole store.
import { getBackend, errorResponse } from '../../../../src/backend/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { backend } = await getBackend();
    const s = await backend.state();
    if (new URL(req.url).searchParams.get('full')) return Response.json(s);
    return Response.json({
      clock: s.clock,
      decisions: [...s.decisions].reverse(),
      flags: s.flags.slice(-30).reverse(),
      outbox: s.outbox.slice(-50).reverse(),
      briefs: s.briefs,
      review: s.review.filter(r => r.status === 'open'),
      timers: s.timers.filter(t => !t.fired),
      conditions: s.conditions,
      overrides: s.overrides,
      audit: s.audit.slice(-150),
    });
  } catch (e) { return errorResponse(e); }
}
