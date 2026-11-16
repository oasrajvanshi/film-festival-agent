'use client';
// What every profile shows for an event: its own picture (one still per
// film, a stage, Q&A, market or reception picture otherwise) and small
// round avatars for the guests on it. A guest the agent has flagged as
// running late gets a highlighted avatar, everywhere they appear.

import type { AgentStore } from './useAgent';
import type { FestivalEvent } from '../../src/core/types';
import { useLateGuests } from './weatherplan';

const TALKS = ['talk-stage', 'talk-speaker', 'talk-qa'];

/** One picture per event: the film's still, or a picture for the kind of event. */
export function eventImage(e: Pick<FestivalEvent, 'kind' | 'filmId' | 'title'>): string {
  if (e.filmId && e.kind === 'screening') return `/hl/ev/${e.filmId}.jpg`;
  if (e.kind === 'qa') return '/hl/ev/talk-qa.jpg';
  if (e.kind === 'market') return '/hl/ev/market.jpg';
  if (e.kind === 'activity') return '/hl/ev/reception.jpg';
  const n = [...e.title].reduce((h, c) => h + c.charCodeAt(0), 0);
  return `/hl/ev/${TALKS[n % 2 === 0 ? 0 : 1]}.jpg`;
}

export function EventThumb({ e, size = 44 }: { e: Pick<FestivalEvent, 'kind' | 'filmId' | 'title'>; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="ev-thumb" src={eventImage(e)} alt="" width={size} height={size} loading="lazy" decoding="async" style={{ width: size, height: size }} />
  );
}

const TONES = ['#b9825a', '#8f6a4f', '#a4744e', '#7d5b46', '#c39367', '#6f5a4e'];
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/** Small round avatars for an event's guests; a late guest is highlighted. */
export function Faces({ s, ids, max = 4, size = 22 }: { s: AgentStore; ids: string[]; max?: number; size?: number }) {
  const late = useLateGuests(s);
  const people = ids.map(id => s.agent.f.people.find(p => p.id === id)).filter(Boolean) as { id: string; name: string }[];
  if (!people.length) return null;
  // Late guests first, so the highlight is never hidden behind "+2".
  people.sort((a, b) => Number(late.has(b.id)) - Number(late.has(a.id)));
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span className="faces" style={{ ['--face' as string]: `${size}px` }} title={people.map(p => `${p.name}${late.has(p.id) ? ' (running late)' : ''}`).join(', ')}>
      {shown.map(p => {
        const tone = TONES[[...p.name].reduce((h, c) => h + c.charCodeAt(0), 0) % TONES.length];
        return <i key={p.id} className={late.has(p.id) ? 'late' : ''} style={{ background: tone }} aria-label={`${p.name}${late.has(p.id) ? ', running late' : ''}`}>{initials(p.name)}</i>;
      })}
      {more > 0 && <i className="more">+{more}</i>}
    </span>
  );
}
