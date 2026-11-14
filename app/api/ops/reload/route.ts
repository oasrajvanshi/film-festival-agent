// POST /api/ops/reload: re-read the festival sheets (after someone edits them).
import { reloadBackend, errorResponse } from '../../../../src/backend/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { backend, source } = await reloadBackend();
    return Response.json({ source, warnings: backend.warnings, events: backend.data.sessions.length });
  } catch (e) { return errorResponse(e); }
}
