# Film Festival Agent

Group Blue · Oas, Sienna, David, Henry

## Problem statement

Film festival schedule changes are relayed by hand across emails, sheets and chats, so updates arrive late or reach the wrong people. Volunteers work from outdated briefs, guests get double-booked, and staff spend the day relaying information. The Film Festival Agent tracks the schedule, notifies and gives recommendation to everyone affected. It flags clashes and checks access, with staff approving anything sent publicly.

## What it does

| Pain point (proposal) | What the agent does | Human stays in charge of |
|---|---|---|
| Changes don't propagate | Diffs each schedule-grid edit, finds exactly who is affected (ticket holders, people who saved it, guests, volunteers on shift, the right staff) and drafts **one bundle** of updates. Each person gets a **recommendation**, not just a notice. | Approving anything sent outside the team |
| Slow door checks | Access rules for all 10 pass and badge types encoded once; a QR scan returns green or red with a reason | Overrides and exceptions |
| Pass vs. ticket | Every pass and extra ticket is linked to one person and one QR code | Refunds and disputes |
| Misinformed volunteers | Live brief by role and venue, rebuilt from the current grid; answers from official documents only, or "I don't know" | Shift changes and final rosters |
| Guest conflicts | Flags guest clashes, counting travel time between venues; also double-booked rooms and Q&As left behind when a screening moves | Resolving the conflict |
| No crowd view | Live venue view from check-in scans, with suggestions where to redirect people | Crowd and safety decisions |
| Unverified votes (post-MVP) | Voting form only to people who checked in | Award results |
| Outside failures | Reads vendor feeds (flight delays, print delays, cancellations), flags what's at risk, drafts contingency messages | Sending them |

### Recommendations

Recommendations are computed from the grid, travel times, the person's pass and their own itinerary, never by the model. Examples:

- *"Silver Water moves to Riverside Studio. Head to Riverside Studio instead and arrive by 12:20 pm."*
- *"Open Gods now starts at 1:30 pm. It now runs into "Quiet Animals" at 3:00 pm. Choose which one to keep, or swap it for one that fits. Options: …"*
- *"Late Country is cancelled. Pick another event in the same window that fits your day. Options: "Wild Tide" at Riverside Studio, 3:00 pm; …"*
- Volunteers: *"Redirect arrivals to Riverside Studio; the free shuttle runs every 20 minutes."*

## The agent loop

Every run follows five steps: **Trigger** (grid edit, QR scan, question, vendor alert) → **Understand** (reads the relevant records and official documents) → **Decide** (answer, allow/deny, flag, draft, escalate) → **Act or ask** (public or outbound actions wait in the approval queue) → **Log** (every input, tool call, output and approval).

### Approval gate

A fixed rule in [`src/agent/approvals.ts`](src/agent/approvals.ts), not the model's judgment:

| Runs on its own | Needs a person's approval |
|---|---|
| Update volunteer briefs, heads-up to staff, dashboard flags | Messages to attendees, guests or partners; website listing; public announcements; roster changes; voting forms; vendor contingency messages |

## Guardrails

- **Retrieves, never creates.** Synopses, bios and policies come from loaded documents. The model can only rephrase drafted messages, and a rewrite is thrown away if it drops or changes any time, title or number ([`src/agent/phrase.ts`](src/agent/phrase.ts)).
- **No new hardware.** QR codes live in the app; ticketing data is read only.
- **Privacy.** The prototype uses only made-up people (`@example.test`). Attendees opt in to crowd tracking.

## Language model

The model step uses **Ollama** (Ollama Cloud by default). It is optional: without a key everything runs deterministically, which is what the tests use.

| Variable | Default | |
|---|---|---|
| `OLLAMA_API_KEY` | none | Your Ollama Cloud key. Set it in Vercel or a local `.env`; never commit it. |
| `OLLAMA_MODEL` | `gpt-oss:120b` | Any Ollama chat model |
| `OLLAMA_HOST` | `https://ollama.com` | Use `http://localhost:11434` for a local Ollama |

The model is used for: phrasing outbound messages (fact-checked), and answering questions from retrieved document sections with citations (or "I don't know").

