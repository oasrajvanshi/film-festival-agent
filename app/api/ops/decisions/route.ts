// GET /api/ops/decisions?status=open
import { getBackend, errorResponse } from '../../../../src/backend/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { backend } = await getBackend();
    const status = new URL(req.url).searchParams.get('status');
    const s = await backend.state();
    return Response.json({ clock: s.clock, decisions: s.decisions.filter(d => !status || d.status === status) });
  } catch (e) { return errorResponse(e); }
}
