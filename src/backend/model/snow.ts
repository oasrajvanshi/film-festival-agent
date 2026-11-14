// Snow model: what the forecast means for the festival afternoon, and how
// much slower travel gets. Rules only, so staff can check every number.

import type { FestivalInfo, Forecast, Iso } from '../domain/types';
import { addMinutes, isBefore, minutesBetween, toMinutes } from '../domain/time';

export type SnowLevel = 'none' | 'light' | 'moderate' | 'heavy';

export interface SnowSummary {
  level: SnowLevel;
  /** First and last snowy hour (end is exclusive). Undefined if no snow. */
  start?: Iso;
  end?: Iso;
  totalIn: number;
  peakInHr: number;
  threshold: number;
  crossed: boolean;
  source?: string;
  issuedAt?: Iso;
  alert?: string;
}

/** Travel time multipliers: likely (p50) and worst case (p90). */
export const TRAVEL_FACTORS: Record<SnowLevel, { likely: number; worst: number }> = {
  none: { likely: 1, worst: 1.15 },
  light: { likely: 1.2, worst: 1.6 },
  moderate: { likely: 1.45, worst: 2.1 },
  heavy: { likely: 1.8, worst: 2.6 },
};

/** An hour counts as snowy at 0.1 in/hr or more. */
const SNOWY = 0.1;

export function levelFor(peakInHr: number): SnowLevel {
  if (peakInHr < SNOWY) return 'none';
  if (peakInHr < 0.3) return 'light';
  if (peakInHr < 1) return 'moderate';
  return 'heavy';
}

export function summarizeSnow(f: Forecast | undefined, info: FestivalInfo, now: Iso): SnowSummary {
  const base: SnowSummary = { level: 'none', totalIn: 0, peakInHr: 0, threshold: info.snowThresholdIn, crossed: false };
  if (!f) return base;
  // Remaining hours of today, including the current hour.
  const today = now.slice(0, 10);
  const hours = f.hourly
    .filter(h => h.hour.startsWith(today) && toMinutes(h.hour) + 60 > toMinutes(now))
    .sort((a, b) => toMinutes(a.hour) - toMinutes(b.hour));
  const snowy = hours.filter(h => h.snowIn >= SNOWY);
  const totalIn = Math.round(hours.reduce((s, h) => s + h.snowIn, 0) * 10) / 10;
  const peakInHr = hours.reduce((m, h) => Math.max(m, h.snowIn), 0);
  return {
    ...base,
    level: levelFor(peakInHr),
    start: snowy[0]?.hour,
    end: snowy.length ? addMinutes(snowy[snowy.length - 1].hour, 60) : undefined,
    totalIn,
    peakInHr,
    crossed: totalIn >= info.snowThresholdIn,
    source: f.source,
    issuedAt: f.issuedAt,
    alert: f.alerts[0]?.event,
  };
}

export function snowActive(s: SnowSummary, t: Iso): boolean {
  return !!s.start && !!s.end && !isBefore(t, s.start) && isBefore(t, s.end);
}

export interface TravelRange { early: number; likely: number; late: number; inSnow: boolean }

/**
 * Door-to-door minutes for a trip that leaves at `depart`. The snow factor
 * applies when any part of the worst-case trip falls inside the snow window.
 */
export function travelRange(baseMin: number, depart: Iso, s: SnowSummary): TravelRange {
  const worstNormal = Math.round(baseMin * TRAVEL_FACTORS.none.worst);
  const inSnow = s.level !== 'none' && !!s.start && !!s.end
    && isBefore(depart, s.end) && toMinutes(depart) + Math.round(baseMin * TRAVEL_FACTORS[s.level].worst) > toMinutes(s.start);
  const f = inSnow ? TRAVEL_FACTORS[s.level] : TRAVEL_FACTORS.none;
  return { early: baseMin, likely: Math.round(baseMin * f.likely), late: inSnow ? Math.round(baseMin * f.worst) : worstNormal, inSnow };
}

/** Minutes a shuttle loop is likely to run late in this snow, when no feed says otherwise. */
export function estimatedShuttleDelay(everyMin: number, s: SnowSummary): number {
  return Math.round(everyMin * (TRAVEL_FACTORS[s.level].likely - 1));
}

export function snowMinutesLeft(s: SnowSummary, now: Iso): number {
  return s.end ? Math.max(0, minutesBetween(now, s.end)) : 0;
}
