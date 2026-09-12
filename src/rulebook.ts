import type { Who } from './types.ts';
import { ambi, ids, one } from './ambi.ts';

const TTL_MS = 60_000;
let cache: { text: string; at: number } | null = null;

// Unconfirmed: assumes `docs get` returns the body as a markdown string in `content`.
function docText(doc: any): string {
  const c = doc?.content ?? doc?.markdown ?? doc?.body;
  if (typeof c === 'string') return c;
  return c ? JSON.stringify(c) : '';
}

export async function text(as: Who): Promise<string> {
  const id = ids.rulebook_doc_id;
  if (!id) return '';
  if (cache && Date.now() - cache.at < TTL_MS) return cache.text;
  const t = docText(one(await ambi(as, ['docs', 'get', id])));
  cache = { text: t, at: Date.now() };
  return t;
}
