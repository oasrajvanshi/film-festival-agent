// POST /api/ops/scenarios/snow | guest-late: reset and replay a scenario file
// from data/scenarios, then return every step and the checks.
import { readFile } from 'node:fs/promises';
import { getBackend, errorResponse } from '../../../../../src/backend/server';
import { runScenario, type ScenarioFile } from '../../../../../src/backend/scenarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await ctx.params;
    if (!/^[a-z0-9-]+$/.test(name)) return Response.json({ error: 'bad_request', message: 'Bad scenario name' }, { status: 400 });
    const file = JSON.parse(await readFile(`data/scenarios/${name}.json`, 'utf8').catch(() => { throw Object.assign(new Error(`No scenario ${name}`), { code: 'ENOENT' }); })) as ScenarioFile;
    const { backend } = await getBackend();
    const res = await runScenario(backend, file);
    return Response.json({ name: res.name, title: res.title, passed: res.passed, checks: res.checks, steps: res.steps });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return Response.json({ error: 'not_found', message: (e as Error).message }, { status: 404 });
    return errorResponse(e);
  }
}
