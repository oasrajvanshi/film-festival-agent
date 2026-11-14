// Weather watch. The forecast comes from Open-Meteo (free, no key) or a demo
// scenario; the rules here decide what is risky and who is affected. The
// model is never asked whether the weather is dangerous.

import type { Festival, FestivalEvent } from '../core/types';
import { addMinutes, clock, overlaps, toMinutes } from '../core/time';
import type { Action, OutboundMessage } from './approvals';

/** One forecast hour, already placed on a festival day (local ISO time). */
export interface WeatherHour {
  time: string;          // e.g. 2027-04-15T15:00
  tempC: number;
  precipMm: number;      // rain + showers in that hour
  snowCm: number;
  precipProb: number;    // 0-100
  gustKmh: number;
  code: number;          // WMO weather code
}

export type Hazard = 'storm' | 'snow' | 'heavy_rain' | 'rain' | 'wind' | 'heat' | 'cold';
export interface WeatherRisk {
  hazard: Hazard;
  level: 'watch' | 'warning';
  from: string;          // ISO
  to: string;            // ISO, exclusive
  peak: string;          // short human description of the worst hour
  /** Extra travel minutes the agent adds between venues during the window. */
  extraTravelMin: number;
}

const LABEL: Record<Hazard, string> = {
  storm: 'Thunderstorms', snow: 'Snow', heavy_rain: 'Heavy rain', rain: 'Rain', wind: 'Strong wind', heat: 'Heat', cold: 'Severe cold',
};
const EXTRA: Record<Hazard, number> = { storm: 15, snow: 20, heavy_rain: 15, rain: 10, wind: 10, heat: 5, cold: 10 };
const ADVICE: Record<Hazard, string> = {
  storm: 'Stay indoors between screenings if you can and use the free shuttle rather than walking.',
  snow: 'Sidewalks may be slow. Take the free shuttle and wear good shoes.',
  heavy_rain: 'Bring an umbrella and use the free shuttle between venues.',
  rain: 'Bring an umbrella. The free shuttle runs every 20 minutes between venues.',
  wind: 'Expect a slower walk between venues; the waterfront paths are exposed.',
  heat: 'Bring water. All venues have water stations and air conditioning.',
  cold: 'Dress warmly; lines outside venues may be long at peak times.',
};

/** Which hazard an hour carries, if any. Thresholds are deliberately simple and explainable. */
export function hourHazard(h: WeatherHour): { hazard: Hazard; level: 'watch' | 'warning' } | null {
  if (h.code >= 95) return { hazard: 'storm', level: 'warning' };
  if (h.snowCm >= 1 || (h.code >= 71 && h.code <= 77) || h.code === 85 || h.code === 86) return { hazard: 'snow', level: h.snowCm >= 2 ? 'warning' : 'watch' };
  if (h.precipMm >= 7) return { hazard: 'heavy_rain', level: 'warning' };
  if (h.precipMm >= 1 && h.precipProb >= 50) return { hazard: 'rain', level: 'watch' };
  if (h.gustKmh >= 70) return { hazard: 'wind', level: 'warning' };
  if (h.gustKmh >= 50) return { hazard: 'wind', level: 'watch' };
  if (h.tempC >= 33) return { hazard: 'heat', level: 'watch' };
  if (h.tempC <= -12) return { hazard: 'cold', level: 'watch' };
  return null;
}

const SEVERITY: Hazard[] = ['cold', 'heat', 'rain', 'wind', 'heavy_rain', 'snow', 'storm'];

/**
 * Merge back-to-back risky hours into one window, named after the worst hazard
 * in it, so one storm makes one alert rather than three.
 */
export function assessWeather(hours: WeatherHour[]): WeatherRisk[] {
  const out: WeatherRisk[] = [];
  const sorted = [...hours].sort((a, b) => a.time.localeCompare(b.time));
  let worst = -1;
  for (const h of sorted) {
    const hz = hourHazard(h);
    if (!hz) continue;
    const last = out[out.length - 1];
    const end = addMinutes(h.time, 60);
    const peak = `${Math.round(h.precipMm * 10) / 10} mm/h, gusts ${Math.round(h.gustKmh)} km/h, ${Math.round(h.tempC)}°C`;
    const rank = SEVERITY.indexOf(hz.hazard) + (hz.level === 'warning' ? 0.5 : 0);
    if (last && last.to === h.time) {
      last.to = end;
      if (hz.level === 'warning') last.level = 'warning';
      if (rank > worst) { worst = rank; last.hazard = hz.hazard; last.peak = peak; }
      last.extraTravelMin = Math.max(last.extraTravelMin, EXTRA[hz.hazard]);
    } else {
      worst = rank;
      out.push({ hazard: hz.hazard, level: hz.level, from: h.time, to: end, peak, extraTravelMin: EXTRA[hz.hazard] });
    }
  }
  return out;
}

export function riskSummary(r: WeatherRisk): string {
  return `${LABEL[r.hazard]} ${r.level === 'warning' ? 'warning' : 'expected'} ${clock(r.from)}–${clock(r.to)}`;
}

let seq = 0;

/**
 * Turn weather risks into actions. Staff get an automatic heads-up and
 * volunteers on shift get a brief update; attendees and guests with plans in
 * the window get a personal recommendation that waits for approval.
 */
