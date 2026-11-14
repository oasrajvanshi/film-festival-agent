// GET /api/ops/festival: the festival as the sheets have it (the "old plan"),
// for the apps. Live changes come from /api/ops/state (overrides, decisions).
// Contact details stay on the server.
import { getBackend, errorResponse } from '../../../../src/backend/server';
import { TEAM_NAMES } from '../../../../src/backend/domain/view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { backend, source } = await getBackend();
    const d = backend.data;
    return Response.json({
      source,
      info: { name: d.info.name, dates: d.info.dates, timezone: d.info.timezone },
      venues: d.venues.map(v => ({ id: v.id, name: v.name, capacity: v.capacity })),
      sessions: d.sessions.map(s => ({
        id: s.id, day: s.day, title: s.title, kind: s.kind, venueId: s.venueId, room: s.room, filmId: s.filmId,
        start: s.start, end: s.end, guestIds: s.guestIds, expected: s.expected, status: s.status,
      })),
      guests: d.guests.map(g => ({ id: g.id, name: g.name, role: g.role, badge: g.badge })),
      staff: d.staff.map(s => ({ id: s.id, name: s.name, team: s.team, title: s.title, lead: s.lead, channels: s.channels, shifts: s.shifts })),
      audience: d.audience.map(a => ({ id: a.id, name: a.name, role: a.role, passType: a.passType, validDays: a.validDays, eventIds: a.eventIds, channels: a.channels })),
      shuttles: d.shuttles.map(r => ({ id: r.id, name: r.name, stops: r.stops, everyMin: r.everyMin })),
      teams: TEAM_NAMES,
      models: backend.models,
    });
  } catch (e) { return errorResponse(e); }
}
