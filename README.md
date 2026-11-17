# Usher

*Usher your festival with ease.* Group Blue · Oas, Sienna, David, Henry

Usher helps a film festival team manage every unexpected change. It tracks the schedule, guests, passes and volunteer shifts; when something changes (a late print, a delayed guest, snow), it works out who is affected, suggests a new plan, and tells each person what to do. Staff approve anything sent publicly.

**Live:** https://film-festival-agent.vercel.app

## The problem

Schedule changes are relayed by hand across spreadsheets, emails and group chats, so updates arrive late or reach the wrong people. Volunteers work from outdated briefs, guests get double-booked, and staff spend the day relaying information.

## Tutorial: a festival day in ten minutes

1. **Open the site** and press **Try the live demo**. On the welcome screen choose **Or try a sample festival**: the **Sundance Film Festival 2027** in Boulder, Colorado, January 21 to 31, 2027 (11 days, 13 real venues, 100 films, 559 events, 386 made-up people). The venues, dates, buses and rules are the festival's public plan; see [`data/sundance-2027/`](data/sundance-2027/README.md).
2. **Sign in.** Pick a profile: Organizer, Staff, Guest, Attendee or Vendor. Type any access code and press **Open my profile** (in the demo any code works; real codes are on the **Access codes** page). You can also ask for a code by email.
3. **Overview (organizer).** Pick a day from the strip of date cards (the demo opens on Friday, January 22). The **Calendar | Map** switch shows the day as a venue calendar or as the venues on a street map of Boulder; click a venue on the map for its agenda. **Light** in the top bar switches the tool to light mode.
4. **Bring in the problems.** Press **Bring on the problems** at the bottom left. Two alerts appear:
   - **Day 2, Fri Jan 22:** producer Dana Whitfield can't make it (her flight from New York is cancelled by a nor'easter); she was due at a 2:00 pm talk and her film's 6:00 pm premiere.
   - **Day 3, Sat Jan 23:** snow from 1:00 to 7:00 pm, 6 to 9 inches of upslope snow.
5. **Open a recommendation.** Press **Agent's recommendation** on an alert. The calendar previews the new plan: moved events slide to their new time (old time crossed out), a stand-in shows as avatars changing places, a video guest as a camera, and released seats lift off the card. On the **Map**, every venue with a change opens its own small window on the map, joined to its pin, playing the same moves. The checklist sits on the left (on a computer it is always open). Untick anything you don't want; **Approve** appears once the preview has played.
6. **Approve.** The events move, the right people are messaged, and the alert clears. **Original plan** above the calendar shows the schedule as it was. With two or more problems open, **Fix them all** gives one combined recommendation.
7. **See it from the other side.** On **Access codes**, view the festival as any person, or sign in as an Attendee (the sample attendee is Jane: Dana's talk and premiere on Friday, a trip across town in Saturday's snow). **Plan** lists the day one row per event: moved times show the old time crossed out, the walk between venues says when to leave, an overlap asks which one to keep, a cancellation offers a swap, and a storm on the way asks whether to keep the next screening or stay put. **Map** shows the route, **Updates** holds only messages about your plan, and the initials at the top open the pass. On a shared festival the alerts and the approved plan reach every phone.
8. **Live phones.** Approve a recommendation and it reaches the phones at once: a push banner, the latest update on top of the Plan, and the changed rows (new times, "Ravi Castellanos replaces Dana"). The presentation's Live demo slide (`/deck`, slide 7) shows Tom's dashboard beside Jane's phone. The **Light** switch changes every screen together.
9. **Approvals.** Anything waiting for a person (messages to attendees, guests or partners, public listings) and every flag (guest clashes, double-booked rooms, uncovered shifts) is here.
10. **Start again.** Settings (gear, top right) → **Reset demo**.

Everyone except the organizer uses Usher on a phone; on a computer their app opens in a phone frame. The organizer can switch with **Phone view** in the top bar.

## The organizer's pages

