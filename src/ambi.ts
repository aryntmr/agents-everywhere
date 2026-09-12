// The only way the app talks to Ambiguous: runs the official CLI as a given coworker.
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Who } from './types.ts';

export const TZ = 'America/Los_Angeles';

// Event --color must be a hex value; these match the Ambiguous event palette.
export const COLORS = { red: '#DC2127', green: '#51B749', blue: '#5484ED', gray: '#E1E1E1' } as const;

const IDS_PATH = fileURLToPath(new URL('../config/ids.json', import.meta.url));
const BIN = fileURLToPath(new URL('../node_modules/.bin/ambiguous', import.meta.url));
const KEY_ENV: Record<Who, string> = { ops: 'AMBI_KEY_OPS', sam: 'AMBI_KEY_SAM', cara: 'AMBI_KEY_CARA', ravi: 'AMBI_KEY_RAVI' };

export const ids: any = JSON.parse(readFileSync(IDS_PATH, 'utf8'));

function deepMerge(target: any, patch: any): any {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') deepMerge(target[k], v);
    else target[k] = v;
  }
  return target;
}

export function saveIds(patch: Record<string, unknown>): void {
  deepMerge(ids, patch);
  writeFileSync(IDS_PATH, `${JSON.stringify(ids, null, 2)}\n`);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const isId = (s: string) => /^[0-9a-f]{8}-|^[A-Za-z0-9_-]{20,}$/.test(s);

export async function ambi(as: Who, args: string[], body?: Record<string, unknown>): Promise<any> {
  const token = process.env[KEY_ENV[as]];
  if (!token) throw new Error(`${KEY_ENV[as]} is not set in .env`);
  // Raw `api` calls reject unknown options; piped stdout is JSON either way.
  const argv = args[0] === 'api' ? args : [...args, '--json'];
  const label = args.filter((a) => !a.startsWith('-') && !isId(a)).slice(0, 3).join(' ');
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const child = execFile(
      BIN,
      argv,
      { env: { ...process.env, AMBI_API_TOKEN: token }, maxBuffer: 50 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let parsed: any;
        try {
          parsed = stdout.trim() ? JSON.parse(stdout) : {};
        } catch {
          parsed = undefined;
        }
        const failed = Boolean(err) || parsed === undefined || parsed?.ok === false;
        console.log(`[${as}] ${label} → ${failed ? 'error' : 'ok'} (${Date.now() - started}ms)`);
        if (!failed) return resolve(parsed);
        const detail = parsed?.error ?? (stderr || stdout || err?.message || '').toString().trim();
        reject(new Error(`ambiguous ${label}: ${String(detail).slice(0, 500)}`));
      },
    );
    child.stdin?.end(body ? JSON.stringify(body) : undefined);
  });
}

export function list<T = any>(res: any): T[] {
  if (Array.isArray(res)) return res;
  for (const k of ['data', 'items', 'results', 'events', 'instances', 'contacts', 'tasks']) {
    if (Array.isArray(res?.[k])) return res[k];
    if (Array.isArray(res?.data?.[k])) return res.data[k];
  }
  return [];
}

export function one<T = any>(res: any): T {
  return res?.data && !Array.isArray(res.data) ? res.data : res;
}

// camelCase keys become --kebab-case flags; arrays are comma-joined, objects JSON-encoded.
export function toFlags(fields: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue;
    const flag = `--${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
    out.push(flag, Array.isArray(v) ? v.join(',') : typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return out;
}

function offsetFor(d: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value;
  return !name || name === 'GMT' ? '+00:00' : name.slice(3);
}

function localParts(d: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  return Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
}

/** RFC 3339 timestamp in agency local time, e.g. 2026-09-15T14:00:00-07:00. */
export function localISO(d: Date): string {
  const p = localParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offsetFor(d)}`;
}

/** YYYY-MM-DD in agency local time. */
export function localDate(d: Date): string {
  return localISO(d).slice(0, 10);
}

/** Local weekday short name (Mon, Tue, ...). */
export function localWeekday(d: Date): string {
  return localParts(d).weekday;
}

/** The instant at a local wall-clock time on a local date, e.g. atLocal('2026-09-15', '14:00'). */
export function atLocal(dateISO: string, hhmm: string): Date {
  const offset = offsetFor(new Date(`${dateISO}T12:00:00Z`));
  return new Date(`${dateISO}T${hhmm.length === 5 ? `${hhmm}:00` : hhmm}${offset}`);
}

export type VisitStatus = 'scheduled' | 'needs_cover' | 'covered';

export function parseVisit(desc: string | null | undefined): { client_id?: string; caregiver_id?: string; status?: VisitStatus } {
  const out: Record<string, string> = {};
  for (const line of (desc ?? '').split(/\r?\n/)) {
    const m = line.match(/^\s*(client_id|caregiver_id|status)\s*:\s*(\S+)/);
    if (m) out[m[1]] = m[2];
  }
  return out as any;
}

export function formatVisit(v: { client_id: string; caregiver_id: string; status: VisitStatus }): string {
  return `client_id: ${v.client_id}\ncaregiver_id: ${v.caregiver_id}\nstatus: ${v.status}`;
}

