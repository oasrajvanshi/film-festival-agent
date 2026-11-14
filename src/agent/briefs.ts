// Misinformed volunteers → a live brief by role and venue, rebuilt from the
// current grid every time it is opened, so it is never out of date.

import type { Festival, FestivalEvent, Person, Shift } from '../core/types';
import { clock, toMinutes } from '../core/time';
import { ACCESS_RULES, PASS_LABELS } from '../rules/access';
import type { PassType } from '../core/types';

export interface Brief {
  person: Person;
  shift: Shift | null;
  venueName?: string;
  events: { event: FestivalEvent; admits: string[]; note?: string }[];
  changes: string[];
  guidance: string[];
}

const ROLE_GUIDANCE: Record<string, string[]> = {
  door: ['doc-volunteer#Door duty', 'doc-access#Late entry', 'doc-access#Capacity'],
  usher: ['doc-access#Capacity', 'doc-faq#Food', 'doc-faq#Accessibility'],
  info_desk: ['doc-faq#Box office', 'doc-faq#Refunds', 'doc-volunteer#Lost items', 'doc-venues#Shuttle'],
  projection: ['doc-volunteer#Emergencies'],
  security: ['doc-volunteer#Emergencies', 'doc-faq#Bags'],
  runner: ['doc-venues#Shuttle', 'doc-volunteer#Check-in for shifts'],
};

function docLine(f: Festival, ref: string): string | null {
  const [docId, heading] = ref.split('#');
  const s = f.docs.find(d => d.id === docId)?.sections.find(x => x.heading === heading);
  return s ? `${heading}: ${s.body}` : null;
}

export function admitsTo(event: FestivalEvent): string[] {
  return (Object.keys(ACCESS_RULES) as PassType[])
    .filter(t => t !== 'volunteer' && t !== 'festival_staff')
    .filter(t => ACCESS_RULES[t].kinds.includes(event.kind)
      && (!event.restriction || ACCESS_RULES[t].restrictions.includes(event.restriction)))
    .map(t => PASS_LABELS[t]);
}

/** Brief for one volunteer at a moment in time. `recentChanges` comes from the agent log. */
export function buildBrief(f: Festival, personId: string, at: string, recentChanges: string[] = []): Brief {
  const person = f.people.find(p => p.id === personId)!;
  const mine = f.shifts.filter(s => s.personId === personId).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const shift = mine.find(s => toMinutes(s.end) >= toMinutes(at)) ?? null;
  if (!shift) return { person, shift: null, events: [], changes: [], guidance: [] };
  const venue = f.venues.find(v => v.id === shift.venueId)!;
  const events = f.events
    .filter(e => e.venueId === shift.venueId && toMinutes(e.end) > toMinutes(shift.start) && toMinutes(e.start) < toMinutes(shift.end))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    .map(event => ({
      event,
      admits: event.status === 'cancelled' ? [] : admitsTo(event),
      note: event.status === 'cancelled' ? 'CANCELLED' : event.guestIds.length ? `Guests: ${event.guestIds.map(g => f.people.find(p => p.id === g)?.name).join(', ')}` : undefined,
    }));
  const names = new Set(events.map(e => e.event.title));
  const changes = recentChanges.filter(c => [...names].some(n => c.includes(n)) || c.includes(venue.name));
  const guidance = (ROLE_GUIDANCE[shift.task] ?? []).map(r => docLine(f, r)).filter((x): x is string => !!x);
  return { person, shift, venueName: venue.name, events, changes, guidance };
}

export function briefText(b: Brief): string {
  if (!b.shift) return `${b.person.name}: no upcoming shift.`;
  const lines = [
    `${b.person.name} · ${b.shift.task} · ${b.venueName} · ${clock(b.shift.start)}–${clock(b.shift.end)}`,
    ...b.events.map(({ event, admits, note }) => `- ${clock(event.start)} ${event.title}${note ? ` (${note})` : ''}${admits.length ? ` — admits: ${admits.join(', ')}` : ''}`),
  ];
  if (b.changes.length) lines.push('Changes since your shift was set:', ...b.changes.map(c => `- ${c}`));
  if (b.guidance.length) lines.push('From the handbook:', ...b.guidance.map(g => `- ${g}`));
  return lines.join('\n');
}