| Page | What it's for |
|---|---|
| Overview | The day in numbers (tickets, screenings, check-ins, guests on stage), problems and their recommendations, and the venues as a calendar or a map. Click an event for its details: who is on stage and whether they're here, seats, plans, crew, and edits (time, venue, guests, cancel) that run the agent |
| Approvals | Flags and anything waiting for approval |
| Log | Everything the agent did, live: what it saw, worked out, decided, did or asked, and who approved; plus every message sent |
| Ask | Questions answered from the festival's own documents, or "I don't know" |
| Volunteer briefs | Each volunteer's live brief, rebuilt from the current schedule |
| Live feeds | Weather, guest flights, print deliveries and vendor feeds |
| Access codes | Every person's code; view the app as them |

People's apps: **Attendee** (agenda, updates, pass, ask), **Guest** (appearances and updates), **Staff** (shift, live brief, door scan), **Vendor** (deliveries and changes).

## Setting up your own festival

**Set up a festival** on the welcome screen takes three steps:

1. **Festival and data.** Name, dates and city, then drop in your files or a Google Sheet link (schedule, venues, films, people, tickets, saved events, volunteer shifts, FAQ). Use **Use sample festival files** to see the expected format; the files are in `public/samples/`.
2. **Check.** The whole festival as one small calendar, the counts, and anything that must be fixed.
3. **Team.** Who approves, and how people are reached.

A Google Sheet must be shared as "anyone with the link can view". Usher re-reads it and runs the agent on what changed.

## How the agent decides

Every run: **trigger** (schedule edit, feed alert, scan, question) → **understand** (who is affected) → **decide** (move, swap, message, flag) → **act or ask** → **log**.

- A fixed rule (`src/agent/approvals.ts`), not the model, decides what needs a person: messages to attendees, guests or partners, public listings and announcements always wait for approval; internal briefs and staff heads-ups go straight out.
- Recommendations are computed from the schedule, travel times, passes and each person's plan. The language model only rephrases messages, and a rewrite is discarded if it changes any time, title or number.
- The sample festival is Sundance 2027's public plan with made-up people (`@example.test`) and made-up film titles (the line-up is announced in December), except the 8 announced Legacy titles. A small fixed festival (Harbor Lights, `src/data/seed.ts`) is kept for the unit tests and the evaluation.

## Run it

```
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests and the evaluation scenarios
npm run eval       # readable evaluation report
npm run typecheck
```

Without any settings Usher runs in **local mode**: each browser keeps its own copy of the festival. Add shared storage to put one festival on the server for the whole team.

## Settings (Vercel → Project → Environment Variables)

| Variable | What it turns on |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) | Shared mode: one festival on the server, join links, sign-in codes, push alerts |
| `GROQ_API_KEY` (`GROQ_MODEL`) or `OLLAMA_API_KEY` (`OLLAMA_HOST`, `OLLAMA_MODEL`) | The language model for phrasing and Ask. Optional; everything else works without it |
| `RESEND_API_KEY`, `RESEND_FROM`, `USHER_TEST_EMAIL` | Emailing access codes and updates (test mode sends to `USHER_TEST_EMAIL`) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `USHER_TEST_PHONE` | Text messages |
| `FLIGHT_API_KEY` or `AVIATIONSTACK_KEY` | Live flight status on Live feeds |
| `FESTIVAL_SHEET_ID` | A default Google Sheet |

Weather uses Open-Meteo and needs no key. Never commit keys.

## Evaluation

`npm run eval` runs the proposal's four tests on a scripted festival day:

| Test | Pass mark |
|---|---|
| 5 schedule changes reach the right people | All 5, none to the wrong person |
| 3 planted guest clashes are flagged | 3 of 3 |
| 20 QR scans across pass types | 20 of 20 correct |
| 10 questions about the festival | 10 of 10 from official documents, or "I don't know" |

## Where things are

```
app/            the site (/), onboarding, the app (/app) and API routes (/app/api)
app/ui/         screens: Overview (numbers, calendar, map, event details), recommendations, Log, people's apps, live push
src/agent/      the agent: propagation, recommendations, weather, clashes, briefs, approvals, log
src/access/     profiles and access codes
src/rules/      pass and badge rules, QR codes
src/data/       the Sundance 2027 demo (sundance2027.ts facts, sundance.ts generator, boulder-map.ts streets from OpenStreetMap), the test festival, Google Sheet reading
data/sundance-2027/  the public research with sources, and the demo as CSVs
src/onboard/    reading uploaded files and sheets
src/server/     shared storage, sessions, email, SMS and push
tests/          unit tests and evaluation scenarios
public/samples/ sample festival files
```
