// Every outbound text comes from one of these templates, filled with facts
// from the sheets and the feeds. The model never writes outbound copy, so a
// message cannot carry text from an inbound email or an invented detail.

export const TEMPLATES = {
  // attendees
  weather_notice: 'Snow is expected {snowSpan}. Allow extra time between venues{shuttleNote}. Your plan in the app is up to date.',
  session_delay: '"{session}" at {venue} now starts at {newStart} (was {oldStart}). Your seat is held.',

  // guests
  backup_standby: 'Hi {name}, could you be at {venue} ({spot}) by {callTime} today as backup for "{session}"? {primary} may be delayed. Please reply to confirm. Thank you.',
  backup_go: 'Hi {name}, please join "{session}" on stage at {start} in place of {primary}, who is delayed. {moderator} will brief you in the {spot}.',
  moderator_swap: 'Hi {name}, {primary} is delayed (latest ETA {eta}). Please start "{session}" at {start} with {backup}. {primary} joins on arrival through the stage door.',
  moderator_delay: 'Hi {name}, "{session}" now starts at {newStart} (was {oldStart}) so {primary} can make it.',
  guest_join_on_arrival: 'Hi {name}, no rush, stay safe. {backup} will open "{session}" at {start}. Come to the stage door at {venue} when you arrive and the team will bring you on.',
  guest_delay_ok: 'Hi {name}, we moved "{session}" to {newStart}. Come to the stage door at {venue} when you arrive.',
  remote_join: 'Hi {name}, can you join "{session}" by video from {start} until you arrive? Our AV team will text you a link and a quick test call.',
  remote_standby: 'Hi {name}, in case the snow slows you down, could you be ready to join "{session}" by video at {start}? We will only use it if needed.',
  pickup_change: 'Hi {name}, because of the snow your car to {venue} will now pick you up at {newPickup} instead of {oldPickup}. Thank you.',

  // staff and volunteers
  brief_snow_door: 'Snow {snowSpan}. Expect late arrivals and wet floors: put the mats out and keep late entry open 15 minutes after start{shuttleNote}.',
  brief_snow_shuttle: 'Snow {snowSpan}. Drive slower, log each departure in the driver app, and tell Transport if a stop is unsafe.',
  transport_heads_up: '{route} is running about {delay} min late. Saved plans show {riders} riders for {capacity} seats, {window}.',
  talent_heads_up: '{name} is {status} for "{session}" ({callWord}). ETA {eta}. Basis: {basis}.',
  stage_brief: '"{session}" at {start}: {backup} replaces {primary} at the start. {primary} joins on arrival (ETA {eta}); meet at the stage door.',
  stage_door_brief: '{name} is running late for "{session}" (ETA {eta}). Meet them at the stage door and bring them straight to the {spot}.',
  delay_brief: '"{session}" now starts at {newStart} (was {oldStart}). Hold the doors and tell arrivals their seats are held.',
  late_seating: 'Keep the start times, and seat late arrivals for the first {holdMin} minutes: {route} is running about {delay} min late.',
  av_remote: 'Set up a video link for {name} on "{session}" by {setupBy}. Test call before {start}.',
  driver_change: "Move {name}'s pickup at {place} to {newPickup} (was {oldPickup}).",
  outdoor_brief: '"{session}" moves indoors at {venue} because of snow. Set up there by {setupBy}.',
  outdoor_keep: '"{session}" stays outdoors. Put out covers and mats and clear the path by {setupBy}.',
  owner_ping: 'Decision for {team}: {title}. Due {deadline}. Recommended: {option}.',
  default_ran: 'No answer on "{title}" by {deadline}. The safe default ran: {option}. Nothing public was sent.',
  escalation: 'No answer on "{title}" by {deadline}. Nothing was sent. Please decide.',

  // vendors
  vendor_extra_bus: 'Please add one bus on {route}, {window}. Reply to confirm.',
} as const;

export type TemplateId = keyof typeof TEMPLATES;

export function isTemplate(id: string): id is TemplateId {
  return id in TEMPLATES;
}

export function templateVars(id: TemplateId): string[] {
  return [...TEMPLATES[id].matchAll(/\{(\w+)\}/g)].map(m => m[1]);
}

/** Fill a template. Throws if a variable is missing, so no half-filled text goes out. */
export function render(id: string, vars: Record<string, string> = {}): string {
  if (!isTemplate(id)) throw new Error(`Unknown template "${id}"`);
  const missing = templateVars(id).filter(k => vars[k] === undefined);
  if (missing.length) throw new Error(`Template "${id}" is missing ${missing.join(', ')}`);
  return TEMPLATES[id].replace(/\{(\w+)\}/g, (_, k: string) => vars[k]);
}