function allowedRecipient(addr: string): boolean {
  const a = addr.trim().toLowerCase();
  const domain = String(ids.workspace_domain ?? '').toLowerCase();
  if (domain && a.endsWith(`@${domain}`)) return true;
  return (ids.email_allowlist ?? []).some((s: string) => a.includes(String(s).toLowerCase()));
}

export const mail = {
  /** Sends only to allowlisted addresses; anything else becomes a CRM note (when contactId is given). */
  async send(
    as: Who,
    m: { to: string; subject: string; markdown: string; inReplyTo?: string; threadId?: string; contactId?: string },
  ): Promise<any> {
    const recipients = m.to.split(',').map((s) => s.trim()).filter(Boolean);
    if (!recipients.length || !recipients.every(allowedRecipient)) {
      console.log(`[${as}] mail send → skipped (not allowlisted: ${m.to})`);
      if (m.contactId) await crm.note(as, m.contactId, `${ids.agents?.[as]?.display_name?.split(' ')[0] ?? as}: would have emailed ${m.to}: ${m.subject}`);
      return { skipped: true };
    }
    const idempotencyKey = createHash('sha1').update(`${as}|${m.to}|${m.subject}`).digest('hex');
    return one(
      await ambi(as, ['mail', 'send', ...toFlags({
        to: m.to, subject: m.subject, bodyMarkdown: m.markdown, inReplyTo: m.inReplyTo,
        threadId: m.threadId, contactId: m.contactId, idempotencyKey,
      })]),
    );
  },
  async get(as: Who, id: string): Promise<any> {
    return one(await ambi(as, ['mail', 'get', id, '--detail', 'full']));
  },
  async inbox(as: Who, opts: { unread?: boolean; limit?: number } = {}): Promise<any[]> {
    return list(await ambi(as, ['mail', 'inbox', ...toFlags({ unread: opts.unread, limit: opts.limit ?? 50, detail: 'headers' })]));
  },
  async mark(as: Who, id: string, read = true): Promise<any> {
    return ambi(as, ['mail', 'mark', id, '--read', String(read)]);
  },
};

export const chat = {
  /** One line in #office. Never throws: narration must not break a workflow. */
  async office(as: Who, line: string): Promise<any> {
    if (!ids.office_channel_id) return console.log(`[${as}] #office (no channel id): ${line}`);
    try {
      return await ambi(as, ['chat', 'messages', 'send', ids.office_channel_id, '--content', line]);
    } catch (e) {
      console.log(`[${as}] #office post failed: ${(e as Error).message}`);
    }
  },
};

export const crm = {
  async note(as: Who, contactId: string, text: string): Promise<any> {
    return one(await ambi(as, ['crm', 'activities', 'create', '--type', 'note', '--contact-id', contactId, '--body', text]));
  },
  async findByEmail(as: Who, email: string): Promise<any | null> {
    const want = email.trim().toLowerCase();
    const rows = list(await ambi(as, ['crm', 'contacts', 'list', '--q', want, '--limit', '10']));
    return rows.find((c: any) => String(c.email ?? '').toLowerCase() === want) ?? null;
  },
  async all(as: Who): Promise<any[]> {
    const out: any[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = list(await ambi(as, ['crm', 'contacts', 'list', '--type', 'person', '--limit', '100', '--offset', String(offset)]));
      out.push(...page);
      if (page.length < 100) return out;
    }
  },
  async get(as: Who, id: string): Promise<any> {
    return one(await ambi(as, ['crm', 'contacts', 'get', id]));
  },
  async activities(as: Who, id: string, limit = 20): Promise<any[]> {
    return list(await ambi(as, ['crm', 'contacts', 'activities', id, '--type', 'note', '--limit', String(limit)]));
  },
};

export type Occurrence = {
  id: string;
  masterId: string;
  occurrenceDate: string;
  isRecurring: boolean;
  title: string;
  description: string;
  start: string;
  end: string;
  contactId?: string;
  color?: string;
};

// Confirmed live: an expanded occurrence of an unedited series reuses the master's id (master_event_id null);
// an edited occurrence is a separate exception event with master_event_id set and original_start_at at 00:00Z
// of the occurrence date.
function toOccurrence(e: any): Occurrence {
  const start = e.start_at ?? '';
  const masterId = e.master_event_id ?? e.id;
  return {
    id: e.id,
    masterId,
    occurrenceDate: e.original_start_at ? String(e.original_start_at).slice(0, 10) : start ? localDate(new Date(start)) : '',
    isRecurring: masterId !== e.id || Boolean(e.recurrence_rule),
    title: e.title ?? '',
    description: e.description ?? '',
    start,
    end: e.end_at ?? e.end?.dateTime ?? e.end ?? '',
    contactId: e.contact_id ?? undefined,
    color: e.color ?? undefined,
  };
}

// Unconfirmed: the availability response shape. Collects every {start,end}-like object anywhere in it.
function busyBlocks(res: any): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const s = v.start ?? v.start_at ?? v.startAt;
    const e = v.end ?? v.end_at ?? v.endAt;
    if (typeof s === 'string' && typeof e === 'string') out.push({ start: Date.parse(s), end: Date.parse(e) });
    else Object.values(v).forEach(walk);
  };
  walk(res);
  return out;
}

