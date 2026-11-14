// Domain model for the operations backend. It covers the two scenarios we
// support: snow (weather change) and a key guest arriving late.
// Festival data comes from the team's mock sheets (docs/data-contract.md);
// live conditions, decisions and the audit log live in the store.

/** Local festival time, ISO without zone: "2027-02-12T15:15". */
export type Iso = string;

// ---------------------------------------------------------------- sheets

export interface FestivalInfo {
  name: string;
  /** Festival day number to date (YYYY-MM-DD), from the Festival tab. */
  dates: Record<number, string>;
  timezone: string;
  lat: number;
  lon: number;
  /** Total snow (inches) in the rest of the day that starts the snow playbook. */
  snowThresholdIn: number;
}

export interface Venue { id: string; name: string; capacity: number; indoor: boolean; address?: string }

/** Airports, hotels and other non-venue places that appear in travel times. */
export interface Place { id: string; name: string; kind: 'airport' | 'hotel' | 'other' }

/** Minutes door to door in normal conditions. */
export type TravelMatrix = Record<string, Record<string, number>>;

/** Schedule grid types. */
export type SessionKind = 'screening' | 'qa' | 'panel' | 'market' | 'activity';

export interface Session {
  id: string;
  day: number;
  title: string;
  kind: SessionKind;
  venueId: string;
  room?: string;
  start: Iso;
  end: Iso;
  filmId?: string;
  /** Guests booked to appear (Schedule grid, Guest IDs). */
  guestIds: string[];
  restriction?: string;
  outdoor: boolean;
  /** People with a ticket for it or who saved it in the app. */
  expected: number;
  status: 'scheduled' | 'cancelled';
}

export type CallRole = 'speaker' | 'moderator' | 'backup';

/** One row of the call sheet: who must be where, and when. */
export interface CallEntry {
  guestId: string;
  sessionId: string;
  role: CallRole;
  /** Empty on the sheet is allowed; the agent treats it as a data gap. */
  callTime?: Iso;
  /** "sheet" from the Call sheet tab, "default" from the rule (30 min before a panel). */
  callSource?: 'sheet' | 'default';
  spot?: string;
}

/** People tab channels: app_push becomes push, volunteer_brief becomes brief. */
export type Channel = 'sms' | 'email' | 'push' | 'slack' | 'brief';

export interface GuestTravel {
  mode: 'flight' | 'car' | 'local';
  flight?: string;
  /** Place id the trip starts from (airport for flights, hotel for cars). */
  from?: string;
  /** Scheduled landing time for flights. */
  arrival?: Iso;
  /** Festival car pickup time, if one is booked. */
  pickupAt?: Iso;
  /** Minutes from landing to the car (taxi, bags). */
  bufferMin: number;
}

export interface Guest {
  id: string;
  name: string;
  /** Badge from the Passes tab: featured_filmmaker or panelist. */
  badge: string;
  role: string;
  email?: string;
  phone?: string;
  channels: Channel[];
  assistant?: { name: string; email?: string; phone?: string };
  /** Default when there is no trip for the day: in town, at the hotel. */
  travel: GuestTravel;
  /** Guest travel tab: one row per guest per day they travel. */
  trips: (GuestTravel & { day: number })[];
  remoteOk: boolean;
  topics: string[];
}

/**
 * A team is the People tab "Staff role": festival staff (operations, comms,
 * guest_relations, house_manager, director, ...) and volunteers (door,
 * usher, info_desk, projection, security, runner).
 */
export type Team = string;

export interface Shift { venueId: string; day: number; start: Iso; end: Iso; task: string }

export interface StaffMember {
  id: string;
  name: string;
  team: Team;
  title: string;
  /** Festival staff can decide for their team; volunteers cannot. */
  lead: boolean;
  shifts: Shift[];
  channels: Channel[];
  email?: string;
  phone?: string;
}

