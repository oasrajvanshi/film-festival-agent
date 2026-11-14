// Answers questions from official documents and the schedule grid only, or
// says "I don't know". The model may phrase an answer from retrieved sections;
// it may not add facts, and every answer must cite a section it was given.

import type { Festival } from '../core/types';
import { clock } from '../core/time';
import type { LlmClient } from '../llm/ollama';

export interface Source { ref: string; title: string; text: string; score: number }
export interface Answer { known: boolean; text: string; citations: string[]; via: 'llm' | 'extractive' | 'schedule' | 'none' }

export const IDK = "I don't know. That isn't in the festival's official documents. Please ask at the info desk.";

const STOP = new Set(('a an the is are was were be to of in on at for and or with my i me do does can could will '
  + 'what when where which who how is it this that there if any you your we our from by as about get have has').split(' '));

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9& -]/g, ' ').split(/\s+/)
    .map(w => w.replace(/(ing|es|s)$/, '')).filter(w => w.length > 1 && !STOP.has(w));
}

/** BM25-style retrieval over document sections. */
export function retrieve(f: Festival, question: string, k = 3): Source[] {
  const sections = f.docs.flatMap(d => d.sections.map(s => ({
    ref: `${d.id}#${s.heading}`, title: `${d.title} › ${s.heading}`, text: s.body,
    toks: tokens(`${s.heading} ${s.body}`),
    head: new Set(tokens(s.heading)),
  })));
  const N = sections.length;
  const avg = sections.reduce((n, s) => n + s.toks.length, 0) / N;
  const df = new Map<string, number>();
  for (const s of sections) for (const t of new Set(s.toks)) df.set(t, (df.get(t) ?? 0) + 1);
  const q = [...new Set(tokens(question))];
  return sections.map(s => {
    let score = 0;
    for (const t of q) {
      const tf = s.toks.filter(x => x === t).length;
      if (!tf) continue;
      const idf = Math.log(1 + (N - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
      score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * s.toks.length / avg));
      // A question naming a section's topic is a strong signal.
      if (s.head.has(t)) score += idf;
    }
    return { ref: s.ref, title: s.title, text: s.text, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

/** Schedule lookups ("when is <film>?") answered straight from the grid. */
function scheduleAnswer(f: Festival, question: string): Answer | null {
  const q = question.toLowerCase();
  const film = f.films.find(x => q.includes(x.title.toLowerCase()));
  if (!film) return null;
  const shows = f.events.filter(e => e.filmId === film.id && e.status === 'scheduled' && !e.restriction);
  if (!shows.length) return { known: true, text: `${film.title} has no remaining public events.`, citations: ['grid'], via: 'schedule' };
  const venue = (id: string) => f.venues.find(v => v.id === id)!.name;
  const text = `${film.title} (dir. ${film.director}, ${film.runtimeMin} min): ` + shows.map(e =>
    `${e.kind === 'qa' ? 'Q&A' : 'screening'} on ${f.dates[e.day]} at ${clock(e.start)}, ${venue(e.venueId)}`).join('; ') + '.';
  return { known: true, text, citations: shows.map(e => `grid#${e.id}`), via: 'schedule' };
}

export const MIN_SCORE = 2.5;

export async function answerQuestion(f: Festival, question: string, llm: LlmClient | null = null): Promise<Answer> {
  const sched = scheduleAnswer(f, question);
  if (sched) return sched;
  const sources = retrieve(f, question);
  if (!sources.length || sources[0].score < MIN_SCORE) return { known: false, text: IDK, citations: [], via: 'none' };

  if (llm) {
    try {
      const raw = await llm.chat([
        { role: 'system', content: 'You answer festival questions using ONLY the numbered sources. If the sources do not answer the question, set known to false. Never add facts. Reply as JSON: {"known": boolean, "answer": string, "cite": [source numbers]}.' },
        { role: 'user', content: `Sources:\n${sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.text}`).join('\n')}\n\nQuestion: ${question}` },
      ], { json: true });
      const parsed = JSON.parse(raw) as { known?: boolean; answer?: string; cite?: number[] };
      if (parsed.known === false) return { known: false, text: IDK, citations: [], via: 'llm' };
      const cites = (parsed.cite ?? []).map(n => sources[n - 1]?.ref).filter((x): x is string => !!x);
      if (parsed.answer && cites.length) return { known: true, text: parsed.answer, citations: cites, via: 'llm' };
    } catch {
      // fall through to extractive
    }
  }
  return { known: true, text: sources[0].text, citations: [sources[0].ref], via: 'extractive' };
}
