// Live flight status for a guest's flight, from AviationStack when
// FLIGHT_API_KEY is set in Vercel. Without it, Usher uses the arrival
// times from the festival's own files.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const key = process.env.FLIGHT_API_KEY || process.env.AVIATIONSTACK_KEY;
  const flight = (new URL(req.url).searchParams.get('flight') ?? '').toUpperCase().replace(/\s+/g, '');
  if (!key) return Response.json({ configured: false });
  if (!/^[A-Z0-9]{2,3}\d{1,4}$/.test(flight)) return Response.json({ configured: true, error: 'Give a flight number like UA512.' }, { status: 400 });
  try {
    // The free plan only allows plain http.
    const r = await fetch(`http://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(key)}&flight_iata=${flight}&limit=5`, { cache: 'no-store' });
    const b = await r.json() as { data?: { flight_date: string; flight_status: string; arrival: { airport: string; iata: string; scheduled: string; estimated: string | null; actual: string | null; delay: number | null } }[]; error?: { message?: string } };
    if (!r.ok || b.error) return Response.json({ configured: true, error: b.error?.message ?? `Flight service error ${r.status}` }, { status: 502 });
    const f = (b.data ?? []).sort((a, c) => c.flight_date.localeCompare(a.flight_date))[0];
    if (!f) return Response.json({ configured: true, found: false });
    // AviationStack gives airport-local times marked +00:00; keep the local part.
    const local = (x: string | null) => x ? x.slice(0, 16) : null;
    return Response.json({ configured: true, found: true, flight, status: f.flight_status, airport: f.arrival.airport, iata: f.arrival.iata,
      scheduled: local(f.arrival.scheduled), estimated: local(f.arrival.actual ?? f.arrival.estimated ?? f.arrival.scheduled), delayMin: f.arrival.delay ?? 0 });
  } catch {
    return Response.json({ configured: true, error: 'Could not reach the flight service.' }, { status: 502 });
  }
}