export function planWeather(f: Festival, risks: WeatherRisk[], source: string): Action[] {
  const actions: Action[] = [];
  const venueName = (id: string) => f.venues.find(v => v.id === id)?.name ?? id;
  for (const r of risks) {
    const label = riskSummary(r);
    // Events touched by the window, with an hour of slack for travel.
    const touched = f.events.filter(e => e.status === 'scheduled' && overlaps(addMinutes(e.start, -60), e.end, r.from, r.to));
    const touchedIds = new Set(touched.map(e => e.id));

    actions.push({ id: `wx-flag-${++seq}`, kind: 'flag', title: `${label}`,
      rationale: `${source} forecast: ${r.peak} at worst. ${touched.length} event(s) start in or near the window. The agent adds ${r.extraTravelMin} minutes to travel times between venues for recommendations.`,
      payload: { risk: r } });

    const staff = f.people.filter(p => p.role === 'festival_staff');
    actions.push({ id: `wx-staff-${++seq}`, kind: 'notify_staff', title: `Weather heads-up to ${staff.length} staff`,
      rationale: `${label}. Shuttle and front-of-house may need extra hands.`,
      messages: staff.map(p => ({ personId: p.id, channel: 'app_push', subject: label,
        body: `${label}. ${touched.length} event(s) affected. Consider extra shuttle runs and staff at venue doors.` })) });

    const onShift = f.shifts.filter(s => overlaps(s.start, s.end, r.from, r.to));
    if (onShift.length) {
      actions.push({ id: `wx-brief-${++seq}`, kind: 'update_brief', title: `Weather note added to ${new Set(onShift.map(s => s.personId)).size} volunteer briefs`,
        rationale: `${label} overlaps their shifts.`,
        messages: [...new Set(onShift.map(s => s.personId))].map(pid => ({ personId: pid, channel: 'volunteer_brief', subject: label,
          body: `${label}. ${ADVICE[r.hazard]} Point arrivals to the free shuttle and keep the lobby clear for people coming in from the weather.` })) });
    }

    // Attendees and guests with something in the window: a personal note.
    const plans = new Map<string, FestivalEvent[]>();
    const add = (pid: string, eid: string) => {
      if (!touchedIds.has(eid)) return;
      const ev = touched.find(e => e.id === eid)!;
      if (!plans.has(pid)) plans.set(pid, []);
      if (!plans.get(pid)!.some(x => x.id === eid)) plans.get(pid)!.push(ev);
    };
    for (const t of f.tickets) add(t.personId, t.eventId);
    for (const b of f.bookings) add(b.personId, b.eventId);
    for (const e of touched) for (const g of e.guestIds) add(g, e.id);
    const messages: OutboundMessage[] = [];
    for (const [pid, evs] of plans) {
      const p = f.people.find(x => x.id === pid);
      if (!p || p.role === 'festival_staff' || p.role === 'volunteer') continue;
      evs.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
      const first = evs[0];
      const arrive = addMinutes(first.start, -15 - r.extraTravelMin);
      const channel = p.channels.includes('app_push') ? 'app_push' : p.channels.includes('sms') ? 'sms' : 'email';
      messages.push({ personId: pid, channel, subject: `${LABEL[r.hazard]} during your plans`,
        body: `${label}. You're seeing "${first.title}" at ${clock(first.start)}, ${venueName(first.venueId)}`
          + `${evs.length > 1 ? ` (and ${evs.length - 1} more in that window)` : ''}. Allow ${r.extraTravelMin} extra minutes and aim to arrive by ${clock(arrive)}. ${ADVICE[r.hazard]}` });
    }
    if (messages.length) {
      actions.push({ id: `wx-notify-${++seq}`, kind: 'notify_people', title: `Weather update to ${messages.length} people with plans ${clock(r.from)}–${clock(r.to)}`,
        rationale: `${label}. Reached via tickets, saved itineraries and guest bookings for events in the window.`, messages });
    }
  }
  return actions;
}

// ------------------------------------------------------------ demo scenarios
/** Scripted forecasts for demos, placed on a festival day. */
export function scenarioHours(date: string, kind: 'storm' | 'snow' | 'heat' | 'clear'): WeatherHour[] {
  const hours: WeatherHour[] = [];
  for (let h = 8; h <= 23; h++) {
    const time = `${date}T${String(h).padStart(2, '0')}:00`;
    const base: WeatherHour = { time, tempC: 16, precipMm: 0, snowCm: 0, precipProb: 10, gustKmh: 20, code: 1 };
    if (kind === 'storm' && h >= 15 && h < 18) Object.assign(base, { precipMm: h === 16 ? 12 : 8, precipProb: 90, gustKmh: 65, code: h === 16 ? 95 : 63 });
    if (kind === 'snow' && h >= 13 && h < 19) Object.assign(base, { tempC: -2, snowCm: h >= 15 && h < 17 ? 3 : 1, precipProb: 85, code: 73, gustKmh: 35 });
    if (kind === 'heat' && h >= 12 && h < 17) Object.assign(base, { tempC: 35, code: 0 });
    hours.push(base);
  }
  return hours;
}

/** Map Open-Meteo hourly arrays onto a festival day (used for live demo with today's real weather). */
export function fromOpenMeteo(hourly: {
  time: string[]; temperature_2m: number[]; precipitation: number[]; snowfall: number[]; precipitation_probability: number[]; wind_gusts_10m: number[]; weather_code: number[];
}, onDate: string): WeatherHour[] {
  return hourly.time.map((t, i) => ({
    time: `${onDate}T${t.slice(11, 16)}`,
    tempC: hourly.temperature_2m[i] ?? 0,
    precipMm: hourly.precipitation[i] ?? 0,
    snowCm: hourly.snowfall[i] ?? 0,
    precipProb: hourly.precipitation_probability[i] ?? 0,
    gustKmh: hourly.wind_gusts_10m[i] ?? 0,
    code: hourly.weather_code[i] ?? 0,
  }));
}
