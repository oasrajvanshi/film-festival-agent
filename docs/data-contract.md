# Data contract: the mock sheet and the scenario tabs

The backend reads the team workbook **"Harbor Lights Film Festival – mock data"** as it is. Nothing in the existing tabs has to change. The two scenarios (snow, a late key guest) need a few facts the workbook does not have yet: flights, call times, places outside the venues, and shuttles. They live in six **optional** tabs. Until they are added to the Google Sheet, the backend reads them from `data/scenario-extras/` in this repo.

To move them into the sheet: add a tab with the exact name below, paste the CSV from `data/scenario-extras/<file>`, and run `npm run ops:sync` (or `POST /api/ops/reload`). A tab in the sheet always wins over the local file.

## Tabs the backend reads from the workbook

| Tab | Used for |
|---|---|
| Festival | Name and the date of each day (`Day 1 date` ...) |
| Schedule grid | Every event: day, start, end, type, venue, Guest IDs, status. Guest IDs are the speakers |
| Venues | Names and capacity |
| Travel times | Minutes between venues (the matrix) |
| People | Guests, festival staff (Staff role = team: `comms`, `operations`, `guest_relations`, `house_manager`, `director`) and volunteers (`door`, `projection`, ...) |
| Passes | Badge of each guest (`panelist`, `featured_filmmaker`) and valid days of each attendee |
| Tickets, Saved events | Who has which event in their plan: audience counts and shuttle riders |
| Volunteer shifts | Which volunteers are at which venue, so briefs reach the people on shift |

Who can approve: festival staff can decide for their own team (Comms decides the weather notice, Guest relations decides guest changes); `operations` and `director` can decide anything. Volunteers cannot approve.

## Scenario tabs (optional)

Times are 24-hour text like `14:30`, on the given festival day. IDs must exist in the workbook.

### Scenario settings
Same format as the Festival tab. Location is for live weather (Open-Meteo); the threshold starts the snow playbook.

| Setting | Value |
|---|---|
| Timezone | America/New_York |
| Latitude | 43.66 |
| Longitude | -70.25 |
| Snow threshold (in) | 2 |

### Places
Places that are not venues, with minutes to each venue (one column per Venue ID).

| Place ID | Name | Kind | v-harbor | v-canal | v-pier9 | v-river |
|---|---|---|---|---|---|---|
| pl-airport | Harbor Lights Airport | airport | 35 | 40 | 30 | 45 |
| pl-hotel | Festival Hotel | hotel | 8 | 12 | 10 | 20 |

Guests without a Guest travel row are taken to be in town, at the hotel.

### Guest travel
One row per guest per day they travel. `Mode` is `flight`, `car` (a booked festival car) or `local`.

| Person ID | Day | Mode | Flight | From | Arrival | Pickup | Buffer (min) | Remote OK | Phone | Assistant name | Assistant email | Assistant phone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| p-073 | 1 | flight | DL2207 | pl-airport | 14:20 | 14:35 | 15 | yes | +1 207 555 0173 | Mara Quist | mara.quist@example.test | +1 207 555 0174 |
| p-078 | 1 | car | | pl-hotel | | 16:30 | | no | +1 207 555 0178 | | | |

- `Buffer (min)`: landing to car (taxi, bags). Default 15.
- `Remote OK`: the guest can join by video if late.
- Inbound email or SMS is only read if it comes from a guest's or assistant's address listed here or on People. Anything else goes to a person.

### Call sheet
Who must be where, and when. Speakers in the Schedule grid **do not need a row**: they get a default call time (panel 30 min before, screening 20, Q&A 10). Add a row to set an exact call time or a spot, and to name a **backup**.

| Person ID | Event ID | Role | Call time | Spot |
|---|---|---|---|---|
| p-073 | e-056 | speaker | 15:30 | Pier 9 green room |
| p-084 | e-056 | backup | | Pier 9 green room |

`Role` is `speaker`, `moderator` or `backup`. A backup with an empty call time is allowed; the agent reports it as a data gap and asks for the speaker's call time. If no backup is named, the agent suggests guests who are free at that time and close by, panelists first.

### Shuttles

| Route ID | Name | Stops | Every (min) | Seats per hour | Vendor | Extra bus cost | Extra bus notice (min) | Extra bus seats per hour |
|---|---|---|---|---|---|---|---|---|
| r-loop | Harbor Loop | v-harbor > v-pier9 > v-canal > v-river | 20 | 60 | Bayside Shuttle Co. | 380 | 20 | 60 |

### Shuttle demand
Leave empty to let the agent count riders from saved plans (people whose next event is at another venue on the route). Add rows to set the numbers for a story.

| Route ID | Day | From | To | Expected riders |
|---|---|---|---|---|

## Scenario files

`data/scenarios/snow.json` and `data/scenarios/guest-late.json` are timelines of feed events and staff clicks, with the outcomes we expect. The format is in [backend.md](backend.md#scenario-files). Edit them to match the scenarios we present; `npm run ops` shows what the agent does and which checks pass.
