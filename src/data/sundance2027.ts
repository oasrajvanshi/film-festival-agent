// Public facts about the Sundance Film Festival 2027 in Boulder, Colorado, used
// to build the live demo (src/data/sundance.ts). Sources for every fact are
// listed in data/sundance-2027/README.md. Where 2027 details were not yet
// public (16 Nov 2026), the README says so and what was used instead.
//

import type { DayNumber, OfficialDoc, Room, TravelMatrix, Venue } from '../core/types';

export const FESTIVAL_NAME = 'Sundance Film Festival 2027';

/** Thursday 21 January to Sunday 31 January 2027. */
export const DATES: Record<DayNumber, string> = {
  1: '2027-01-21', 2: '2027-01-22', 3: '2027-01-23', 4: '2027-01-24', 5: '2027-01-25', 6: '2027-01-26',
  7: '2027-01-27', 8: '2027-01-28', 9: '2027-01-29', 10: '2027-01-30', 11: '2027-01-31',
};

/** First and last screening start each day: opening night starts late, the last Sunday ends early. */
export const DAY_SHAPE: Record<DayNumber, { first: string; last: string }> = {
  1: { first: '11:30', last: '22:00' }, 2: { first: '08:30', last: '22:00' }, 3: { first: '08:30', last: '22:00' },
  4: { first: '08:30', last: '22:00' }, 5: { first: '08:30', last: '22:00' }, 6: { first: '08:30', last: '22:00' },
  7: { first: '08:30', last: '22:00' }, 8: { first: '08:30', last: '22:00' }, 9: { first: '08:30', last: '22:00' },
  10: { first: '08:30', last: '21:30' }, 11: { first: '10:00', last: '18:30' },
};

export interface SundanceVenue extends Venue {
  lat: number; lng: number; area: string; use: string;
  /** screen: public screenings · hub: talks · industry: industry office · lodge: receptions. */
  role: 'screen' | 'hub' | 'industry' | 'lodge';
  /** Screening start times (24h), every day the venue runs. */
  slots?: string[];
  /** Hosts the morning press & industry screenings. */
  pressIndustry?: boolean;
  piSlots?: string[];
  rooms?: Room[];
}

