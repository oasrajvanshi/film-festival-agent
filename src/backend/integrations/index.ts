// External services, each behind a small interface with a mock that the
// tests and demos use. Real adapters switch on with environment variables:
//
//   OPS_WEATHER=open-meteo      live forecast from Open-Meteo (free, no key)
//   FLIGHTAWARE_API_KEY=...     live flight status from FlightAware AeroAPI
//   SLACK_WEBHOOK_URL=...       staff heads-ups to a Slack channel
//
// Guest SMS and attendee push stay mocked: US SMS needs A2P 10DLC
// registration and consent first (see docs/review.md).

import type { FestivalInfo, FlightStatus, Forecast, Iso, OutboxItem } from '../domain/types';

// ---------------------------------------------------------------- weather

export interface WeatherProvider { name: string; forecast(info: FestivalInfo, now: Iso): Promise<Forecast> }

/**
 * Open-Meteo hourly snowfall. The festival dates are usually more than 16
 * days out, beyond the forecast range, so by default today's real forecast
 * is replayed onto the festival day of `now` ("what if today's weather hit
 * the festival").
 */
export function openMeteo(opts: { replayOnFestivalDate?: boolean; fetchImpl?: typeof fetch } = {}): WeatherProvider {
  const f = opts.fetchImpl ?? fetch;
  return {
    name: 'open-meteo',
    async forecast(info, now) {
      if (!Number.isFinite(info.lat) || !Number.isFinite(info.lon)) throw new Error('Set Latitude and Longitude on the Scenario settings tab');
      const q = new URLSearchParams({
        latitude: String(info.lat), longitude: String(info.lon), hourly: 'snowfall,temperature_2m,visibility',
        timezone: info.timezone, forecast_days: '1', precipitation_unit: 'inch', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph',
      });
      const res = await f(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const j = await res.json() as { hourly: { time: string[]; snowfall: number[]; temperature_2m: number[]; visibility: number[] } };
      const replay = opts.replayOnFestivalDate ?? true;
      return {
        source: replay ? 'open-meteo (today, replayed on the festival date)' : 'open-meteo',
        issuedAt: now,
        hourly: j.hourly.time.map((t, i) => ({
          hour: replay ? `${now.slice(0, 10)}T${t.slice(11, 16)}` : t.slice(0, 16),
          snowIn: Math.round((j.hourly.snowfall[i] ?? 0) * 100) / 100,
          tempF: j.hourly.temperature_2m[i], visibilityFt: j.hourly.visibility[i],
        })),
        alerts: [],
      };
    },
  };
}

// ---------------------------------------------------------------- flights

export interface FlightProvider { name: string; status(flight: string, info: FestivalInfo, now: Iso): Promise<FlightStatus | undefined> }

/** UTC ISO to local festival time "YYYY-MM-DDTHH:MM". */
export function utcToLocal(utc: string, timeZone: string): Iso {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(utc)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** FlightAware AeroAPI v4, GET /flights/{ident}. Not exercised by the tests (needs a key). */
export function aeroApi(apiKey: string, fetchImpl: typeof fetch = fetch): FlightProvider {
  return {
    name: 'flightaware',
    async status(flight, info, now) {
      const res = await fetchImpl(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(flight.replace(/\s+/g, ''))}`, {
        headers: { 'x-apikey': apiKey }, signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`AeroAPI ${res.status}`);
      const j = await res.json() as { flights: { scheduled_on?: string; estimated_on?: string; actual_on?: string; cancelled?: boolean; status?: string }[] };
      const today = j.flights.find(x => x.scheduled_on && utcToLocal(x.scheduled_on, info.timezone).startsWith(now.slice(0, 10))) ?? j.flights[0];
      if (!today) return undefined;
      const local = (t?: string) => (t ? utcToLocal(t, info.timezone) : undefined);
      return {
        flight, source: 'flightaware', updatedAt: now,
        status: today.cancelled ? 'cancelled' : today.actual_on ? 'landed' : /delay/i.test(today.status ?? '') ? 'delayed' : 'en_route',
        scheduledArrival: local(today.scheduled_on), estimatedArrival: local(today.actual_on ?? today.estimated_on),
      };
    },
  };
}

// ---------------------------------------------------------------- messaging

export type Delivery = 'mock' | 'sent' | 'failed';
export interface Messenger { name: string; deliver(items: OutboxItem[]): Promise<Record<string, Delivery>> }

export const mockMessenger: Messenger = {
  name: 'mock',
  async deliver(items) { return Object.fromEntries(items.map(i => [i.id, 'mock' as const])); },
};

/** Posts staff Slack items to one incoming webhook; everything else stays mocked. */
export function slackMessenger(webhookUrl: string, fetchImpl: typeof fetch = fetch): Messenger {
  return {
    name: 'slack',
    async deliver(items) {
      const out: Record<string, Delivery> = {};
      for (const i of items) {
        if (i.channel !== 'slack') { out[i.id] = 'mock'; continue; }
        try {
          const r = await fetchImpl(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `*${i.to}*: ${i.text}` }), signal: AbortSignal.timeout(5_000) });
          out[i.id] = r.ok ? 'sent' : 'failed';
        } catch { out[i.id] = 'failed'; }
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------- wiring

export interface Integrations { weather?: WeatherProvider; flights?: FlightProvider; messenger: Messenger }

export function integrationsFromEnv(env: Record<string, string | undefined> = process.env): Integrations {
  return {
    weather: env.OPS_WEATHER === 'open-meteo' ? openMeteo() : undefined,
    flights: env.FLIGHTAWARE_API_KEY ? aeroApi(env.FLIGHTAWARE_API_KEY) : undefined,
    messenger: env.SLACK_WEBHOOK_URL ? slackMessenger(env.SLACK_WEBHOOK_URL) : mockMessenger,
  };
}