/** Attendees, industry and press: who holds what, and what they plan to see. */
export interface AudienceMember {
  id: string;
  name: string;
  role: string;
  channels: Channel[];
  passType?: string;
  validDays: number[];
  /** Ticketed or saved events. */
  eventIds: string[];
}

export interface ShuttleRoute {
  id: string;
  name: string;
  stops: string[];
  everyMin: number;
  capacityPerHour: number;
  vendor: string;
  extraBusCost: number;
  extraBusLeadMin: number;
  extraBusCapacityPerHour: number;
}

/** Riders expected on a route in a window, from saved plans in the app. */
export interface ShuttleDemand { routeId: string; from: Iso; to: Iso; expectedRiders: number }

export interface FestivalData {
  info: FestivalInfo;
  venues: Venue[];
  places: Place[];
  travel: TravelMatrix;
  sessions: Session[];
  /** Explicit call sheet rows (optional tab). Speakers without a row get a default call time. */
  callSheet: CallEntry[];
  guests: Guest[];
  staff: StaffMember[];
  audience: AudienceMember[];
  shuttles: ShuttleRoute[];
  /** Optional override; otherwise demand is worked out from saved plans. */
  demand: ShuttleDemand[];
}

// ---------------------------------------------------------------- live feeds

export interface HourlyWeather { hour: Iso; snowIn: number; tempF?: number; visibilityFt?: number }

export interface Forecast {
  source: string;
  issuedAt: Iso;
  hourly: HourlyWeather[];
  alerts: { event: string; start: Iso; end: Iso }[];
}

export interface FlightStatus {
  flight: string;
  status: 'scheduled' | 'en_route' | 'landed' | 'delayed' | 'cancelled';
  scheduledArrival?: Iso;
  estimatedArrival?: Iso;
  source: string;
  updatedAt: Iso;
}

/** A fact the agent acts on, always linked to where it came from. */
export interface Fact {
  key: string;
  value: string;
  source: { kind: 'message' | 'feed' | 'sheet' | 'rule'; ref: string; quote?: string; at: Iso };
  confirmedBy?: string;
}

export interface Conditions {
  forecast?: Forecast;
  shuttleDelays: Record<string, number>;
  flights: Record<string, FlightStatus>;
  checkIns: Record<string, { at: Iso; place: string }>;
  /** ETAs reported by guests or assistants, keyed by guest id. Unconfirmed until a decision is approved. */
  reportedEtas: Record<string, Fact>;
}

// ---------------------------------------------------------------- triggers

export type RecheckScope = 'guest' | 'weather';

export type Trigger =
  | { type: 'weather_update'; id?: string; at: Iso; forecast: Forecast }
  | { type: 'weather_poll'; id?: string; at: Iso }
  | { type: 'flight_update'; id?: string; at: Iso; flight: FlightStatus }
  | { type: 'shuttle_update'; id?: string; at: Iso; routeId: string; delayMin: number }
  | { type: 'guest_checkin'; id?: string; at: Iso; guestId: string; place: string }
  | { type: 'inbound_message'; id?: string; at: Iso; channel: 'email' | 'sms'; from: string; text: string }
  | { type: 'recheck'; id?: string; at: Iso; scope: RecheckScope; ref?: string };

// ---------------------------------------------------------------- actions and decisions

export type ActionKind =
  | 'flag'            // dashboard warning
  | 'staff_heads_up'  // internal message to staff or volunteers
  | 'update_brief'    // live brief for a team
  | 'watch'           // a timer that re-checks later
  | 'message_guest'   // outbound to a guest, panelist or their assistant
  | 'broadcast'       // outbound to an audience segment
  | 'schedule_change' // change to the agenda
  | 'vendor_order';   // order from a vendor (bus, car)

export type Recipient =
  | { kind: 'staff'; id: string }
  | { kind: 'team'; id: Team; venueId?: string }
  | { kind: 'guest'; id: string }
  | { kind: 'assistant'; id: string }
  | { kind: 'segment'; id: string };