// Official 2027 venues (Sundance Institute, Feb 24 2026 release and the festival map at
// festival.sundance.org/media/maps). Coordinates are the official map's. Capacities are the
// venues' own published figures; three are not confirmed (Boulder High, Casey, eTown).
export const VENUES: SundanceVenue[] = [
  { id: 'v-macky', name: 'Macky Auditorium', address: '1595 Pleasant St, CU Boulder', capacity: 2036, lat: 40.0099788, lng: -105.2727874,
    area: 'CU Boulder campus', use: 'Premieres', role: 'screen', slots: ['11:30', '14:45', '18:00', '21:30'] },
  { id: 'v-chautauqua', name: 'Chautauqua Auditorium', address: '900 Baseline Rd, Boulder', capacity: 1300, lat: 39.9977067, lng: -105.2801537,
    area: 'Chautauqua Park', use: 'Premieres · outdoor queue only', role: 'screen', slots: ['12:00', '15:15', '18:30', '21:45'] },
  { id: 'v-boulder-theater', name: 'Boulder Theater', address: '2032 14th St, Boulder', capacity: 850, lat: 40.0192048, lng: -105.2774254,
    area: 'Downtown', use: 'Premieres', role: 'screen', slots: ['09:00', '12:15', '15:15', '18:00', '21:15'] },
  { id: 'v-bhs', name: 'Boulder High School Auditorium', address: '1604 Arapahoe Ave, Boulder', capacity: 900, lat: 40.0139352, lng: -105.2733969,
    area: 'Boulder Creek', use: 'Screenings', role: 'screen', slots: ['08:30', '11:30', '14:45', '18:00', '21:00'] },
  { id: 'v-roe-green', name: 'Roe Green Theatre', address: '1515 Central Campus Mall, CU Boulder', capacity: 412, lat: 40.0081423, lng: -105.2735483,
    area: 'CU Boulder campus', use: 'Screenings', role: 'screen', slots: ['09:00', '12:00', '15:00', '18:00', '21:00'] },
  { id: 'v-muenzinger', name: 'Muenzinger Auditorium', address: 'West of Folsom Field, CU Boulder', capacity: 400, lat: 40.0084316, lng: -105.2689393,
    area: 'CU Boulder campus', use: 'Screenings', role: 'screen', slots: ['08:30', '11:30', '14:30', '17:45', '21:00'] },
  { id: 'v-casey', name: 'Casey Middle School Auditorium', address: '1301 High St, Boulder', capacity: 350, lat: 40.0231916, lng: -105.2796622,
    area: 'North of downtown', use: 'Screenings', role: 'screen', slots: ['09:30', '12:30', '15:30', '18:30', '21:30'] },
  { id: 'v-dairy', name: 'Dairy Arts Center', address: '2590 Walnut St, Boulder', capacity: 244, lat: 40.0192577, lng: -105.2610121,
    area: 'East downtown', use: 'Screenings · New Frontier', role: 'screen', slots: ['09:00', '12:00', '15:00', '18:00', '21:00'],
    rooms: [{ name: 'Gordon Gamm Theater', capacity: 244 }, { name: 'Grace Gamm Theater', capacity: 112 }, { name: 'Boedecker Theater', capacity: 68 }] },
  { id: 'v-etown', name: 'eTown Hall', address: '1535 Spruce St, Boulder', capacity: 220, lat: 40.0201669, lng: -105.275401,
    area: 'Downtown', use: 'Screenings and talks', role: 'screen', slots: ['09:30', '12:30', '15:30', '18:30', '21:30'] },
  { id: 'v-cinemark', name: 'Cinemark Century Boulder', address: '1700 29th St, Boulder', capacity: 220, lat: 40.0172921, lng: -105.2543078,
    area: 'Twenty Ninth Street', use: 'Press & industry and public screenings', role: 'screen', slots: ['11:45', '15:00', '18:15', '21:30'],
    pressIndustry: true, piSlots: ['08:30'], rooms: [{ name: 'Auditorium 1', capacity: 220 }] },
  { id: 'v-canyon', name: 'Canyon Theater', address: '1000 Canyon Blvd (Main Library), Boulder', capacity: 190, lat: 40.0148113, lng: -105.2820182,
    area: 'Civic Area', use: 'Offscreen talks', role: 'hub' },
  { id: 'v-old-main', name: 'Old Main', address: '1600 Pleasant St, CU Boulder', capacity: 250, lat: 40.0092191, lng: -105.2733449,
    area: 'CU Boulder campus', use: 'Offscreen talks', role: 'hub' },
  { id: 'v-rink', name: 'The Rink · Festival HQ', address: '1722 14th St, Boulder', capacity: 150, lat: 40.01534, lng: -105.27608,
    area: 'Downtown', use: 'Festival HQ, industry and press', role: 'industry' },
];

/** The free HOP loop (City of Boulder with RTD and CU) past the venues, in stop order; Chautauqua is served by the temporary CHAT route. */
export const SHUTTLE_LOOP = ['v-etown', 'v-boulder-theater', 'v-casey', 'v-canyon', 'v-rink', 'v-bhs', 'v-old-main', 'v-macky', 'v-roe-green', 'v-muenzinger', 'v-cinemark', 'v-dairy'];

/** Names on the map that aren't streets. */
export const MAP_NOTES: { text: string; lat: number; lng: number; kind: 'water' | 'area' }[] = [
  { text: 'Boulder Creek', lat: 40.01255, lng: -105.27900, kind: 'water' },
  { text: 'CU Boulder', lat: 40.00560, lng: -105.26700, kind: 'area' },
  { text: 'Pearl Street Mall', lat: 40.01860, lng: -105.27950, kind: 'area' },
  { text: 'Chautauqua Park', lat: 39.99600, lng: -105.28250, kind: 'area' },
  { text: 'Twenty Ninth St', lat: 40.01990, lng: -105.25480, kind: 'area' },
];

