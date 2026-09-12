import type { Who } from './types.ts';
import { ambi, crm, list, one } from './ambi.ts';

export type Person = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  role: string;
  custom: Record<string, string>;
  skills: string[];
  languages: string[];
  raw: any;
};

const TTL_MS = 60_000;
const PAGE = 100;
const MAX_PAGES = 20;
let cache: { people: Person[]; at: number } | null = null;

function invalidate() {
  cache = null;
}

function csv(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function stringifyValues(obj: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === null || v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(',') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}

// Unconfirmed: contact field names (first_name, last_name, custom_properties) per the CLI flags.
function toPerson(c: any): Person {
  const custom = stringifyValues(c?.custom_properties);
  const name = c?.name ?? [c?.first_name, c?.last_name].filter(Boolean).join(' ');
  const [first, ...rest] = String(name ?? '').split(' ');
  return {
    id: c.id,
    name: name ?? '',
    firstName: c?.first_name ?? first ?? '',
    lastName: c?.last_name ?? rest.join(' '),
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    title: c?.title ?? '',
    role: custom.role ?? '',
    custom,
    skills: csv(custom.skills),
    languages: csv(custom.languages),
    raw: c,
  };
}

// Unconfirmed: list responses expose `next_cursor` when more pages exist; otherwise fall back to offset.
function nextCursor(res: any): string | undefined {
  return res?.next_cursor ?? res?.nextCursor ?? undefined;
}

export async function all(as: Who): Promise<Person[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.people;
  const rows: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const args = ['crm', 'contacts', 'list', '--type', 'person', '--limit', String(PAGE)];
    if (cursor) args.push('--cursor', cursor);
    else if (page > 0) args.push('--offset', String(rows.length));
    const res = await ambi(as, args);
    const batch = list(res);
    rows.push(...batch);
    cursor = nextCursor(res);
    if (batch.length < PAGE && !cursor) break;
    if (batch.length === 0) break;
  }
  const seen = new Set<string>();
  const people = rows.filter((r) => r?.id && !seen.has(r.id) && seen.add(r.id)).map(toPerson);
  cache = { people, at: Date.now() };
  return people;
}

export async function byRole(as: Who, role: string): Promise<Person[]> {
  return (await all(as)).filter((p) => p.role === role);
}

export async function findByEmail(as: Who, email: string): Promise<Person | null> {
  const want = email.trim().toLowerCase();
  if (!want) return null;
  const cached = (await all(as)).find((p) => p.email.toLowerCase() === want);
  if (cached) return cached;
  const res = await ambi(as, ['crm', 'contacts', 'list', '--q', want, '--limit', '10']);
  const hit = list(res).find((c: any) => String(c?.email ?? '').toLowerCase() === want);
  return hit ? toPerson(hit) : null;
}

export async function findClientByName(as: Who, name: string): Promise<Person | null> {
  const want = name.trim().toLowerCase();
  return (await byRole(as, 'client')).find((p) => p.name.trim().toLowerCase() === want) ?? null;
}

export async function get(as: Who, id: string): Promise<Person> {
  return toPerson(one(await crm.get(as, id)));
}

export async function note(as: Who, id: string, text: string): Promise<void> {
  await crm.note(as, id, text);
}

// Unconfirmed: activity text is in `body` (falls back to content/subject); sorted newest first by timestamp.
function activityText(a: any): string {
  return String(a?.body ?? a?.content ?? a?.subject ?? '');
}
function activityTime(a: any): number {
  return Date.parse(a?.occurred_at ?? a?.created_at ?? '') || 0;
}

export async function timeline(as: Who, id: string): Promise<string[]> {
  const res = await ambi(as, ['crm', 'contacts', 'activities', id, '--type', 'note', '--limit', '20']);
  return list(res)
    .sort((a, b) => activityTime(b) - activityTime(a))
    .slice(0, 20)
    .map(activityText)
    .filter(Boolean);
}

export async function upsert(
  as: Who,
  fields: { email: string; name: string; phone?: string; title?: string; custom?: Record<string, unknown> },
): Promise<Person> {
  const existing = await findByEmail(as, fields.email);
  const custom = stringifyValues(fields.custom);
  invalidate();
  if (existing) {
    const body: Record<string, unknown> = {
      name: fields.name,
      custom_properties: { ...existing.custom, ...custom },
    };
    if (fields.phone) body.phone = fields.phone;
    if (fields.title) body.title = fields.title;
    return toPerson(one(await ambi(as, ['crm', 'contacts', 'update', existing.id], body)));
  }
  const [first, ...rest] = fields.name.trim().split(/\s+/);
  const body: Record<string, unknown> = {
    type: 'person',
    name: fields.name,
    first_name: first,
    last_name: rest.join(' '),
    email: fields.email,
    custom_properties: custom,
  };
  if (fields.phone) body.phone = fields.phone;
  if (fields.title) body.title = fields.title;
  return toPerson(one(await ambi(as, ['crm', 'contacts', 'create'], body)));
}
