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

/** The festival's schedule and venues as short lines a model can read. */
export function scheduleDigest(f: Festival, max = 160, question = ''): string {
  const venue = (id: string) => f.venues.find(v => v.id === id);
  const who = (ids: string[]) => ids.map(id => f.people.find(p => p.id === id)?.name).filter(Boolean).join(', ');
  const day = (d: number) => new Date(`${f.dates[d]}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const pick = relevantEvents(f, question);
  const events = (pick ?? [...f.events]).sort((a, b) => a.start.localeCompare(b.start)).slice(0, pick ? 220 : max);
  // Grouped by day, so each line stays short; the model has a size limit.
  const lines: string[] = [];
  let last = -1;
  for (const e of events) {
    if (e.day !== last) { lines.push(`Day ${e.day}, ${day(e.day)}:`); last = e.day; }
    lines.push(`- ${clock(e.start)}–${clock(e.end)} ${e.kind === 'qa' ? 'Q&A' : e.kind} "${e.title}" at ${venue(e.venueId)?.name ?? e.venueId}`
      + `${e.guestIds.length ? `; with ${who(e.guestIds)}` : ''}${e.restriction ? `; ${e.restriction.replace('_', ' ')}` : ''}${e.status === 'cancelled' ? '; CANCELLED' : ''}`);
  }
  const venues = f.venues.map(v => `- ${v.name}: ${v.address}${v.capacity ? `, ${v.capacity} seats` : ''}`);
  const films = f.films.map(x => `"${x.title}"`);
  let schedule = lines.join('\n');
  if (schedule.length > DIGEST_CHARS) schedule = `${schedule.slice(0, DIGEST_CHARS).replace(/\n[^\n]*$/, '')}\n(more events not shown)`;
  const scope = pick ? 'Schedule (the days, venues, films and people the question mentions)' : `Schedule (first ${events.length} events)`;
  return `Festival: ${f.name}\nDates: ${Object.keys(f.dates).map(d => `Day ${d} = ${day(Number(d))}`).join('; ')}\nVenues:\n${venues.join('\n')}\nFilms: ${films.join(', ')}\n${scope}:\n${schedule}`;
}

/** Keeps the request under the model's size limit (Groq rejects very large prompts). */
const DIGEST_CHARS = 7000;

/** The events a question is about: days, venues, films or people it names. Null when it names none. */
export function relevantEvents(f: Festival, question: string): Festival['events'] | null {
  const q = ` ${question.toLowerCase()} `;
  if (!q.trim()) return null;
  const days = new Set<number>();
  const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (const [d, iso] of Object.entries(f.dates)) {
    const dt = new Date(`${iso}T12:00:00Z`);
    const wd = WD[dt.getUTCDay()];
    const md = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toLowerCase(); // "jan 23"
    const mdl = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).toLowerCase(); // "january 23"
    if (q.includes(wd) || new RegExp(`\\b${wd.slice(0, 3)}\\b`).test(q) || q.includes(md) || q.includes(mdl) || q.includes(iso) || new RegExp(`\\bday ${d}\\b`).test(q)) days.add(Number(d));
  }
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !['theater', 'theatre', 'auditorium', 'center', 'school', 'high', 'film', 'festival', 'hall'].includes(w));
  const venueIds = new Set(f.venues.filter(v => q.includes(v.name.toLowerCase()) || words(v.name).some(w => q.includes(` ${w}`))).map(v => v.id));
  const filmIds = new Set(f.films.filter(x => q.includes(x.title.toLowerCase())).map(x => x.id));
  const personIds = new Set(f.people.filter(p => p.name.length > 3 && (q.includes(p.name.toLowerCase()) || (p.name.split(' ').length > 1 && q.includes(` ${p.name.split(' ').slice(-1)[0].toLowerCase()}`)))).map(p => p.id));
  if (!days.size && !venueIds.size && !filmIds.size && !personIds.size) return null;
  return f.events.filter(e =>
    (!days.size || days.has(e.day))
    && (!venueIds.size || venueIds.has(e.venueId) || !!(filmIds.size || personIds.size))
    && (!filmIds.size || (e.filmId && filmIds.has(e.filmId)) || !!personIds.size && e.guestIds.some(g => personIds.has(g)))
    && (!personIds.size || e.guestIds.some(g => personIds.has(g)) || (!!e.filmId && filmIds.has(e.filmId))));
}

export async function answerQuestion(f: Festival, question: string, llm: LlmClient | null = null): Promise<Answer> {
  const sources = retrieve(f, question, 4);
  let note: string | undefined;
  if (llm) {
    // With a model: it reads the best-matching official sections and the whole
    // schedule, answers only from them, and must cite what it used.
    try {
      const raw = await llm.chat([
        { role: 'system', content: 'You are Usher, the help desk for a film festival. Answer using ONLY the numbered official sources and the festival schedule below. '
          + 'If they let you answer, including a "no", set known to true and answer in one to three plain, friendly sentences with exact times, dates and venue names. '
          + 'Set known to false if they do not cover the question. Never guess or add facts. '
          + 'Reply as JSON: {"known": boolean, "answer": string, "cite": [source numbers, or "schedule"]}.' },
        { role: 'user', content: `Official sources:\n${sources.length ? sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.text}`).join('\n') : '(none matched)'}\n\n${scheduleDigest(f, 160, question)}\n\nQuestion: ${question}` },
      ], { json: true });
      const parsed = extractJson(raw) as { known?: boolean | string; answer?: string; cite?: (number | string)[] | number | string };
      if (parsed.known === false || parsed.known === 'false' || !parsed.answer) return { known: false, text: IDK, citations: [], via: 'llm' };
      const citeList = Array.isArray(parsed.cite) ? parsed.cite : parsed.cite != null ? [parsed.cite] : [];
      const cites = citeList.map(n => /sched/i.test(String(n)) ? 'grid' : sources[Number(String(n).replace(/\D/g, '')) - 1]?.ref).filter((x): x is string => !!x);
      return { known: true, text: parsed.answer, citations: cites.length ? [...new Set(cites)] : ['grid'], via: 'llm' };
    } catch (e) {
      note = (e as Error).message.slice(0, 160);
    }
  }
  // Without a model (or if it failed): schedule lookups and the best official section, or "I don't know".
  const sched = scheduleAnswer(f, question);
  if (sched) return { ...sched, ...(note ? { note } : {}) };
  // The best section must share a telling word with the question, not only a common one like "screening".
  if (!sources.length || sources[0].score < MIN_SCORE || !sources[0].specific) return { known: false, text: IDK, citations: [], via: 'none', ...(note ? { note } : {}) };
  return { known: true, text: sources[0].text, citations: [sources[0].ref], via: 'extractive', ...(note ? { note } : {}) };
}

/** A citation as people read it, e.g. "FAQ › Food" or "Festival schedule". */
export function citeLabel(f: Festival, ref: string): string {
  if (ref === 'grid' || ref.startsWith('grid#')) return 'Festival schedule';
  const [docId, heading] = ref.split('#');
  const d = f.docs.find(x => x.id === docId);
  return d ? `${d.title} › ${heading}` : ref;
}
