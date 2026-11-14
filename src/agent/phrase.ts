// Optional: the model rewrites a drafted message to read naturally. The
// rewrite is rejected unless it keeps every time, venue and quoted title from
// the draft, so the model can change tone but never facts.

import type { LlmClient } from '../llm/ollama';
import type { OutboundMessage } from './approvals';

export function keyFacts(text: string): string[] {
  const times = text.match(/\b\d{1,2}:\d{2} ?(am|pm)\b/gi) ?? [];
  const quoted = text.match(/"[^"]+"/g) ?? [];
  const minutes = text.match(/\b\d+ min/g) ?? [];
  return [...times, ...quoted, ...minutes];
}

export function keepsFacts(draft: string, rewrite: string): boolean {
  return keyFacts(draft).every(f => rewrite.includes(f));
}

export async function polishMessages<M extends OutboundMessage>(llm: LlmClient, messages: M[]): Promise<M[]> {
  const out: M[] = [];
  for (const m of messages) {
    try {
      const rewrite = (await llm.chat([
        { role: 'system', content: 'Rewrite this festival update as a short, friendly message (max 60 words). Keep every time, place, title and number exactly as written. Do not add information. Return only the message.' },
        { role: 'user', content: m.body },
      ])).trim();
      out.push(rewrite && keepsFacts(m.body, rewrite) ? { ...m, body: rewrite } : m);
    } catch {
      out.push(m);
    }
  }
  return out;
}
