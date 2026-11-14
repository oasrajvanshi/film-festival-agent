// POST /api/ops/tick { at? }: move the festival clock and fire due deadlines and re-checks.
// Point a cron here every minute in production.
import { getBackend, errorResponse } from '../../../../src/backend/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { backend } = await getBackend();
    const body = await req.json().catch(() => ({})) as { at?: string };
    return Response.json({ reports: await backend.tick(body.at) });
  } catch (e) { return errorResponse(e); }
}
