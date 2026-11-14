// POST /api/ops/reset { at? }: clear live state (decisions, outbox, timers) for a fresh demo.
import { getBackend, errorResponse } from '../../../../src/backend/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { backend } = await getBackend();
    const body = await req.json().catch(() => ({})) as { at?: string };
    const s = await backend.reset(body.at);
    return Response.json({ clock: s.clock });
  } catch (e) { return errorResponse(e); }
}
