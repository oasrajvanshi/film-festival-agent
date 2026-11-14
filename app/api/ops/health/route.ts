// GET /api/ops/health: data source, sheet warnings, model and Ollama status.
import { getBackend, errorResponse } from '../../../../src/backend/server';
import { ollamaHealth } from '../../../../src/backend/llm/ollama';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { backend, source } = await getBackend();
    const d = backend.data;
    return Response.json({
      festival: d.info.name, source, warnings: backend.warnings,
      counts: { events: d.sessions.length, guests: d.guests.length, staff: d.staff.length, attendees: d.audience.length, shuttles: d.shuttles.length },
      model: backend.model, ollama: backend.model ? await ollamaHealth() : null,
    });
  } catch (e) { return errorResponse(e); }
}
