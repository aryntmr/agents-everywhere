import { existsSync } from 'node:fs';
import type { Coworker, Event, Who } from './types.ts';

const cache = new Map<Who, Coworker>();

function fileFor(who: Who): URL {
  return new URL(`./coworkers/${who}.ts`, import.meta.url);
}

export function hasCoworker(who: Who): boolean {
  return existsSync(fileFor(who));
}

// Accepts a default export, a named `<who>` export, or a bare `handle` function.
function pickCoworker(who: Who, mod: any): Coworker | undefined {
  const candidates = [mod?.default, mod?.[who]];
  for (const c of candidates) if (c && typeof c.handle === 'function') return c as Coworker;
  if (typeof mod?.handle === 'function') return { who, handle: mod.handle };
  if (typeof mod?.default === 'function') return { who, handle: mod.default };
  return undefined;
}

export async function coworker(who: Who): Promise<Coworker> {
  const cached = cache.get(who);
  if (cached) return cached;
  if (!hasCoworker(who)) throw new Error(`coworker "${who}" not found: src/coworkers/${who}.ts does not exist on this branch`);
  const mod = await import(fileFor(who).href);
  const cw = pickCoworker(who, mod);
  if (!cw) throw new Error(`src/coworkers/${who}.ts has no default export, "${who}" export, or handle function`);
  cache.set(who, cw);
  return cw;
}

export async function handoff(to: Who, ev: { from: Who; kind: string; payload: Record<string, unknown> }): Promise<void> {
  const cw = await coworker(to);
  const event: Event = { type: 'handoff', who: to, from: ev.from, kind: ev.kind, payload: ev.payload };
  await cw.handle(event);
}
