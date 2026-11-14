// Every /api/ops endpoint in one route, so on a serverless host they all run in
// the same function and share the backend's live state.
//
//   GET  health | state | festival | decisions?status= | demo
//   POST events | tick | reset | reload | decisions/:id | scenarios/:name | demo

import { readFile } from 'node:fs/promises';
import { errorResponse, getBackend, reloadBackend } from '../../../../src/backend/server';
import { at as atTime } from '../../../../src/backend/domain/time';
import { TEAM_NAMES } from '../../../../src/backend/domain/view';
import type { Trigger } from '../../../../src/backend/domain/types';
import type { DecideInput } from '../../../../src/backend/engine/decisions';
import { ollamaHealth } from '../../../../src/backend/llm/ollama';
import { flightFrom, forecastFrom, runScenario, triggerFrom, type ScenarioFile, type ScenarioStep, type TriggerInput } from '../../../../src/backend/scenarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ path: string[] }> };
const notFound = () => Response.json({ error: 'not_found', message: 'No such endpoint' }, { status: 404 });
const scenarioFile = async (name: string) => {
  if (!/^[a-z0-9-]+$/.test(name)) throw Object.assign(new Error('Bad scenario name'), { code: 'BAD' });
  return JSON.parse(await readFile(`data/scenarios/${name}.json`, 'utf8').catch(() => { throw Object.assign(new Error(`No scenario ${name}`), { code: 'ENOENT' }); })) as ScenarioFile;
};

export async function GET(req: Request, ctx: Ctx) {
  try {
    const [a] = (await ctx.params).path;
    const url = new URL(req.url);
    const { backend, source } = await getBackend();
    const d = backend.data;
    switch (a) {
      case 'health':
        return Response.json({
          festival: d.info.name, source, warnings: backend.warnings,
          counts: { events: d.sessions.length, guests: d.guests.length, staff: d.staff.length, attendees: d.audience.length, shuttles: d.shuttles.length },
          models: backend.models, ollama: await Promise.all(backend.models.map(m => ollamaHealth(process.env, fetch, m))),
        });
      case 'state': {
        const s = await backend.state();
        if (url.searchParams.get('full')) return Response.json(s);
        return Response.json({
          clock: s.clock, decisions: [...s.decisions].reverse(), flags: s.flags.slice(-30).reverse(), outbox: s.outbox.slice(-50).reverse(),
          briefs: s.briefs, review: s.review.filter(r => r.status === 'open'), timers: s.timers.filter(t => !t.fired),
          conditions: s.conditions, overrides: s.overrides, audit: s.audit.slice(-150),
        });
      }
      case 'festival':
        return Response.json({
          source,
          info: { name: d.info.name, dates: d.info.dates, timezone: d.info.timezone },
          venues: d.venues.map(v => ({ id: v.id, name: v.name, capacity: v.capacity })),
          sessions: d.sessions.map(s => ({ id: s.id, day: s.day, title: s.title, kind: s.kind, venueId: s.venueId, room: s.room, filmId: s.filmId, start: s.start, end: s.end, guestIds: s.guestIds, expected: s.expected, status: s.status })),
          guests: d.guests.map(g => ({ id: g.id, name: g.name, role: g.role, badge: g.badge })),
          staff: d.staff.map(s => ({ id: s.id, name: s.name, team: s.team, title: s.title, lead: s.lead, channels: s.channels, shifts: s.shifts })),
          audience: d.audience.map(x => ({ id: x.id, name: x.name, role: x.role, passType: x.passType, validDays: x.validDays, eventIds: x.eventIds, channels: x.channels })),
          shuttles: d.shuttles.map(r => ({ id: r.id, name: r.name, stops: r.stops, everyMin: r.everyMin })),
          teams: TEAM_NAMES, models: backend.models,
        });
      case 'decisions': {
        const status = url.searchParams.get('status');
        const s = await backend.state();
        return Response.json({ clock: s.clock, decisions: s.decisions.filter(x => !status || x.status === status) });
      }
      case 'demo': {
        const cur = demo.cursor;
        if (!cur) return Response.json({ name: null });
        const file = await scenarioFile(cur.name);
        const steps = file.steps.filter(playable);
        return Response.json({ name: cur.name, title: file.title, played: [], upcoming: upcoming(steps, cur.next), clock: (await backend.state()).clock });
      }
    }
    return notFound();
  } catch (e) { return errorResponse(e); }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const [a, b] = (await ctx.params).path;
    switch (a) {
      case 'events': {
        const { backend } = await getBackend();
        const body = await req.json() as { day?: number; at?: string; trigger?: TriggerInput } & Partial<Trigger>;
        let t: Trigger;
        if (body.trigger) {
          const s = await backend.state();
          const date = body.day ? backend.data.info.dates[body.day] : s.clock.slice(0, 10);
          if (!date) return Response.json({ error: 'bad_request', message: `No festival day ${body.day}` }, { status: 400 });
          t = triggerFrom(date, body.trigger, body.at ? atTime(date, body.at) : s.clock);
        } else t = body as Trigger;
        const TYPES = ['weather_update', 'weather_poll', 'flight_update', 'shuttle_update', 'guest_checkin', 'inbound_message'];
        if (!TYPES.includes(t.type) || !t.at) return Response.json({ error: 'bad_request', message: `type must be one of ${TYPES.join(', ')}, with at` }, { status: 400 });
        return Response.json({ reports: await backend.ingest(t) });
      }
      case 'tick': {
        const { backend } = await getBackend();
        const body = await req.json().catch(() => ({})) as { at?: string };
        return Response.json({ reports: await backend.tick(body.at) });
      }
      case 'reset': {
        const { backend } = await getBackend();
        const body = await req.json().catch(() => ({})) as { at?: string };
        demo.cursor = undefined;
        return Response.json({ clock: (await backend.reset(body.at)).clock });
      }
      case 'reload': {
        const { backend, source } = await reloadBackend();
        return Response.json({ source, warnings: backend.warnings, events: backend.data.sessions.length });
      }
      case 'decisions': {
        if (!b) return notFound();
        const { backend } = await getBackend();
        const body = await req.json() as DecideInput & { at?: string };
        if (!body.by || !['approve', 'reject'].includes(body.action)) {
          return Response.json({ error: 'bad_request', message: 'Send action ("approve" or "reject"), option and by (a staff Person ID)' }, { status: 400 });
        }
        return Response.json(await backend.decide(b, body));
      }
      case 'scenarios': {
        if (!b) return notFound();
        const file = await scenarioFile(b);
        const { backend } = await getBackend();
        const res = await runScenario(backend, file);
        demo.cursor = undefined;
        return Response.json({ name: res.name, title: res.title, passed: res.passed, checks: res.checks, steps: res.steps });
      }
      case 'demo':
        return playDemo(req);
    }
    return notFound();
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return Response.json({ error: 'not_found', message: (e as Error).message }, { status: 404 });
    if (code === 'BAD') return Response.json({ error: 'bad_request', message: (e as Error).message }, { status: 400 });
    return errorResponse(e);
  }
}

