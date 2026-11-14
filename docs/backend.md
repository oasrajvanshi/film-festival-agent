# Operations backend: snow and a late key guest

The backend handles two scenarios only, on the team's mock festival (Harbor Lights, from the Google Sheet):

1. **Snow (weather change).** A forecast over the snow line: weather notice to pass and ticket holders, an extra bus if the shuttle is late or full, briefs for door teams and drivers, and a re-check of every guest still travelling.
2. **A key guest is late.** A flight, a car or an email says a speaker will miss their call: brief a backup, move a car earlier, start with the backup, delay the session, or let the guest join by video.

The model (Ollama, local `qwen3:8b` by default) reads messages and drives the tool calls. Rules compute every number and every option. A person approves anything that leaves the team.

## Architecture

```
 feeds and inbox                 router                      specialist agents (tool calling)          engine
 ───────────────                 ──────                      ────────────────────────────────          ──────
 weather feed      ─┐                                  ┌──▶ weather desk  get_forecast                 policy gate
 shuttle feed      ─┤   typed event: rules  ──────────┤                  get_shuttle_status            (auto / needs a person)
 flight feed       ─┼─▶ free text: model classifies ──┤                  list_sessions                     │
 guest check-in    ─┤   (JSON schema), server checks  │                  plan_weather_options              ▼
 inbound email/SMS ─┤   the quote and reads the time  │                  submit_decision            decisions (state machine)
 timers (re-check) ─┘                                  │                                            deadline timers, versions
                         snow ─▶ weather desk          └──▶ talent desk   get_guest                         │
                              + re-check travelling              (late    get_flight_status                 ▼
                                guests (fan-out)                  guest)  estimate_guest_eta         executor (idempotent)
                         unknown sender ─▶ a person                       find_backups               outbox, briefs, flags,
                                                                          check_delay_impact         schedule overrides
                                                                          plan_guest_options                │
                                                                          submit_decision                   ▼
                                                                                                     messaging adapters
                                                                                                     (mock, Slack)
```

### The loop for one agent

1. The model gets a short brief (time, trigger, any reported fact with its quote) and only its own tools.
2. It calls tools. Each call is checked against the tool's JSON schema; a bad call, an unknown tool or a reason with a time or number that is not in any tool result goes back to the model as an error, and the model corrects itself.
3. The **plan tool** runs the playbook (rules) and returns the decisions to make, each with costed options (people affected, messages, money, reversible) and the rule recommendation.
4. The model calls `submit_decision` once per decision: the option it recommends and one or two sentences why. It may disagree with the rules; both picks are stored and shown.
5. Whatever the model leaves undone is finished by rules. If Ollama is down, the whole run uses rules. A decision always exists either way.

### What the model does, and what it does not

| The model | Rules (code) |
|---|---|
| Classifies inbound email and SMS into a fixed schema and copies the words that give a time | Checks the quote is really in the message and reads the time itself |
| Chooses which tools to call and in what order | Every ETA, travel time, shuttle load, deadline and option |
| Recommends one option per decision, with a reason grounded in tool results | Which actions run on their own and which need a person |
| | All outbound text (templates in `engine/templates.ts`) and all recipients (only IDs from the sheets) |

There is no "send" tool. The model cannot message anyone.

### Safety rules (`engine/policy.ts`, fixed code)

- **Runs on its own:** dashboard flags, briefs to volunteers on shift, heads-ups to staff, re-check timers.
- **Needs a person:** messages to guests or assistants, messages to the audience, schedule changes, vendor orders.
- **Deadlines:** if nobody answers, only an option that is internal and reversible may run (for example "skip the extra bus and watch the load", "hold the notice"). Otherwise nothing runs and Operations is paged. A mass message never runs by default.
- **Who decides:** festival staff of the owning team, or Operations and the director. Volunteers cannot approve.
- **Each step runs once:** every executed step has an idempotency key; a repeated trigger is ignored; two people deciding at once are serialized by a version number (the second gets 409).
- **Untrusted text:** inbound messages from unknown senders go to a person. From known senders, only a time and its quote reach the guest agent, never the message text. The fact is shown on the decision and marked confirmed when a person approves.

## Run it

```bash
npm install
ollama pull qwen3:8b
npm run ops -- snow            # rules only, deterministic
npm run ops -- guest-late --llm  # Ollama drives the tools
npm run ops:llm                # both scenarios with Ollama
npm run test:backend           # backend tests (the model is faked)
npm run ops:sync               # refresh data/harbor-lights from the Google Sheet
npm run dev                    # API on http://localhost:3000/api/ops
```

On an M2 Max, one agent run with `qwen3:8b` takes about 9 to 12 seconds; both scenarios run in about 70 seconds.

### Environment

