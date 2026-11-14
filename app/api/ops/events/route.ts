// POST /api/ops/events: a feed event or inbound message. Either a full trigger
// with an ISO `at`, or { day, at: "15:10", trigger: {...} } in the scenario format.
import { getBackend, errorResponse } from '../../../../src/backend/server';
import { at as atTime } from '../../../../src/backend/domain/time';
import { triggerFrom, type TriggerInput } from '../../../../src/backend/scenarios';
import type { Trigger } from '../../../../src/backend/domain/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = ['weather_update', 'weather_poll', 'flight_update', 'shuttle_update', 'guest_checkin', 'inbound_message'];

export async function POST(req: Request) {
  try {
    const { backend } = await getBackend();
    const body = await req.json() as { day?: number; at?: string; trigger?: TriggerInput } & Partial<Trigger>;
    let t: Trigger;
    if (body.trigger) {
      const s = await backend.state();
      const date = body.day ? backend.data.info.dates[body.day] : s.clock.slice(0, 10);
      if (!date) return Response.json({ error: 'bad_request', message: `No festival day ${body.day}` }, { status: 400 });
      t = triggerFrom(date, body.trigger, body.at ? atTime(date, body.at) : s.clock);
    } else {
      t = body as Trigger;
    }
    if (!TYPES.includes(t.type) || !t.at) return Response.json({ error: 'bad_request', message: `type must be one of ${TYPES.join(', ')}, with at` }, { status: 400 });
    return Response.json({ reports: await backend.ingest(t) });
  } catch (e) { return errorResponse(e); }
}
