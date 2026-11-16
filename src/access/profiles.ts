// The five profiles people sign in as, their access codes, and the vendor
// records derived from the schedule. Pure functions: the UI decides what to
// show, these decide who is who.

import type { DayNumber, Festival, FestivalEvent, Person } from '../core/types';
import { festivalDays } from '../core/types';
import { addMinutes, toMinutes } from '../core/time';

export type ProfileKind = 'organizer' | 'staff' | 'guest' | 'attendee' | 'vendor';

export const PROFILES: { kind: ProfileKind; label: string; blurb: string; prefix: string; icon: string }[] = [
  { kind: 'organizer', label: 'Organizer', blurb: 'The whole festival: schedule, approvals, alerts and data.', prefix: 'ORG', icon: 'home' },
  { kind: 'staff', label: 'Staff', blurb: 'Your shift, your live brief and the door scanner. Volunteers sign in here.', prefix: 'STF', icon: 'users' },
  { kind: 'guest', label: 'Guest', blurb: 'Your appearances, screenings and updates. Filmmakers, panelists, press and jury.', prefix: 'GST', icon: 'film' },
  { kind: 'attendee', label: 'Attendee', blurb: 'Your pass, tickets, saved screenings and updates.', prefix: 'ATT', icon: 'ticket' },
  { kind: 'vendor', label: 'Vendor', blurb: 'Your deliveries and timings, kept in step with the schedule.', prefix: 'VND', icon: 'truck' },
];

/** Festival staff in these jobs run the festival; other staff get the staff view. */
export const ORGANIZER_JOBS = ['director', 'operations', 'programmer'];

/** "Operations", "Festival Director", "Lead programmer" all count; case and extra words don't matter. */
export const isOrganizerJob = (job = '') => job.toLowerCase().split(/[^a-z]+/).some(w => ORGANIZER_JOBS.includes(w));

export function profileOf(p: Person): Exclude<ProfileKind, 'vendor'> {
  if (p.role === 'festival_staff') return isOrganizerJob(p.staffRole) ? 'organizer' : 'staff';
  if (p.role === 'volunteer') return 'staff';
  if (p.role === 'guest' || p.role === 'press') return 'guest';
  return 'attendee'; // attendee, industry
}

// ------------------------------------------------------------------ vendors
export interface VendorDelivery {
  id: string;
  day: DayNumber;
  at: string;          // ISO local time the vendor should arrive
  venueId: string;
  what: string;
  eventId?: string;
  cancelled: boolean;
}
export interface Vendor { id: string; name: string; service: string; contact: string; email: string; deliveries: VendorDelivery[] }

/**
 * Vendors and what they deliver, derived from the current schedule so a
 * moved or cancelled event changes the vendor's timings automatically.
 */
export function deriveVendors(f: Festival): Vendor[] {
  const byStart = (a: VendorDelivery, b: VendorDelivery) => a.at.localeCompare(b.at);
  const days = festivalDays(f).filter(d => f.events.some(e => e.day === d));

  const print: VendorDelivery[] = [];
  const firstShow = new Map<string, FestivalEvent>();
  for (const e of [...f.events].sort((a, b) => a.start.localeCompare(b.start))) {
    if (e.kind === 'screening' && e.filmId && !firstShow.has(e.filmId)) firstShow.set(e.filmId, e);
  }
  for (const [filmId, e] of firstShow) {
    const film = f.films.find(x => x.id === filmId);
    print.push({ id: `pr-${e.id}`, day: e.day, at: addMinutes(e.start, -90), venueId: e.venueId, what: `Print drive for "${film?.title ?? e.title}" (tech check before ${e.start.slice(11)})`, eventId: e.id, cancelled: e.status === 'cancelled' });
  }

  const food: VendorDelivery[] = [];
  for (const d of days) for (const v of f.venues) {
    const on = f.events.filter(e => e.day === d && e.venueId === v.id && e.status === 'scheduled');
    if (!on.length) continue;
    const date = f.dates[d];
    food.push({ id: `fd-${d}-${v.id}-l`, day: d, at: `${date}T11:30`, venueId: v.id, what: 'Green room lunch for guests and crew', cancelled: false });
    if (on.some(e => toMinutes(e.end) > 18 * 60)) food.push({ id: `fd-${d}-${v.id}-d`, day: d, at: `${date}T17:30`, venueId: v.id, what: 'Green room dinner', cancelled: false });
  }

  const shuttle: VendorDelivery[] = [];
  for (const d of days) {
    const on = f.events.filter(e => e.day === d && e.status === 'scheduled').sort((a, b) => a.start.localeCompare(b.start));
    if (!on.length) continue;
    const last = on.reduce((m, e) => (e.end > m ? e.end : m), on[0].end);
    shuttle.push({ id: `sh-${d}`, day: d, at: addMinutes(on[0].start, -30), venueId: on[0].venueId, what: `Loop shuttle between all venues every 20 min until ${last.slice(11)}`, cancelled: false });
  }

  const av: VendorDelivery[] = f.events.filter(e => e.kind === 'panel' || e.kind === 'qa').map(e => ({
    id: `av-${e.id}`, day: e.day, at: addMinutes(e.start, -45), venueId: e.venueId, what: `Mics and stage set for "${e.title}"`, eventId: e.id, cancelled: e.status === 'cancelled',
  }));

  return [
    { id: 'v-print', name: 'Lantern Print Couriers', service: 'Film print delivery', contact: 'Mara Quill', email: 'dispatch@lantern-couriers.example.test', deliveries: print.sort(byStart) },
    { id: 'v-food', name: 'Pier Street Kitchen', service: 'Green room catering', contact: 'Teo Barros', email: 'orders@pierstreet.example.test', deliveries: food.sort(byStart) },
    { id: 'v-shuttle', name: 'Harbor Loop Shuttles', service: 'Venue shuttle', contact: 'Ines Okafor', email: 'ops@harborloop.example.test', deliveries: shuttle.sort(byStart) },
    { id: 'v-av', name: 'Bright Booth AV', service: 'Stage sound and mics', contact: 'Sol Haddad', email: 'crew@brightbooth.example.test', deliveries: av.sort(byStart) },
  ];
}

