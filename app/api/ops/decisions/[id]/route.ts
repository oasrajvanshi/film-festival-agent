// POST /api/ops/decisions/:id  { action: "approve" | "reject", option, by, version, note?, at? }
// `by` is a staff Person ID; `version` is the one the person saw (409 if it changed).
import { getBackend, errorResponse } from '../../../../../src/backend/server';
import type { DecideInput } from '../../../../../src/backend/engine/decisions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { backend } = await getBackend();
    const body = await req.json() as DecideInput & { at?: string };
    if (!body.by || !['approve', 'reject'].includes(body.action)) {
      return Response.json({ error: 'bad_request', message: 'Send action ("approve" or "reject"), option and by (a staff Person ID)' }, { status: 400 });
    }
    return Response.json(await backend.decide(id, body));
  } catch (e) { return errorResponse(e); }
}
