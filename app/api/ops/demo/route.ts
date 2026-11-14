// POST /api/ops/demo { name: "snow" | "guest-late", action: "start" | "next" }
// Plays a scenario file one feed event at a time, for a live demo. Staff
// decisions in the file are skipped: in the demo a person makes them in the
// app. "start" resets, seeds the setup and plays the quiet steps up to the
// headline event; each "next" plays one more feed event or clock tick.
import { readFile } from 'node:fs/promises';
import { getBackend, errorResponse } from '../../../../src/backend/server';
import { at as atTime } from '../../../../src/backend/domain/time';
import { flightFrom, forecastFrom, triggerFrom, type ScenarioFile, type ScenarioStep } from '../../../../src/backend/scenarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** The step that raises the alert the demo is about. */
const HEADLINE: Record<string, number> = { snow: 2, 'guest-late': 1 };

interface Cursor { name: string; next: number }
const holder = globalThis as unknown as { __opsDemo?: Cursor };

const playable = (s: ScenarioStep) => !!s.trigger || !!s.tick;

/** Where the demo is, so a reloaded page can show the next step. */
export async function GET() {
  try {
    const cur = holder.__opsDemo;
    if (!cur) return Response.json({ name: null });
    const file = JSON.parse(await readFile(`data/scenarios/${cur.name}.json`, 'utf8')) as ScenarioFile;
    const { backend } = await getBackend();
    const steps = file.steps.filter(playable);
    const upcoming = cur.next >= 0 ? steps.slice(cur.next).map(s => ({ at: s.at, note: s.note ?? (s.tick ? 'Clock moves on' : '') })) : [];
    return Response.json({ name: cur.name, title: file.title, played: [], upcoming, clock: (await backend.state()).clock });
  } catch (e) { return errorResponse(e); }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { name?: string; action?: 'start' | 'next' };
    const name = body.name ?? holder.__opsDemo?.name;
    if (!name || !/^[a-z0-9-]+$/.test(name)) return Response.json({ error: 'bad_request', message: 'Send name: snow or guest-late' }, { status: 400 });
    const file = JSON.parse(await readFile(`data/scenarios/${name}.json`, 'utf8')) as ScenarioFile;
    const { backend } = await getBackend();
    const date = backend.data.info.dates[file.day];
    const steps = file.steps.map((s, i) => ({ ...s, i })).filter(playable);

    const play = async (s: ScenarioStep) => {
      const at = atTime(date, s.at);
      return s.trigger ? backend.ingest(triggerFrom(date, s.trigger, at)) : backend.tick(at);
    };

    let played: string[] = [];
    if (body.action === 'start' || !holder.__opsDemo || holder.__opsDemo.name !== name) {
      await backend.reset(atTime(date, file.start));
      const setup = file.setup;
      if (setup) {
        await backend.seed(s => {
          if (setup.forecast) s.conditions.forecast = forecastFrom(date, setup.forecast);
          Object.assign(s.conditions.shuttleDelays, setup.shuttleDelays ?? {});
          for (const c of setup.checkIns ?? []) s.conditions.checkIns[c.guestId] = { at: atTime(date, c.at), place: c.place };
          for (const f of setup.flights ?? []) s.conditions.flights[f.flight] = flightFrom(date, f, s.clock);
        });
      }
      holder.__opsDemo = { name, next: 0 };
      const headline = HEADLINE[name] ?? 0;
      for (const s of steps.filter(x => x.i < headline)) { await play(s); played.push(s.note ?? s.at); }
      holder.__opsDemo.next = steps.findIndex(x => x.i >= headline);
    } else {
      const cur = holder.__opsDemo;
      const s = steps[cur.next];
      if (s) { await play(s); played = [s.note ?? s.at]; cur.next++; }
    }
    const cur = holder.__opsDemo!;
    const upcoming = cur.next >= 0 ? steps.slice(cur.next).map(s => ({ at: s.at, note: s.note ?? (s.tick ? 'Clock moves on' : '') })) : [];
    return Response.json({ name, title: file.title, played, upcoming, clock: (await backend.state()).clock });
  } catch (e) { return errorResponse(e); }
}