export interface SessionChange { sessionId: string; start?: Iso; end?: Iso; addSpeaker?: string; note?: string }

export interface PlannedAction {
  kind: ActionKind;
  summary: string;
  /** Stable key for automatic actions, so a repeated trigger does not repeat them. */
  key?: string;
  to?: Recipient[];
  channels?: Channel[];
  /** Outbound text only ever comes from a template. */
  template?: string;
  vars?: Record<string, string>;
  change?: SessionChange;
  watch?: { at: Iso; trigger: Trigger };
  vendor?: { vendor: string; item: string; cost: number };
  level?: 'red' | 'amber' | 'green' | 'grey';
}

export interface OptionCost {
  /** People who notice the change (audience, guests). */
  people: number;
  /** Outbound messages this option sends. */
  messages: number;
  money: number;
  reversible: boolean;
  note?: string;
}

export type OptionKey = 'A' | 'B' | 'C';

export interface DecisionOption {
  key: OptionKey;
  title: string;
  pros: string;
  cons: string;
  cost: OptionCost;
  actions: PlannedAction[];
  /** Set by policy, never by a playbook or the model. */
  safeDefault?: boolean;
}

export type Scenario = 'weather' | 'guest';

/** What a playbook proposes before policy turns it into a decision. */
export interface DecisionCandidate {
  ref: string;
  key: string;
  scenario: Scenario;
  title: string;
  why: string;
  owner: Team;
  options: DecisionOption[];
  ruleRecommendation: OptionKey;
  ruleReason: string;
  facts: Fact[];
  deadline: Iso;
  /** Short state tag used to tell whether the situation changed. */
  state: string;
}

export type DecisionStatus = 'open' | 'executed' | 'rejected' | 'superseded' | 'failed';

export interface Decision extends Omit<DecisionCandidate, 'ref'> {
  id: string;
  agentRecommendation: { key: OptionKey; rationale: string; via: 'llm' | 'rules'; model?: string; grounded: boolean };
  defaultOption: OptionKey | null;
  status: DecisionStatus;
  escalated: boolean;
  chosen?: { key: OptionKey | null; by: string; at: Iso; via: 'human' | 'deadline' };
  fingerprint: string;
  version: number;
  createdAt: Iso;
  runId: string;
  history: { at: Iso; event: string; by?: string; note?: string }[];
}

// ---------------------------------------------------------------- state

export interface OutboxItem {
  id: string;
  at: Iso;
  key: string;
  kind: ActionKind;
  channel: Channel | 'vendor';
  to: string;
  address: string;
  text: string;
  template?: string;
  delivered: 'mock' | 'sent' | 'failed';
}

export interface Flag { id: string; at: Iso; level: 'red' | 'amber' | 'green' | 'grey'; text: string; key: string }

export interface BriefNote { at: Iso; text: string; key: string }

export interface Timer { id: string; at: Iso; kind: 'deadline' | 'recheck'; ref: string; trigger?: Trigger; fired: boolean }

export type AuditKind = 'trigger' | 'route' | 'llm' | 'tool' | 'decision' | 'act' | 'approval' | 'timer' | 'blocked' | 'review' | 'error';

export interface AuditEntry { seq: number; at: Iso; runId: string; kind: AuditKind; summary: string; data?: unknown }

export interface ReviewItem { id: string; at: Iso; reason: string; from: string; text: string; status: 'open' | 'closed' }

export interface OpsState {
  rev: number;
  seq: number;
  clock: Iso;
  conditions: Conditions;
  overrides: Record<string, { start?: Iso; end?: Iso; addedSpeakers?: string[]; notes?: string[] }>;
  decisions: Decision[];
  /** Idempotency keys of executed steps: each step runs once. */
  done: Record<string, Iso>;
  outbox: OutboxItem[];
  flags: Flag[];
  briefs: Record<string, BriefNote[]>;
  timers: Timer[];
  processed: string[];
  review: ReviewItem[];
  audit: AuditEntry[];
}