// ---------------------------------------------------------------- demo: play a scenario one feed event at a time

/** The step that raises the alert each demo is about. */
const HEADLINE: Record<string, number> = { snow: 2, 'guest-late': 1 };
const holder = globalThis as unknown as { __opsDemo?: { cursor?: { name: string; next: number } } };
const demo = (holder.__opsDemo ??= {});
const playable = (s: ScenarioStep) => !!s.trigger || !!s.tick;
const upcoming = (steps: (ScenarioStep & { i?: number })[], next: number) => next >= 0 ? steps.slice(next).map(s => ({ at: s.at, note: s.note ?? (s.tick ? 'Clock moves on' : '') })) : [];

async function playDemo(req: Request) {
  const body = await req.json().catch(() => ({})) as { name?: string; action?: 'start' | 'next' };
  const name = body.name ?? demo.cursor?.name;
  if (!name) return Response.json({ error: 'bad_request', message: 'Send name: snow or guest-late' }, { status: 400 });
  const file = await scenarioFile(name);
  const { backend } = await getBackend();
  const date = backend.data.info.dates[file.day];
  const steps = file.steps.map((s, i) => ({ ...s, i })).filter(playable);
  const play = (s: ScenarioStep) => {
    const at = atTime(date, s.at);
    return s.trigger ? backend.ingest(triggerFrom(date, s.trigger, at)) : backend.tick(at);
  };
  let played: string[] = [];
  if (body.action === 'start' || !demo.cursor || demo.cursor.name !== name) {
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
    const headline = HEADLINE[name] ?? 0;
    for (const s of steps.filter(x => x.i < headline)) { await play(s); played.push(s.note ?? s.at); }
    demo.cursor = { name, next: steps.findIndex(x => x.i >= headline) };
  } else {
    const s = steps[demo.cursor.next];
    if (s) { await play(s); played = [s.note ?? s.at]; demo.cursor.next++; }
  }
  return Response.json({ name, title: file.title, played, upcoming: upcoming(steps, demo.cursor!.next), clock: (await backend.state()).clock });
}
