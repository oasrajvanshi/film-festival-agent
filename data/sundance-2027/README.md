# Sundance Film Festival 2027 (Boulder): the live demo's data

The live demo runs on the real plan for the **Sundance Film Festival 2027**, its first year in Boulder, Colorado: **11 days, Thursday January 21 to Sunday January 31, 2027**.

- **`public-facts.md`** — everything public we could find (researched 16–17 Nov 2026), each fact with its source URL: dates and key deadlines, Festival HQ and box office, ticket products and rules, all venues with official map coordinates and seat counts, free buses (HOP, SKIP, JUMP, CHAT, BOLT), DEN airport and Denver links, parking rates and garages, e-bikes and scooters, attendance and lodging, January weather and storm risks, programme sections, awards, screening rhythm, volunteers, accessibility, security and the people who run it. Anything not yet published is marked **UNCONFIRMED** or **PRECEDENT (2026 Park City)**.
- **`csv/`** — the demo festival as one CSV per Google Sheet tab. Regenerate with `npx tsx scripts/export-csv.ts`.
- The code that builds it: `src/data/sundance2027.ts` (the public facts as data) and `src/data/sundance.ts` (the generator).

## What is real and what is made up

| Real (public) | Made up |
|---|---|
| Dates, day structure (premieres Jan 21–26, encores Jan 22–31, awards Fri Jan 29, award-winner screenings Jan 30–31) | Every person: attendees, filmmakers, panelists, volunteers, staff (`@example.test` emails) |
| The 13 venues: names, addresses, map coordinates, seats (three seat counts unconfirmed) | Film titles and directors, except the 8 announced Legacy restorations |
| Sections and competition sizes (four competitions of 12) | Exact screening times (the 2027 schedule comes out in December; times follow the 2026 rhythm: flagship houses every ~3¼ hours, others ~3 hours, 8:30 a.m. to ~9:30 p.m.) |
| Press & industry screenings at Cinemark Century, mornings | Talk topics (formats are the real Offscreen ones: Cinema Café, The Big Conversation, Power of Story, live podcasts) |
| Free buses, airport times, parking rules, weather normals, ticket and waitlist rules (quoted on the Ask page and in volunteer briefs) | Walking times are computed from the coordinates (grid × 1.3 at 4.8 km/h, or the bus when quicker) |
| The 8 Legacy titles, screened Jan 27–31 | Awards night venue (not announced; the demo uses Macky Auditorium) |

Choices made where the public plan is silent: there is no Filmmaker Lodge for 2027, so the demo has none; the Festival Gala on Fri Jan 22 has no announced venue, so it is left out; Midnight films play at 9:00–9:30 p.m. rather than 11:55 p.m. so that every event ends the same day.

## The demo's two problems

Press **Bring on the problems** (bottom left of Overview). The demo clock opens on **Day 2, Friday January 22, 8:40 a.m.**

1. **Day 2 · Fri Jan 22 — a key producer can't make it.** Dana Whitfield (made up), producer of *The Weight of Snow* (U.S. Dramatic Competition, made up), is stuck in New York: her United flight to DEN is cancelled by a nor'easter and the first seat out lands Saturday 10:05 a.m. She was due at a 2:00 p.m. Cinema Café talk at the Canyon Theater and her film's 6:00 p.m. world premiere and Q&A at the Boulder Theater. Usher recommends:
   - her co-producer Ravi Castellanos, already in Boulder, takes her seat at the talk;
   - she joins the premiere Q&A by video (AV test an hour before);
   - her 4 held seats go to the e-Waitlist;
   - the panelists, the moderator and staff are told, and her airport car is moved to Saturday.
2. **Day 3 · Sat Jan 23 — snow, 1:00 to 7:00 p.m.** An upslope storm, 6 to 9 inches: the classic Front Range January storm (see Weather in `public-facts.md`). The first Saturday is the busiest day of the festival. Usher recommends:
   - start every event in the window 20 minutes later (RTD buses run 10–30 min late in snow);
   - send everyone with a ticket or saved plan their new time;
   - ask RTD to add buses on HOP and CHAT (Chautauqua's only access is one uphill road);
   - open Chautauqua's doors 15 minutes early, since its line is outdoors with no indoor waiting;
   - brief staff and volunteers on shift.

In the attendee app, Jane (made up) has Dana's talk and premiere on Friday and a trip across town in the snow on Saturday.