// ------------------------------------------------------------------ codes
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** A short code like ATT-7KQ2, stable for a person in a festival. */
export function accessCode(kind: ProfileKind, id: string, festivalName: string): string {
  let h = hash(`${festivalName}|${kind}|${id}`);
  let out = '';
  for (let i = 0; i < 4; i++) { out += ALPHABET[h % ALPHABET.length]; h = Math.floor(h / ALPHABET.length); }
  return `${PROFILES.find(p => p.kind === kind)!.prefix}-${out}`;
}

export interface Who { kind: ProfileKind; id: string; name: string; detail: string; code: string; email?: string; contact?: string }

/** Everyone who can sign in, with their code. Only organizers ever see this list. */
export function directory(f: Festival): Who[] {
  const people: Who[] = f.people.map(p => {
    const kind = profileOf(p);
    const detail = p.role === 'festival_staff' || p.role === 'volunteer' ? `${p.role === 'volunteer' ? 'Volunteer' : 'Staff'} · ${(p.staffRole ?? '').replace(/_/g, ' ')}` : p.role[0].toUpperCase() + p.role.slice(1);
    return { kind, id: p.id, name: p.name, detail, code: accessCode(kind, p.id, f.name), email: p.email };
  });
  const vendors: Who[] = deriveVendors(f).map(v => ({ kind: 'vendor', id: v.id, name: v.name, detail: v.service, code: accessCode('vendor', v.id, f.name), email: v.email, contact: v.contact }));
  return [...people, ...vendors];
}

/** Check a code for a chosen profile. Codes for another profile never match. */
export function signIn(f: Festival, kind: ProfileKind, code: string): Who | null {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Demo: any code opens the chosen profile; a real code opens its own person.
  const all = directory(f);
  return all.find(w => w.kind === kind && w.code.replace('-', '') === clean) ?? all.find(w => w.kind === kind) ?? null;
}

// ------------------------------------------------------------------ code by email
const normName = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const normEmail = (x: string) => x.trim().toLowerCase();

export type CodeLookup = { ok: true; who: Who } | { ok: false; reason: 'bad_email' | 'not_found' | 'name_mismatch' };

/**
 * Before a code is emailed, check the name and email against the festival's
 * own people list for the chosen profile. Vendors can give the company name
 * or their contact's name. Nothing is sent unless both match one person.
 */
export function lookupForCode(f: Festival, kind: ProfileKind, name: string, email: string): CodeLookup {
  const e = normEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, reason: 'bad_email' };
  const hit = directory(f).find(w => w.kind === kind && normEmail(w.email ?? '') === e);
  if (!hit) return { ok: false, reason: 'not_found' };
  const n = normName(name);
  const names = [hit.name, hit.contact ?? ''].map(normName).filter(Boolean);
  if (!n || !names.includes(n)) return { ok: false, reason: 'name_mismatch' };
  return { ok: true, who: hit };
}
