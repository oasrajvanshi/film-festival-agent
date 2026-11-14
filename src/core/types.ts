// Core data model for the festival. Everything the agent reads lives here.
// The prototype uses only made-up people (proposal guardrail: Privacy).

export type DayNumber = 1 | 2 | 3;

export interface Venue {
  id: string;
  name: string;
  capacity: number;
  address: string;
}

/** Minutes to travel between two venues, door to door. */
export type TravelMatrix = Record<string, Record<string, number>>;

export interface Film {
  id: string;
  title: string;
  director: string;
  runtimeMin: number;
  section: string;
  /** Person ids of featured filmmakers attached to the film. */
  filmmakerIds: string[];
}

export type EventKind = 'screening' | 'qa' | 'panel' | 'market' | 'activity';

/** Access flags beyond the event kind. */
export type EventRestriction = 'press_only' | 'industry_only' | 'vip_only';

export interface FestivalEvent {
  id: string;
  kind: EventKind;
  title: string;
  venueId: string;
  day: DayNumber;
  /** ISO local datetime, e.g. 2027-04-15T18:30 */
  start: string;
  end: string;
  filmId?: string;
  /** Guests (filmmakers, panelists, moderators) booked to appear. */
  guestIds: string[];
  restriction?: EventRestriction;
  status: 'scheduled' | 'cancelled';
}

export type PersonRole =
  | 'festival_staff'
  | 'volunteer'
  | 'guest'
  | 'attendee'
  | 'industry'
  | 'press';

export type Channel = 'app_push' | 'email' | 'sms' | 'website' | 'volunteer_brief';

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  email: string;
  /** Mobile number for SMS, if given. */
  phone?: string;
  /** Channels this person has opted in to. */
  channels: Channel[];
  /** Volunteers and staff: their job, e.g. "door", "usher", "projection". */
  staffRole?: string;
  /** Opted in to crowd tracking via check-in scans. */
  crowdOptIn: boolean;
}

/**
 * The 10 pass types, modeled on the Tribeca badge.
 * Passes: day_pass, single_ticket, three_day, vip
 * Badges: industry, press, panelist, featured_filmmaker, volunteer, festival_staff
 */
export type PassType =
  | 'day_pass'
  | 'single_ticket'
  | 'three_day'
  | 'vip'
  | 'industry'
  | 'press'
  | 'panelist'
  | 'featured_filmmaker'
  | 'volunteer'
  | 'festival_staff';

export interface Pass {
  id: string;
  personId: string;
  type: PassType;
  /** Day passes are valid on one day; others on every day they list. */
  validDays: DayNumber[];
}

/** An extra ticket for one event, linked to the same person and QR. */
export interface Ticket {
  id: string;
  personId: string;
  eventId: string;
}

/** A volunteer or staff shift at a venue. */
export interface Shift {
  id: string;
  personId: string;
  venueId: string;
  day: DayNumber;
  start: string;
  end: string;
  task: string;
}

/** An event a person saved to their itinerary in the app (activity booking). */
export interface Booking {
  personId: string;
  eventId: string;
}

export interface CheckIn {
  id: string;
  personId: string;
  eventId: string;
  at: string;
  allowed: boolean;
}

/** An official document the agent may quote from. Never generated. */
export interface OfficialDoc {
  id: string;
  title: string;
  /** Plain text, split into sections the agent can cite. */
  sections: { heading: string; body: string }[];
}

export interface Festival {
  name: string;
  dates: Record<DayNumber, string>; // ISO date per festival day
  venues: Venue[];
  travel: TravelMatrix;
  films: Film[];
  events: FestivalEvent[];
  people: Person[];
  passes: Pass[];
  tickets: Ticket[];
  shifts: Shift[];
  bookings: Booking[];
  checkIns: CheckIn[];
  docs: OfficialDoc[];
}
