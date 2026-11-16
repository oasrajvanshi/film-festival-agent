# Usher

*Usher your festival with ease.* Group Blue · Oas, Sienna, David, Henry

Usher helps a film festival team manage every unexpected change. It tracks the schedule, guests, passes and volunteer shifts; when something changes (a late print, a delayed guest, snow), it works out who is affected, suggests a new plan, and tells each person what to do. Staff approve anything sent publicly.

**Live:** https://film-festival-agent.vercel.app

## The problem

Schedule changes are relayed by hand across spreadsheets, emails and group chats, so updates arrive late or reach the wrong people. Volunteers work from outdated briefs, guests get double-booked, and staff spend the day relaying information.

## Tutorial: a festival day in ten minutes

1. **Open the site** and press **Try the live demo**. On the welcome screen choose **Or try a sample festival** (Harbor Lights, April 15 to 17, 2027: 40 films, 4 venues, 162 people).
2. **Sign in.** Pick a profile: Organizer, Staff, Guest, Attendee or Vendor. Type any access code and press **Open my profile** (in the demo any code works; real codes are on the **Access codes** page). You can also ask for a code by email.
3. **Overview (organizer).** The banner shows the festival; the calendar below shows each venue's day. Switch days with the small **Day 1 / 2 / 3** tabs.
4. **Bring in the problems.** Press **Bring on the problems** at the bottom left. Three alerts appear and the banner reads "3 problems need you":
   - Pavel Kettering is running late for his 4:00 panel.
   - Thunderstorms from 3:00 to 6:00 pm on Day 1.
   - Snow from 1:00 to 7:00 pm on Day 2.
5. **Open a recommendation.** Press **Agent's recommendation** on an alert. The calendar previews the new plan: moved events slide to their new time (old time crossed out), and a swapped guest shows as avatars changing places. The recommendation sits on the left: one sentence on what happened, then a checklist. Untick anything you don't want; **Approve** appears once the preview has played.
6. **Approve.** The events move, the right people are messaged, and the alert clears. **Original plan** above the calendar shows the schedule as it was. With two or more problems open, **Handle all at once** gives one combined recommendation.
7. **See it from the other side.** On **Access codes**, view the festival as any person, or sign in as an Attendee (the sample attendee is Mira Galloway). **Plan** lists the day one row per event: moved times show the old time crossed out, the walk between venues says when to leave, an overlap asks which one to keep, a cancellation offers a swap, and a storm on the way asks whether to keep the next screening or stay put. **Map** shows the route, **Updates** holds only messages about your plan, and the initials at the top open the pass. On a shared festival the alerts and the approved plan reach every phone.
8. **Who's here.** Each venue is drawn as a small building whose floors light up as expected people are scanned in. Late guests show on their venue. Click a venue to filter the list; use **Scan people in** at the door and **Download list** for the day.
9. **Approvals.** Anything waiting for a person (messages to attendees, guests or partners, public listings) and every flag (guest clashes, double-booked rooms, uncovered shifts) is here.
10. **Start again.** Settings (gear, top right) → **Reset demo**.

Everyone except the organizer uses Usher on a phone; on a computer their app opens in a phone frame. The organizer can switch with **Phone view** in the top bar.

## The organizer's pages

| Page | What it's for |
|---|---|
| Overview | Problems the agent has raised, their recommendations, and the venue calendar |
| Approvals | Flags and anything waiting for approval |
| Who's here | Arrivals by venue, door scanning, the day's list |
| Schedule | Edit times, venues and guests like the sheet; saving runs the agent and shows recent changes |
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
- The sample festival uses made-up people (`@example.test`).

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
app/ui/         screens: Overview, recommendations, calendar, Who's here, people's apps
src/agent/      the agent: propagation, recommendations, weather, clashes, briefs, approvals, log
src/access/     profiles and access codes
src/rules/      pass and badge rules, QR codes
src/data/       the sample festival and Google Sheet reading
src/onboard/    reading uploaded files and sheets
src/server/     shared storage, sessions, email, SMS and push
tests/          unit tests and evaluation scenarios
public/samples/ sample festival files
```
