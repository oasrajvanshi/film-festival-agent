// Answers questions from official documents and the schedule grid only, or
// says "I don't know". The model may phrase an answer from retrieved sections;
// it may not add facts, and every answer must cite a section it was given.

import type { Festival } from '../core/types';
import { clock } from '../core/time';
import type { LlmClient } from '../llm/ollama';

export interface Source { ref: string; title: string; text: string; score: number; /** Matched a word that few sections use (not just "screening"). */ specific?: boolean }
export interface Answer { known: boolean; text: string; citations: string[]; via: 'llm' | 'extractive' | 'schedule' | 'none'; note?: string }

/** Pull the first JSON object out of a model reply (models sometimes wrap it in prose or code fences). */
export function extractJson(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  try { return JSON.parse(t); } catch { /* look for an object inside */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error(raw.trim() ? 'model reply was not JSON' : 'model returned an empty reply');
}

export const IDK = "I don't know. That isn't in the festival's official documents. Please ask at the info desk.";

const STOP = new Set(('a an the is are was were be to of in on at for and or with my i me do does can could will '
  + 'what when where which who how is it this that there if any you your we our from by as about get have has').split(' '));

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9& -]/g, ' ').split(/\s+/)
    .map(w => w.replace(/(ing|es|s)$/, '')).filter(w => w.length > 1 && !STOP.has(w));
}

/** A word in more than this share of sections is too common to answer on its own. */
export const MAX_COMMON = 0.2;

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
    let specific = false;
    for (const t of q) {
      const tf = s.toks.filter(x => x === t).length;
      if (!tf) continue;
      if (df.get(t)! / N <= MAX_COMMON) specific = true;
      const idf = Math.log(1 + (N - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
      score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * s.toks.length / avg));
      // A question naming a section's topic is a strong signal.
      if (s.head.has(t)) score += idf;
    }
    return { ref: s.ref, title: s.title, text: s.text, score, specific };
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
  // The best section must share a telling word with the question, not only a common one like "screening".
  if (!sources.length || sources[0].score < MIN_SCORE || !sources[0].specific) return { known: false, text: IDK, citations: [], via: 'none' };

  let note: string | undefined;
  if (llm) {
    try {
      const raw = await llm.chat([
        { role: 'system', content: 'You answer festival questions using ONLY the numbered sources. If the sources let you answer, including a "no" (for example a source says something is not included or not admitted), set known to true and answer in one or two plain sentences. Set known to false only if the sources say nothing about the question. Never add facts. Reply as JSON: {"known": boolean, "answer": string, "cite": [source numbers]}.' },
        { role: 'user', content: `Sources:\n${sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.text}`).join('\n')}\n\nQuestion: ${question}` },
      ], { json: true });
      const parsed = extractJson(raw) as { known?: boolean | string; answer?: string; cite?: (number | string)[] | number };
      if (parsed.known === false || parsed.known === 'false') return { known: false, text: IDK, citations: [], via: 'llm' };
      const citeList = Array.isArray(parsed.cite) ? parsed.cite : parsed.cite != null ? [parsed.cite] : [];
      const cites = citeList.map(n => sources[Number(String(n).replace(/\D/g, '')) - 1]?.ref).filter((x): x is string => !!x);
      if (parsed.answer && cites.length) return { known: true, text: parsed.answer, citations: [...new Set(cites)], via: 'llm' };
      if (parsed.answer) return { known: true, text: parsed.answer, citations: [sources[0].ref], via: 'llm' };
      note = 'model reply had no answer';
    } catch (e) {
      note = (e as Error).message.slice(0, 160);
    }
  }
  return { known: true, text: sources[0].text, citations: [sources[0].ref], via: 'extractive', ...(note ? { note } : {}) };
}
