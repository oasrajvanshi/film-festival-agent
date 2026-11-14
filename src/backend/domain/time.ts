// Time helpers for one festival day. Sheets may write "3:15 PM", "15:15" or a
// full ISO string; everything inside the backend is local ISO without zone.

import { addMinutes, clock, toMinutes } from '../../core/time';
import type { Iso } from './types';

export { addMinutes, clock, toMinutes };

/** Parse a sheet time. Returns undefined for an empty cell. */
export function parseTime(value: string | undefined, date: string): Iso | undefined {
  const v = (value ?? '').trim();
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}/.test(v)) {
    const [d, t] = v.split('T');
    const [h, m] = t.split(':');
    return `${d}T${h.padStart(2, '0')}:${m.slice(0, 2)}`;
  }
  const m = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (!m) throw new Error(`Cannot read time "${v}"`);
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  const ap = m[3]?.toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) throw new Error(`Cannot read time "${v}"`);
  return `${date}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "HH:MM" on the festival day. */
export function at(date: string, hhmm: string): Iso {
  return parseTime(hhmm, date)!;
}

export function minutesBetween(from: Iso, to: Iso): number {
  return toMinutes(to) - toMinutes(from);
}

export function isBefore(a: Iso, b: Iso): boolean {
  return toMinutes(a) < toMinutes(b);
}

export function maxIso(...xs: Iso[]): Iso {
  return xs.reduce((m, x) => (toMinutes(x) > toMinutes(m) ? x : m));
}

export function minIso(...xs: Iso[]): Iso {
  return xs.reduce((m, x) => (toMinutes(x) < toMinutes(m) ? x : m));
}

export function roundUp5(n: number): number {
  return Math.ceil(n / 5) * 5;
}

/** "2:00 to 7:00 pm" style range for messages. */
export function span(a: Iso, b: Iso): string {
  const x = clock(a), y = clock(b);
  return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -3)} to ${y}` : `${x} to ${y}`;
}

/**
 * Read a time someone wrote in a message ("ETA 3:30", "around 4pm").
 * Without am/pm, hours 1 to 9 are taken as afternoon, since the festival runs
 * in the afternoon and evening.
 */
export function timeFromText(text: string, date: string): Iso | undefined {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b/i);
  if (!m) return undefined;
  let h = Number(m[1] ?? m[4]);
  const min = Number(m[2] ?? '0');
  const ap = (m[3] ?? m[5])?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  else if (ap === 'am' && h === 12) h = 0;
  else if (!ap && h >= 1 && h <= 9) h += 12;
  if (h > 23 || min > 59) return undefined;
  return `${date}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