export const cal = {
  /** Every visit occurrence on a local date, repeating series expanded. */
  async onDay(as: Who, dateISO: string, calendarId: string = ids.visits_calendar_id): Promise<Occurrence[]> {
    const res = await ambi(as, ['calendar', 'events', 'list', ...toFlags({
      calendarId, start: localISO(atLocal(dateISO, '00:00')), end: localISO(atLocal(dateISO, '23:59:59')),
      singleEvents: 'true', limit: 200,
    })]);
    return list(res).map(toOccurrence);
  },

  /**
   * Edits one day of a repeating visit without moving it. Updates the existing exception when that day was
   * already edited, and falls back to a plain update for a one-off event. Colors must be hex (see COLORS).
   */
  async editOccurrence(
    as: Who,
    masterId: string,
    occurrenceDate: string,
    fields: { title?: string; description?: string; color?: string; attendees?: string[]; status?: string },
  ): Promise<any> {
    // Search a window around the date: exceptions carry original_start_at at 00:00Z, which is the prior local day.
    const res = await ambi(as, ['calendar', 'events', 'list', ...toFlags({
      start: localISO(atLocal(occurrenceDate, '00:00')), end: localISO(new Date(atLocal(occurrenceDate, '00:00').getTime() + 36 * 3_600_000)),
      singleEvents: 'true', limit: 200,
    })]);
    const hits = list(res).filter((e: any) => e.id === masterId || e.master_event_id === masterId).map((e: any) => ({ e, o: toOccurrence(e) }));
    const hit = hits.find((h) => h.o.occurrenceDate === occurrenceDate);
    if (hit && hit.e.id !== masterId) {
      return one(await ambi(as, ['calendar', 'events', 'update', hit.e.id, ...toFlags(fields)]));
    }
    if (hit && hit.e.recurrence_rule) {
      // Without explicit times the API moves the exception to 00:00Z of the occurrence date.
      return one(await ambi(as, ['calendar', 'events', 'edit-single', masterId, '--occurrence-date', occurrenceDate,
        ...toFlags({ startAt: hit.e.start_at, endAt: hit.e.end_at, ...fields })]));
    }
    return one(await ambi(as, ['calendar', 'events', 'update', masterId, ...toFlags(fields)]));
  },

  async create(
    as: Who,
    ev: {
      calendarId?: string; title: string; startAt: string; endAt: string; description?: string; attendees?: string[];
      contactId?: string; color?: string; recurrenceRule?: string; location?: string;
    },
  ): Promise<any> {
    const { calendarId = ids.visits_calendar_id, ...fields } = ev;
    return one(await ambi(as, ['calendar', 'events', 'create', calendarId, ...toFlags(fields)]));
  },

  async availability(as: Who, userIds: string[], start: string, end: string): Promise<any> {
    return ambi(as, ['calendar', 'availability', '--user-ids', userIds.join(','), '--start', start, '--end', end]);
  },

  /** First free weekday slot on the half hour between 09:00 and 17:00 local time, or null. */
  async firstGap(as: Who, userIds: string[], startISO: string, endISO: string, minutes: number): Promise<{ start: string; end: string } | null> {
    const busy = busyBlocks(await cal.availability(as, userIds, startISO, endISO));
    const endLimit = Date.parse(endISO);
    let t = Math.ceil(Math.max(Date.parse(startISO), Date.now()) / 1_800_000) * 1_800_000;
    for (; t + minutes * 60_000 <= endLimit; t += 1_800_000) {
      const d = new Date(t);
      if (['Sat', 'Sun'].includes(localWeekday(d))) continue;
      const hhmm = localISO(d).slice(11, 16);
      const endHhmm = localISO(new Date(t + minutes * 60_000)).slice(11, 16);
      if (hhmm < '09:00' || endHhmm > '17:00' || endHhmm < hhmm) continue;
      const slotEnd = t + minutes * 60_000;
      if (busy.some((b) => b.start < slotEnd && b.end > t)) continue;
      return { start: localISO(d), end: localISO(new Date(slotEnd)) };
    }
    return null;
  },
};

export const tasks = {
  async create(
    as: Who,
    t: {
      title: string; description?: string; assigneeId?: string; priority?: 'urgent' | 'high' | 'medium' | 'low';
      dueDate?: string; projectId?: string; contactId?: string; dealId?: string; status?: string;
    },
  ): Promise<any> {
    return one(await ambi(as, ['tasks', 'create', ...toFlags({ projectId: ids.office_project_id, ...t })]));
  },
  async get(as: Who, id: string): Promise<any> {
    return one(await ambi(as, ['tasks', 'get', id]));
  },
  async done(as: Who, id: string): Promise<any> {
    return one(await ambi(as, ['tasks', 'update', id, '--status', 'done']));
  },
  async comment(as: Who, id: string, text: string): Promise<any> {
    return ambi(as, ['api', 'POST', `/api/tasks/${id}/comments`, '--data', JSON.stringify({ content: text })]);
  },
};
