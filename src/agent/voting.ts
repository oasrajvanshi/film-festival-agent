// Unverified votes (post-MVP) → send the audience-award voting form only to
// people who checked in to the screening. Award results stay with the awards team.

import type { Festival } from '../core/types';
import type { Action } from './approvals';

export function planVoteForm(f: Festival, eventId: string): Action | null {
  const ev = f.events.find(e => e.id === eventId);
  if (!ev || ev.kind !== 'screening' || ev.restriction) return null;
  const voters = [...new Set(f.checkIns.filter(c => c.eventId === eventId && c.allowed).map(c => c.personId))]
    .map(id => f.people.find(p => p.id === id)!)
    .filter(p => p.role === 'attendee' || p.role === 'industry' || p.role === 'press');
  if (!voters.length) return null;
  return {
    id: `vote-${eventId}`, kind: 'send_vote_form', title: `Send audience-award form for "${ev.title}" to ${voters.length} checked-in viewers`,
    rationale: `Only people with an allowed check-in scan for ${ev.id} receive the form.`,
    messages: voters.map(p => ({ personId: p.id, channel: p.channels.includes('app_push') ? 'app_push' : 'email',
      subject: `Rate ${ev.title}`, body: `Thanks for watching ${ev.title}. Rate it for the Audience Award in the app.` })),
  };
}