## The mock festival

*Harbor Lights Film Festival*, April 15–17, 2027 (made up): 40 films, 4 venues, 3 days, 10 pass types, 15 guests, 10 panels, 60 volunteers. Generated deterministically in [`src/data/seed.ts`](src/data/seed.ts); official documents in [`src/data/docs.ts`](src/data/docs.ts).

Pass types, modeled on the Tribeca badge: Day pass, Single-screening ticket, 3-day pass, VIP; badges Industry, Press, Panelist, Featured filmmaker, Volunteer staffer, Festival staff.

## Evaluation

The proposal's four tests on a scripted festival day, each with a pass mark:

```
npm run eval
```

| Test | Pass mark |
|---|---|
| 5 schedule changes: the right people get each update | All 5, none to the wrong person |
| 3 planted guest clashes: each clash is flagged | 3 of 3 |
| 20 QR scans across pass types: each allow or deny is correct | 20 of 20 |
| 10 questions about the festival: from official documents, or "I don't know" | 10 of 10 |

`npm run eval -- --llm` runs the question test through Ollama when `OLLAMA_API_KEY` is set.

## Festival data (Google Sheet)

The festival lives in a Google Sheet that staff edit, one tab per table: Festival (name and dates), Schedule grid, Venues, Travel times, Films, People, Passes, Tickets, Saved events, Volunteer shifts and Official documents. A *Read me* tab explains the columns and allowed values.

- The dashboard's **Data** tab loads the sheet. **Check sheet for changes** diffs the Schedule grid against what's loaded and runs the agent on the changes, so the right people get updates and recommendations.
- The sheet must be shared as **anyone with the link can view**; the server exports each tab as CSV by its fixed tab ID (`src/data/sheet.ts`). Don't delete and recreate a tab, or its ID changes.
- Every row is checked: unknown venue, person, event or film IDs, bad times or days are listed by tab and row, and nothing loads until they're fixed.
- `FESTIVAL_SHEET_ID` (optional env var) sets the default sheet for the server; otherwise the link in the Data tab is used.
- `npx tsx scripts/export-tables.ts out.json` exports the built-in mock festival in the sheet's format.

## Management dashboard

A Next.js app (the proposal's first demo). The agent runs in the browser and keeps demo state in localStorage, so no database is needed; model calls go through `/api/llm` so the key stays on the server.

Tabs: **Overview** (crowd view, flags, recent changes) · **Schedule grid** (edit times, venues, guests, cancel; save runs the agent) · **Approvals** (each person's message and recommendation, with the reasons) · **Door scan** (green/red for any pass, door-rush simulator) · **Volunteer briefs** · **Ask** · **Feeds & voting** (flight and print delays, audience-award form) · **Log** (audit log and delivered messages) · **Evaluation** (runs the four tests).

The festival clock in the header sets "now" for scans, briefs and the crowd view. *Reset demo* restores the original festival.

```
npm run dev       # http://localhost:3000
```

### Deploy on Vercel

Import the repo in Vercel (framework: Next.js, no settings needed), then add `OLLAMA_API_KEY` under Project → Settings → Environment Variables and redeploy. Without it the dashboard works with the model switched off.

## Develop

```
npm install
npm test          # unit tests + the four evaluation tests
npm run eval      # readable evaluation report
npm run typecheck
```

## Layout

```
src/core      types and time helpers
src/data      mock festival + official documents
src/rules     pass and badge access rules, QR codes
src/agent     agent loop, propagation, recommendations, clashes, briefs, Q&A, crowd, vendors, voting, approvals, log
src/llm       Ollama client
src/eval      the four evaluation scenarios
```

## Roadmap

1. ✅ Data and rules
2. ✅ Propagate and answer
3. ✅ Conflicts and approvals
4. ✅ Check-in and feedback (core logic)
5. ✅ Management dashboard (Next.js): grid editor, approval queue, scan simulator, crowd view, log
6. ✅ Google Sheets as the data source (read; the dashboard grid does not write back)
7. Festival app: mobile web with QR, volunteer mode and guest mode
