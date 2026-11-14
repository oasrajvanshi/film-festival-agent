// The approval gate. Whether an action may run without a person is a fixed
// rule about who it reaches and whether it speaks for the festival, never the
// model's judgment (proposal: The Guardrails, Approval gates).

import type { Channel } from '../core/types';

export type ActionKind =
  | 'notify_people'        // outbound messages to attendees, guests or partners
  | 'update_website'       // public listing change
  | 'public_announcement'  // festival-wide message
  | 'roster_change'        // volunteer or staff roster edit
  | 'update_brief'         // internal live brief for volunteers and staff
  | 'notify_staff'         // internal heads-up to festival staff
  | 'flag'                 // a warning on the dashboard
  | 'send_vote_form'       // voting form to checked-in attendees
  | 'vendor_contingency';  // contingency message to a vendor or partner

export interface OutboundMessage {
  personId: string;
  channel: Channel;
  subject: string;
  body: string;
}

export interface Action {
  id: string;
  kind: ActionKind;
  title: string;
  /** Why the agent proposes this, with the records it read. */
  rationale: string;
  messages?: OutboundMessage[];
  payload?: unknown;
}

export type Gate = 'auto' | 'needs_approval' | 'never';

/** The policy table. Keep in sync with the README. */
export const GATE_POLICY: Record<ActionKind, Gate> = {
  update_brief: 'auto',
  notify_staff: 'auto',
  flag: 'auto',
  notify_people: 'needs_approval',
  update_website: 'needs_approval',
  public_announcement: 'needs_approval',
  roster_change: 'needs_approval',
  send_vote_form: 'needs_approval',
  vendor_contingency: 'needs_approval',
};

export function gateFor(a: Action): Gate {
  return GATE_POLICY[a.kind];
}

export interface QueueItem {
  action: Action;
  runId: string;
  status: 'pending' | 'approved' | 'rejected' | 'done';
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}