const R = 6371;
const km = (a: SundanceVenue, b: SundanceVenue) => {
  const dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
/**
 * Door-to-door minutes between venues: walking on Boulder's grid (straight line
 * × 1.3 at 4.8 km/h), or the shuttle when that is quicker (a 7-minute wait
 * plus driving at 18 km/h in festival traffic). Rounded up to 5 minutes.
 */
export function travelMatrix(): TravelMatrix {
  const out: TravelMatrix = {};
  for (const a of VENUES) {
    out[a.id] = {};
    for (const b of VENUES) {
      if (a.id === b.id) { out[a.id][b.id] = 0; continue; }
      const d = km(a, b) * 1.3;
      const walk = (d / 4.8) * 60;
      const ride = 7 + (d / 18) * 60;
      out[a.id][b.id] = Math.max(5, Math.ceil(Math.min(walk, ride) / 5) * 5);
    }
  }
  return out;
}

/**
 * Programme sections for 2027 (the four competitions grow to 12 films each; NEXT, Premieres,
 * Midnight and Family Matinee expand; Legacy has 8 announced restorations, Jan 27–31).
 * Counts beyond the competitions are estimates until the line-up is announced in December.
 */
export const SECTIONS: {
  name: string; count: number; runtime: [number, number]; houses: string[]; guestShare: number; repeats: number; slot?: string[];
  /** Real announced titles (Legacy): no invented guests, screened only on these days. */
  titles?: { title: string; director: string; runtime: number }[]; days?: [number, number];
}[] = [
  { name: 'U.S. Dramatic Competition', count: 12, runtime: [88, 122], houses: ['v-boulder-theater', 'v-macky', 'v-bhs', 'v-etown'], guestShare: 0.95, repeats: 4 },
  { name: 'U.S. Documentary Competition', count: 12, runtime: [82, 112], houses: ['v-etown', 'v-roe-green', 'v-muenzinger', 'v-casey'], guestShare: 0.9, repeats: 4 },
  { name: 'World Cinema Dramatic Competition', count: 12, runtime: [90, 125], houses: ['v-roe-green', 'v-dairy', 'v-bhs'], guestShare: 0.8, repeats: 4 },
  { name: 'World Cinema Documentary Competition', count: 12, runtime: [80, 110], houses: ['v-dairy', 'v-muenzinger', 'v-casey'], guestShare: 0.75, repeats: 4 },
  { name: 'Premieres', count: 24, runtime: [95, 130], houses: ['v-macky', 'v-chautauqua', 'v-boulder-theater'], guestShare: 1, repeats: 3 },
  { name: 'NEXT', count: 10, runtime: [80, 105], houses: ['v-etown', 'v-dairy', 'v-casey', 'v-cinemark'], guestShare: 0.9, repeats: 3 },
  { name: 'Midnight', count: 7, runtime: [84, 100], houses: ['v-boulder-theater', 'v-bhs', 'v-cinemark'], guestShare: 0.8, repeats: 2, slot: ['21:00', '21:15', '21:30'] },
  { name: 'Family Matinee', count: 3, runtime: [80, 95], houses: ['v-chautauqua', 'v-bhs'], guestShare: 0.7, repeats: 2, slot: ['11:30', '12:00', '12:15'] },
  { name: 'Legacy', count: 8, runtime: [0, 0], houses: ['v-boulder-theater', 'v-roe-green', 'v-macky'], guestShare: 0, repeats: 1, days: [7, 11], titles: [
    { title: 'Better Luck Tomorrow', director: 'Justin Lin', runtime: 98 },
    { title: 'Dogtown and Z-Boys', director: 'Stacy Peralta', runtime: 91 },
    { title: "Fool's Fire", director: 'Julie Taymor', runtime: 55 },
    { title: 'Nitrate Kisses', director: 'Barbara Hammer', runtime: 67 },
    { title: 'Real Women Have Curves', director: 'Patricia Cardoso', runtime: 90 },
    { title: 'Swoon', director: 'Tom Kalin', runtime: 82 },
    { title: 'Y tu mamá también', director: 'Alfonso Cuarón', runtime: 106 },
    { title: 'Memento', director: 'Christopher Nolan', runtime: 113 },
  ] },
];

/** Offscreen talks (Cinema Café, The Big Conversation, Power of Story, live podcasts); topics invented. */
export const TALKS = [
  'Cinema Café: Producers on Getting Independent Films Made',
  'The State of the Documentary',
  'The Big Conversation: Who Gets to Make Films Now',
  'Financing Without a Safety Net',
  'Episodic Storytelling Now',
  'Power of Story: Native Voices on Screen',
  'Composers and Sound Designers Roundtable',
  'From Lab to Festival: Developing a Script',
  'Distribution After the Festival',
  'Climate on Screen',
  'Archival Footage and Fair Use',
  'Actors in Conversation',
  'Boulder Welcomes the Festival: A Community Conversation',
  'Live Podcast Recording: The Week in Park City, Now Boulder',
  'International Co-Productions',
  'Short Films, Long Careers',
  'Making a Midnight Movie',
  'Critics in Conversation',
  'Documentary Ethics and Consent',
  'The Craft of Editing',
  'Cinematographers Roundtable',
  'Festival Strategy for New Filmmakers',
  'Youth Media in Colorado',
];

/**
 * The demo's two scripted problems, and when the demo opens.
 * Day 2 (Fri 22 Jan): a key producer can't make it (her flight is cancelled by a
 * nor'easter on the East Coast). Day 3 (Sat 23 Jan): an upslope snowstorm.
 */
export const SCENARIOS = {
  clock: '2027-01-22T08:40',
  producer: {
    name: 'Dana Whitfield', backup: 'Ravi Castellanos', day: 2 as DayNumber,
    film: 'The Weight of Snow', section: 'U.S. Dramatic Competition',
    venue: 'v-boulder-theater', premiereAt: '18:00', talkVenue: 'v-canyon', talkAt: '14:00',
    flight: 'United JFK→DEN, lands Fri 11:52 am (flight number invented)', arrives: '2027-01-22T11:52',
    cause: 'JFK flight cancelled by the nor\'easter',
    why: 'Her flight from New York was cancelled overnight and the first seat out lands Saturday morning, after tonight\'s premiere.',
    lands: '2027-01-23T10:05',
  },
  snow: {
    day: 3 as DayNumber, detail: '6 to 9 in. of upslope snow, from the forecast',
    shuttle: 'Ask RTD to add buses on HOP and CHAT',
    shuttleBody: 'RTD buses run 10 to 30 min late in snow. Ask RTD for extra HOP and CHAT buses from 12:30 pm, staff the Downtown Boulder Station and Broadway & Euclid stops, and keep festival vans on the Chautauqua hill.',
    chautauqua: 'Open Chautauqua\'s doors 15 min early (its line is outdoors)',
  },
  /** The demo attendee and staff member, shown first in the profile switcher. */
  demoPeople: ['Jane', 'Tova Jessop'],
  /** The festival manager who signs in to the organizer view. */
  organizer: 'Tom Whitaker',
  /** Awards are announced Fri Jan 29 (venue not announced; the demo uses Macky). */
  awardsVenue: 'v-macky', awardsDay: 9 as DayNumber,
};

/**
 * What the Ask page and volunteer briefs may quote. Public facts about the 2027 festival,
 * written plainly (sources in data/sundance-2027/README.md). The pass rules are the demo's
 * own model of who may enter what, named after the real 2027 products.
 */
export const SUNDANCE_DOCS: OfficialDoc[] = [
  {
    id: 'doc-access',
    title: 'Passes, tickets and entry',
    sections: [
      { heading: 'Day pass', body: 'In this demo a Day Pass (modelled on a single-day ticket bundle) admits the holder to public screenings and Q&As on the day printed on it. It does not admit to Offscreen talks, industry office hours, press & industry screenings or Awards night.' },
      { heading: 'Single-screening ticket', body: 'A Single Film Ticket ($37) admits one person to the one screening named on it, including any Q&A that follows. Single tickets go on sale January 8, 2027 at 10 a.m. MT.' },
      { heading: 'Festival pass', body: 'In this demo a Festival Pass (modelled on the Full Festival Ticket Package and Express Passes) admits the holder to public screenings, Q&As and Offscreen talks on every festival day, January 21 to 31, 2027. It does not admit to industry office hours, press & industry screenings or Awards night.' },
      { heading: 'VIP pass', body: 'A VIP pass (donor level) admits the holder to public screenings, Q&As, Offscreen talks and Awards night on every day.' },
      { heading: 'Industry badge', body: 'An industry (SIO) credential admits the holder to public screenings, Q&As, talks and industry office hours at the Festival HQ, The Rink. Credentials are picked up at The Rink: Wed Jan 20 2–7 p.m.; Thu Jan 21 to Tue Jan 26 8 a.m.–6 p.m.; Wed Jan 27 to Fri Jan 29 9 a.m.–5 p.m.; Sat Jan 30 9 a.m.–1 p.m. Bring photo ID.' },
      { heading: 'Press badge', body: 'A press credential admits the holder to public screenings, Q&As, talks and press & industry (P&I) screenings at Cinemark Century Boulder, 1700 29th St. P&I screenings run January 21 to 27, with repeats through January 29. P&I screenings have no intros, Q&As or audience voting.' },
      { heading: 'Panelist badge', body: 'A panelist badge admits the holder to all talks, public screenings and Q&As, and to Awards night.' },
      { heading: 'Featured filmmaker badge', body: 'A filmmaker credential admits the holder to all public screenings, Q&As, talks, industry office hours and Awards night.' },
      { heading: 'Volunteer badge', body: 'A volunteer credential admits the holder to the venue of their shift, from 30 minutes before the shift starts until it ends. It is not an audience pass. Volunteers can use film vouchers in the staff and volunteer line or the public waitlist.' },
      { heading: 'Festival staff badge', body: 'A festival staff badge admits the holder to every venue and event.' },
      { heading: 'Extra tickets', body: 'All tickets are digital QR codes in the Sundance Film Festival 2027 app, on the web under My Schedule, or in Apple or Google Wallet. No physical tickets are issued. Single tickets are fully transferable until used; package holders can change a selection up to 4 hours before the screening.' },
      { heading: 'Late entry', body: 'Ticket holders must be in line 15 minutes before the published start time, or admission depends on available seats. Late entry after the start is at theatre staff\'s discretion if space is available.' },
      { heading: 'Capacity', body: 'All seating is general admission, first come first seated; there is no reserved seating. Lines form about 1 hour before showtime and the house opens about 30 minutes before. Groups are seated only when everyone in the party is present.' },
      { heading: 'Waitlist', body: 'The e-Waitlist is joined in the app or on the website, never in person. It opens 2 hours before showtime and closes 30 minutes before. You get a numbered position and may add one companion. Empty seats are sold to the waitlist line at the start of the screening; a card must be on your account.' },
    ],
  },
  {
    id: 'doc-faq',
    title: 'Attendee FAQ',
    sections: [
      { heading: 'Festival dates', body: 'The Sundance Film Festival 2027 runs 11 days, Thursday January 21 to Sunday January 31, 2027, in Boulder, Colorado, its first year in Boulder. World premieres run January 21 to 26; encore screenings run January 22 to 31. Jury and audience awards are announced Friday January 29, and award-winner screenings follow on January 30 and 31.' },
      { heading: 'Box office', body: 'The Information Hub & Box Office is at the Downtown Boulder Visitor Information Center, 1303 Pearl Street. It is open Monday January 18 to Saturday January 30, 8 a.m. to 6 p.m., and Sunday January 31, 8 a.m. to 2 p.m. It is the only place at the festival that accepts cash. Venue box offices open one hour before the first screening of the day.' },
      { heading: 'QR code', body: 'Your tickets are QR codes in the Sundance Film Festival 2027 app under My Tickets & Passes. A ticket admits you to a screening; your separate Festival ID QR code admits you to events such as Offscreen talks.' },
      { heading: 'Accessibility', body: 'Every title has at least one open-captioned screening, and closed-caption devices are available at every other screening. Assistive listening devices are available at all festival theatres. Wheelchair spaces are limited, with three companion seats per space; request them in advance at accessibility@sundance.org or (435) 776-7790. ASL is offered at select talks and Q&As. Service animals only.' },
      { heading: 'Refunds', body: 'All sales are final. If an in-person screening is cancelled because of an act of nature or a technical issue, single-ticket holders get a refund or an exchange. Processing fees are never refunded. Volunteers cannot issue refunds.' },
      { heading: 'Bags', body: 'Bags and jackets are checked at every official venue, and some venues use metal detectors. Luggage and duffel bags are not allowed and cannot be stored at any venue.' },
      { heading: 'Food', body: 'Theatre rules: phones off, no recording, no babies in arms or strollers, and no pets except service animals. Water refill stations are at every venue.' },
      { heading: 'Weather', body: 'Boulder in late January averages a high of about 47°F and a low of about 22°F, with about 12 inches of snow in the month. Sunrise is about 7:15 a.m. and sunset about 5:10 p.m. Dress in layers with a hat, gloves and warm boots. Chautauqua Auditorium has an outdoor line only. Scooters and e-bikes run unless there is more than a foot of snow.' },
      { heading: 'Votes', body: 'Audience voting needs a scanned ticket or pass. Vote in the app with a 4-star rating, once per screening. A reminder arrives 1 hour before the scheduled end of the screening.' },
    ],
  },
  {
    id: 'doc-venues',
    title: 'Venues and getting around',
    sections: [
      { heading: 'Venues', body: 'Screenings: Macky Auditorium (2,036 seats), Chautauqua Auditorium (about 1,300), Boulder Theater (850), Boulder High School Auditorium, Roe Green Theatre (412), Muenzinger Auditorium (400), Casey Middle School Auditorium, the Dairy Arts Center (Gordon Gamm 244, Grace Gamm 112, Boedecker 68), eTown Hall and Cinemark Century Boulder. Offscreen talks: Canyon Theater at the Main Library (190) and Old Main. Festival HQ is The Rink, 1722 14th St. All venues are within about 2 miles.' },
      { heading: 'Shuttle', body: 'Buses between all Boulder venues are free during the festival through the City of Boulder and RTD. HOP loops downtown, CU, University Hill and Twenty Ninth Street from 6 a.m. to 2:30 a.m.; SKIP (Broadway), JUMP (Arapahoe) and BOLT are also free. The temporary CHAT route runs to Chautauqua every 10 minutes from 8 a.m. to midnight. Local buses run every 10 to 15 minutes.' },
      { heading: 'Parking', body: 'There is no public parking at festival venues; park once. In city downtown garages the first 2 hours are free, then $20 flat, on Jan 21–24 and Jan 29–31; other days pay regular rates. CU visitor garages charge $20 a day. RTD Park-n-Rides are free for in-district cars for 24 hours.' },
      { heading: 'Airport', body: 'Boulder is about 45 minutes from Denver International Airport. RTD AB1 runs from DEN to Downtown Boulder Station in about 65 minutes for a $10 Airport Day Pass. The Flatiron Flyer from Denver Union Station takes about 57 minutes and runs until 2 a.m. during the festival.' },
      { heading: 'Bikes and scooters', body: 'The City plans up to 5,000 free shared e-bike passes. Lime scooters and seated gliders are available, with extra stations for the festival. Rideshare pick-up and drop-off areas are designated near each venue.' },
      { heading: 'Walking', body: 'Boulder Theater to eTown Hall is about 3 minutes on foot; downtown to the CU venues about 15 to 20 minutes; the four CU venues are within a 10-minute walk of one another; the Dairy and Cinemark are about 10 minutes apart. Chautauqua is about 30 to 40 minutes uphill from downtown, so take CHAT.' },
    ],
  },
  {
    id: 'doc-volunteer',
    title: 'Volunteer handbook',
    sections: [
      { heading: 'Check-in for shifts', body: 'Clock in and out in the Bloomerang Volunteer app, with the QR code on your credential, or at the kiosk. Arrive 30 minutes before your shift and check in with the house manager at your venue. Volunteer check-in runs January 16 to 31.' },
      { heading: 'Door duty', body: 'Scan every QR code. If the scanner shows red, read the reason aloud and send the person to the box office or info desk. Do not override a red scan; only a house manager can make an exception.' },
      { heading: 'Line management', body: 'Keep the ticket line, the Express line and the e-Waitlist line apart. Ticket holders must be in line 15 minutes before start. At the start time, empty seats go to the waitlist line in number order.' },
      { heading: 'Lost items', body: 'Lost items are held at each venue during the day, then taken to the Festival HQ at The Rink, 1722 14th St.' },
      { heading: 'Emergencies', body: 'In an emergency call 911, then venue security, then the house manager. The trauma centre is Boulder Community Health Foothills Hospital, 4747 Arapahoe Ave. Do not post about incidents on social media.' },
      { heading: 'Shift swaps', body: 'Shift changes go through the volunteer team; the drop deadline was January 3, 2027. Contact volunteers@sundance.org or (435) 776-7870.' },
    ],
  },
];