| Variable | Default | |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | `https://ollama.com` for Ollama Cloud (then set `OLLAMA_API_KEY`) |
| `OLLAMA_MODEL` | `qwen3:8b` | Any Ollama model with tool calling (`ollama show <model>` lists `tools`) |
| `OLLAMA_THINK` | off | `on` lets thinking models think before tool calls (slower) |
| `OPS_LLM` | on | `off` runs everything on rules |
| `OPS_SHEET_ID` | none | Read the Google Sheet live instead of the snapshot |
| `OPS_DATA_DIR` | `data/harbor-lights` | Snapshot of the sheet, one CSV per tab |
| `OPS_EXTRAS_DIR` | `data/scenario-extras` | Scenario tabs the sheet does not have yet |
| `OPS_STORE` | `.data/ops-state.json` | Durable state (decisions, timers, outbox, audit) |
| `OPS_WEATHER` | mock | `open-meteo` for the live forecast (today's weather replayed on the festival day) |
| `FLIGHTAWARE_API_KEY` | none | Live flight status (AeroAPI); untested without a key |
| `SLACK_WEBHOOK_URL` | none | Staff heads-ups to Slack; guest SMS and attendee push stay mocked |

## HTTP API (`app/api/ops`)

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/ops/health` | | Data source, sheet warnings, counts, model and Ollama status |
| `GET /api/ops/state` | `?full=1` for everything | Clock, decisions, flags, outbox, briefs, review queue, timers, audit |
| `POST /api/ops/events` | `{ day, at: "14:58", trigger: {...} }` or a full trigger | Run reports: routes, agents and tool calls, decisions |
| `GET /api/ops/decisions` | `?status=open` | Decisions with options, costs, rule and model picks |
| `POST /api/ops/decisions/:id` | `{ action: "approve", option: "A", by: "p-005", version: 1 }` | The decision; 409 if it changed, 403 if `by` cannot decide |
| `POST /api/ops/tick` | `{ at? }` | Fires due deadlines and re-checks (point a cron here) |
| `POST /api/ops/reset` | `{ at? }` | Clears live state for a fresh demo |
| `POST /api/ops/reload` | | Re-reads the sheets |
| `POST /api/ops/scenarios/:name` | | Resets and replays `data/scenarios/<name>.json` |

Trigger types: `weather_update`, `weather_poll`, `shuttle_update`, `flight_update`, `guest_checkin`, `inbound_message`. Examples are in the scenario files.

## Scenario files

```jsonc
{
  "name": "guest-late", "title": "...", "description": "...",
  "day": 1,                      // festival day; all times below are on it
  "start": "14:25",
  "setup": { "forecast": {...}, "shuttleDelays": {...}, "checkIns": [...] },   // seeded, not routed
  "steps": [
    { "at": "14:58", "note": "...", "trigger": { "type": "inbound_message", "channel": "email", "from": "...", "text": "..." } },
    { "at": "15:10", "decide": { "key": "guest:p-073:e-056", "option": "A", "by": "p-005" } },
    { "at": "15:11", "decide": { "key": "guest:p-073:e-056", "option": "B", "by": "p-002", "stale": true, "expect": "conflict" } },
    { "at": "15:50", "tick": true }
  ],
  "expect": [ { "type": "decision", "key": "guest:p-073", "status": "executed", "rule": "A", "label": "..." } ]
}
```

Expectation types: `decision`, `decision_count`, `outbox` (by template or kind, `count`, `max`, `notBefore`), `flag`, `review`, `step`.

## Code map (`src/backend`)

| Folder | What |
|---|---|
| `data/` | CSV reader, Google Sheet and folder loaders, workbook to domain model with checks |
| `domain/` | Types, time helpers, `FestivalView` (the sheets plus approved changes) |
| `model/` | Snow summary and travel factors, guest ETA and backups, shuttle load |
| `playbooks/` | The two playbooks: decisions with costed options, automatic steps, parked items |
| `agents/` | Tools, the tool-calling loop, the two agent specs, the inbound reader, the router |
| `engine/` | Policy gate, templates, decision state machine, executor, store, audit log |
| `integrations/` | Weather (Open-Meteo), flights (AeroAPI), messaging (mock, Slack) |
| `llm/` | Ollama client (tools, JSON schema output) and a scripted fake for tests |
| `service.ts` | `OpsBackend`: ingest, decide, tick; serializes every call |
| `scenarios.ts` | Scenario runner and checks |

## Known limits

- The store is one JSON file. Fine for a demo and a single server; use a database behind the `Store` interface before deploying to a serverless host.
- Travel factors in snow (x1.45 likely, x2.1 worst for moderate snow) are assumptions, not measured.
- Audience numbers come from the mock's saved plans (77 attendees), so loads and counts are small.
- FlightAware and Slack adapters are written to their public APIs but were not run against a real account.
