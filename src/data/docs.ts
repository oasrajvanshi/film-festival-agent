// Mock "official documents" for the made-up festival. In a real deployment staff
// load these from Drive; the agent only quotes them, it never writes them
// (proposal guardrail: Retrieves, never creates).

import type { OfficialDoc } from '../core/types';

export const OFFICIAL_DOCS: OfficialDoc[] = [
  {
    id: 'doc-access',
    title: 'Pass and Badge Access Policy',
    sections: [
      { heading: 'Day pass', body: 'A Day Pass admits the holder to public screenings and Q&As on the day printed on the pass. It does not admit to panels, the Industry Market, press screenings or receptions.' },
      { heading: 'Single-screening ticket', body: 'A Single-Screening Ticket admits one person to the one screening named on the ticket, including the Q&A that follows it.' },
      { heading: 'Festival pass', body: 'A Festival Pass admits the holder to all public screenings, Q&As and panels on all three festival days. It does not admit to the Industry Market, press screenings or receptions.' },
      { heading: 'VIP pass', body: 'A VIP Pass admits the holder to all public screenings, Q&As, panels and the evening Filmmaker Reception on all three days. It does not admit to the Industry Market or press screenings.' },
      { heading: 'Industry badge', body: 'An Industry Badge admits the holder to all public screenings, Q&As, panels and the Industry Market. It does not admit to press screenings or receptions.' },
      { heading: 'Press badge', body: 'A Press Badge admits the holder to all public screenings, Q&As, panels and press screenings. It does not admit to the Industry Market or receptions.' },
      { heading: 'Panelist badge', body: 'A Panelist Badge admits the holder to all panels, public screenings and Q&As, and to the Filmmaker Reception.' },
      { heading: 'Featured filmmaker badge', body: 'A Featured Filmmaker Badge admits the holder to all public screenings, Q&As, panels, the Industry Market and the Filmmaker Reception.' },
      { heading: 'Volunteer badge', body: 'A Volunteer Badge admits the holder to the venue of their assigned shift, from 30 minutes before the shift starts until it ends. It is not an audience pass.' },
      { heading: 'Festival staff badge', body: 'A Festival Staff Badge admits the holder to every venue and event.' },
      { heading: 'Extra tickets', body: 'Any pass holder may hold extra Single-Screening Tickets. All tickets and passes for one person share one QR code in the festival app.' },
      { heading: 'Late entry', body: 'Doors close 15 minutes after a screening starts. Late entry is not permitted after that, regardless of pass type.' },
      { heading: 'Capacity', body: 'Pass holders are admitted while seats remain. A pass does not guarantee a seat. Ticket holders are guaranteed a seat until 10 minutes before start time.' },
    ],
  },
  {
    id: 'doc-faq',
    title: 'Attendee FAQ',
    sections: [
      { heading: 'Festival dates', body: 'The Harbor Lights Film Festival runs April 15 to 17, 2027, across four venues: Harbor Theater, Canal Street Cinema, Pier 9 Hall and Riverside Studio.' },
      { heading: 'Box office', body: 'The festival does not sell tickets through the app. Tickets are sold by the ticketing partner online and at the Harbor Theater box office, open 9:00 am to 8:00 pm each festival day.' },
      { heading: 'QR code', body: 'Your QR code is in the festival app under My Pass. It covers your pass and every extra ticket you hold. Screenshots are accepted.' },
      { heading: 'Accessibility', body: 'All four venues are step-free. Harbor Theater and Canal Street Cinema have hearing loops. Captioned screenings are marked CC in the schedule. Wheelchair seating can be reserved by emailing access@harborlights.example.' },
      { heading: 'Refunds', body: 'Refunds are handled by the ticketing partner. Festival staff and volunteers cannot issue refunds.' },
      { heading: 'Bags', body: 'Small bags are allowed. Large bags and suitcases can be left at the Harbor Theater cloakroom.' },
      { heading: 'Food', body: 'Food is not allowed in screening rooms. Drinks with lids are allowed.' },
    ],
  },
  {
    id: 'doc-venues',
    title: 'Venue Guide',
    sections: [
      { heading: 'Harbor Theater', body: 'Harbor Theater, 12 Pier Road, seats 400. Box office and cloakroom are on the ground floor. It is a 10-minute walk from Pier 9 Hall.' },
      { heading: 'Canal Street Cinema', body: 'Canal Street Cinema, 88 Canal Street, seats 180. It is 15 minutes from Riverside Studio and 20 minutes from Harbor Theater.' },
      { heading: 'Pier 9 Hall', body: 'Pier 9 Hall seats 250 and hosts panels, the Industry Market and the evening Filmmaker Reception.' },
      { heading: 'Riverside Studio', body: 'Riverside Studio, 3 Riverside Walk, seats 120. Press screenings are held here at 8:00 am each day.' },
      { heading: 'Shuttle', body: 'A free festival shuttle loops Harbor Theater, Pier 9 Hall, Canal Street Cinema and Riverside Studio every 20 minutes from 8:00 am to 11:00 pm.' },
    ],
  },
  {
    id: 'doc-volunteer',
    title: 'Volunteer Handbook',
    sections: [
      { heading: 'Check-in for shifts', body: 'Arrive 30 minutes before your shift and check in with the house manager at your venue.' },
      { heading: 'Door duty', body: 'Scan every QR code. If the scanner shows red, read the reason aloud and direct the person to the info desk. Do not override a red scan; only a house manager can make an exception.' },
      { heading: 'Lost items', body: 'Lost items go to the info desk at Harbor Theater.' },
      { heading: 'Emergencies', body: 'In an emergency, call venue security first, then the house manager. Do not post about incidents on social media.' },
      { heading: 'Shift swaps', body: 'Shift swaps must be approved by the volunteer coordinator. Final rosters are set by festival operations.' },
    ],
  },
];
