// Read access to the festival as it stands now: the sheets plus changes the
// backend has made since (approved schedule changes, added speakers).

import type { CallEntry, FestivalData, Guest, GuestTravel, Iso, OpsState, Session, StaffMember, Team, Venue } from './types';
import { addMinutes, isBefore, toMinutes } from './time';

/** Default call time when the call sheet has no row: minutes before start. */
export const DEFAULT_CALL_MIN: Record<Session['kind'], number> = { panel: 30, screening: 20, qa: 10, market: 15, activity: 15 };

/** Display names for decision owners and teams. */
export const TEAM_NAMES: Record<string, string> = {
  comms: 'Comms', operations: 'Operations', guest_relations: 'Guest relations', house_manager: 'House managers', director: 'Festival director',
  programmer: 'Programming', awards: 'Awards', door: 'Door team', usher: 'Ushers', info_desk: 'Info desk', projection: 'Projection',
  security: 'Security', runner: 'Runners',
};
export const teamName = (t: Team) => TEAM_NAMES[t] ?? t.replace(/_/g, ' ');

export class FestivalView {
  constructor(public readonly data: FestivalData, public readonly state: OpsState) {}

  get info() { return this.data.info; }

  dateOf(day: number): string { return this.data.info.dates[day] ?? this.data.info.dates[1]; }

  dayOf(t: Iso): number {
    const d = Object.entries(this.data.info.dates).find(([, date]) => t.startsWith(date));
    return d ? Number(d[0]) : 0;
  }

  sessions(): Session[] {
    return this.data.sessions.map(s => {
      const o = this.state.overrides[s.id];
      return o ? { ...s, start: o.start ?? s.start, end: o.end ?? s.end } : s;
    });
  }

  session(id: string): Session | undefined {
    return this.sessions().find(s => s.id === id);
  }

  venue(id: string): Venue | undefined { return this.data.venues.find(v => v.id === id); }
  guest(id: string): Guest | undefined { return this.data.guests.find(g => g.id === id); }
  staff(id: string): StaffMember | undefined { return this.data.staff.find(s => s.id === id); }

  /** Guest by id, or by name (case-insensitive, full name or a unique part). */
  findGuest(ref: string): Guest | undefined {
    const r = ref.trim().toLowerCase();
    const byId = this.data.guests.find(g => g.id.toLowerCase() === r);
    if (byId) return byId;
    const exact = this.data.guests.find(g => g.name.toLowerCase() === r);
    if (exact) return exact;
    const partial = this.data.guests.filter(g => g.name.toLowerCase().includes(r) || r.includes(g.name.toLowerCase()));
    return partial.length === 1 ? partial[0] : undefined;
  }

  placeName(id: string): string {
    return this.venue(id)?.name ?? this.data.places.find(p => p.id === id)?.name ?? id;
  }

  name(id: string): string {
    return this.guest(id)?.name ?? this.staff(id)?.name ?? this.session(id)?.title ?? this.placeName(id);
  }

  /** The guest's trip on a festival day, or the default (in town). */
  travelFor(g: Guest, day: number): GuestTravel {
    return g.trips.find(t => t.day === day) ?? g.travel;
  }

  /**
   * Who must be where: Schedule grid guests as speakers with a default call
   * time, overridden by Call sheet rows, plus backups from the Call sheet and
   * speakers added by approved decisions.
   */
  calls(): CallEntry[] {
    const sheet = this.data.callSheet;
    const out: CallEntry[] = [];
    for (const s of this.sessions()) {
      for (const g of s.guestIds) {
        const row = sheet.find(c => c.guestId === g && c.sessionId === s.id && c.role !== 'backup');
        const callTime = row?.callTime ?? addMinutes(s.start, -DEFAULT_CALL_MIN[s.kind]);
        out.push({ guestId: g, sessionId: s.id, role: row?.role ?? 'speaker', callTime, callSource: row?.callTime ? 'sheet' : 'default', spot: row?.spot });
      }
    }
    for (const c of sheet) {
      if (out.some(x => x.guestId === c.guestId && x.sessionId === c.sessionId)) continue;
      out.push(c);
    }
    for (const [sessionId, o] of Object.entries(this.state.overrides)) {
      for (const guestId of o.addedSpeakers ?? []) {
        const e = out.find(x => x.guestId === guestId && x.sessionId === sessionId);
        if (e) e.role = 'speaker';
        else out.push({ guestId, sessionId, role: 'speaker' });
      }
    }
    return out;
  }

  callsFor(guestId: string): CallEntry[] {
    return this.calls().filter(c => c.guestId === guestId);
  }

  callsForSession(sessionId: string): CallEntry[] {
    return this.calls().filter(c => c.sessionId === sessionId);
  }

  /** Sessions a guest is booked for (as speaker or moderator) on a day, sorted. */
  bookings(guestId: string, day: number): Session[] {
    const ids = new Set(this.callsFor(guestId).filter(c => c.role !== 'backup').map(c => c.sessionId));
    return this.sessions().filter(s => ids.has(s.id) && s.day === day && s.status === 'scheduled').sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  }

  travelMin(from: string | undefined, to: string): number | undefined {
    if (!from) return undefined;
    return this.data.travel[from]?.[to];
  }

  /** The next scheduled session in the same room (same venue if rooms are not listed). */
  nextInRoom(s: Session): Session | undefined {
    return this.sessions()
      .filter(x => x.id !== s.id && x.status === 'scheduled' && x.venueId === s.venueId && (x.room ?? '') === (s.room ?? '')
        && toMinutes(x.start) >= toMinutes(s.start))
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))[0];
  }

  /** Staff of a team. With a venue: volunteers on shift there that day, else all of the team. */
  team(team: Team, venueId?: string, at?: Iso): StaffMember[] {
    const all = this.data.staff.filter(s => s.team === team);
    if (!venueId) return all;
    const day = at ? this.dayOf(at) : 0;
    return all.filter(s => s.shifts.some(sh => sh.venueId === venueId && (!at || (sh.day === day && isBefore(at, sh.end)))));
  }

  leadOf(team: Team): StaffMember | undefined {
    return this.data.staff.find(s => s.team === team && s.lead);
  }

  /** Audience segments that a broadcast may address. */
  segment(id: string): { label: string; count: number } | undefined {
    const m = id.match(/^day:(\d+)$/);
    if (m) {
      const day = Number(m[1]);
      const count = this.data.audience.filter(a => a.validDays.includes(day)
        || a.eventIds.some(e => this.data.sessions.find(s => s.id === e)?.day === day)).length;
      return { label: `Pass and ticket holders for day ${day}`, count };
    }
    if (id.startsWith('event:')) {
      const s = this.session(id.slice(6));
      return s ? { label: `People with "${s.title}" in their plan`, count: s.expected } : undefined;
    }
    return undefined;
  }
}
