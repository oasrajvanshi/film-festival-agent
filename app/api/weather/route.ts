// Weather for the festival city. Open-Meteo is free and needs no key.
// The festival may be months away, so today's real forecast is placed on the
// festival day being viewed. ?scenario=storm|snow|heat|clear returns a scripted day.
import { fromOpenMeteo, scenarioHours } from '../../../src/agent/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VARS = 'temperature_2m,precipitation,snowfall,precipitation_probability,wind_gusts_10m,weather_code';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const date = q.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  const scenario = q.get('scenario');
  if (scenario) {
    if (!['storm', 'snow', 'heat', 'clear'].includes(scenario)) return Response.json({ error: 'unknown scenario' }, { status: 400 });
    return Response.json({ source: `Demo ${scenario}`, hours: scenarioHours(date, scenario as 'storm') });
  }
  const city = (q.get('city') ?? 'New York').slice(0, 80);
  try {
    let lat = Number(q.get('lat')), lon = Number(q.get('lon')), place = city;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!q.get('lat') && !q.get('lon'))) {
      const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`, { cache: 'no-store' });
      const gj = await g.json() as { results?: { latitude: number; longitude: number; name: string; country?: string }[] };
      const hit = gj.results?.[0];
      if (!hit) return Response.json({ error: `Couldn't find "${city}"` }, { status: 404 });
      lat = hit.latitude; lon = hit.longitude; place = `${hit.name}${hit.country ? `, ${hit.country}` : ''}`;
    }
    // Within the 16-day forecast window, ask for that very day; further out, today's weather stands in as a preview.
    const ahead = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.now()) / 864e5);
    const exact = ahead >= 0 && ahead <= 15;
    const when = exact ? `start_date=${date}&end_date=${date}` : 'forecast_days=1';
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${VARS}&${when}&timezone=auto`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const j = await r.json() as { hourly: Parameters<typeof fromOpenMeteo>[0] };
    return Response.json({ source: `Open-Meteo, ${place} (${exact ? `forecast for ${date}` : "today's weather as a preview"})`, exact, hours: fromOpenMeteo(j.hourly, date) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
