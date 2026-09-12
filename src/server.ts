import 'dotenv/config';
import { createServer, type IncomingMessage } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ambi, ids, list, TZ } from './ambi.ts';
import * as approvals from './approvals.ts';
import { coworker } from './registry.ts';
import type { Event, Who } from './types.ts';

export { handoff } from './registry.ts';

const WHO: Who[] = ['ops', 'sam', 'cara', 'ravi'];
const startedAt = Date.now();
const recent: { at: string; type: string; who: Who; detail: string }[] = [];

function log(msg: string) {
  console.log(`[server] ${msg}`);
}

async function dispatch(ev: Event) {
  const detail =
    ev.type === 'email' ? `${ev.from} "${ev.subject}"` :
    ev.type === 'form' ? `form ${ev.formId}` :
    ev.type === 'task_done' ? `task ${ev.taskId}` :
    ev.type === 'handoff' ? `${ev.from} ${ev.kind}` : ev.kind;
  log(`route ${ev.type} -> ${ev.who}: ${detail}`);
  recent.unshift({ at: new Date().toISOString(), type: ev.type, who: ev.who, detail });
  recent.length = Math.min(recent.length, 20);
  try {
    await (await coworker(ev.who)).handle(ev);
  } catch (err: any) {
    log(`handler ${ev.who} failed on ${ev.type}: ${err?.stack || err}`);
  }
}

const seen = new Map<string, number>();
const HOUR = 3600_000;
function firstTime(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > HOUR) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, now);
  return true;
}

function secrets(): string[] {
  return Object.entries(process.env)
    .filter(([k, v]) => (k === 'WEBHOOK_SECRET' || k.startsWith('WEBHOOK_SECRET_')) && v)
    .map(([, v]) => v as string);
}

// Recipe 2: x-webhook-signature = "sha256=" + hex HMAC-SHA256(secret, `${x-webhook-timestamp}.${rawBody}`).
function verify(req: IncomingMessage, raw: Buffer): boolean {
  const keys = secrets();
  if (!keys.length) return true;
  const ts = String(req.headers['x-webhook-timestamp'] || '');
  const sigHeader = String(req.headers['x-webhook-signature'] || '');
  if (!ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - parseInt(ts, 10)) > 300) return false;
  const sig = Buffer.from(sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader, 'hex');
  return keys.some((k) => {
    const expected = Buffer.from(createHmac('sha256', k).update(`${ts}.${raw.toString('utf8')}`).digest('hex'), 'hex');
    return expected.length === sig.length && timingSafeEqual(expected, sig);
  });
}

function addr(v: any): string {
  if (!v) return '';
  if (Array.isArray(v)) return addr(v[0]);
  const s = typeof v === 'string' ? v : v.email || v.address || '';
  const m = /<([^>]+)>/.exec(s);
  return (m ? m[1] : s).trim().toLowerCase();
}

function addrs(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(addr).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map(addr).filter(Boolean);
  return [addr(v)];
}

function whoForAddress(to: string[]): Who | undefined {
  for (const a of to) {
    const local = a.split('@')[0] as Who;
    if (WHO.includes(local)) return local;
  }
  return undefined;
}

// Unconfirmed payload shapes: webhook body is { event, data }; field names inside data are guessed defensively.
function emailFields(data: any) {
  const e = data?.email ?? data?.message ?? data ?? {};
  return {
    id: String(e.email_id ?? e.id ?? data?.email_id ?? data?.id ?? ''),
    to: addrs(e.to ?? data?.to),
    from: addr(e.from ?? e.from_email ?? data?.from),
    subject: String(e.subject ?? data?.subject ?? ''),
  };
}

function formFields(data: any) {
  const r = data?.response ?? data ?? {};
  return {
    formId: String(data?.form_id ?? data?.formId ?? data?.form?.id ?? r.form_id ?? ''),
    responseId: String(data?.response_id ?? r.id ?? data?.id ?? '') || undefined,
    answers: data?.answers ?? r.answers ?? r.data ?? data?.data,
  };
}

function taskId(data: any): string {
  return String(data?.task_id ?? data?.task?.id ?? data?.id ?? '');
}

const formSchemas = new Map<string, { id: string; label: string }[]>();
async function formFieldDefs(formId: string) {
  if (!formSchemas.has(formId)) {
    const res = await ambi('ops', ['forms', 'get', formId]);
    const form = res?.form ?? res?.data ?? res;
    const fields = form?.fields ?? form?.schema?.fields ?? [];
    formSchemas.set(formId, fields.map((f: any) => ({ id: String(f.id), label: String(f.label ?? '') })));
  }
  return formSchemas.get(formId)!;
}

// Handles answers keyed by field id, keyed by label, or [{field_id, value}].
export function normalizeAnswers(raw: any, fields: { id: string; label: string }[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const byLabel = new Map(fields.map((f) => [f.label.trim().toLowerCase(), f.id]));
  const ids = new Set(fields.map((f) => f.id));
  const put = (key: string, value: unknown) => {
    const k = ids.has(key) ? key : byLabel.get(key.trim().toLowerCase()) ?? key;
    out[k] = value;
  };
  if (Array.isArray(raw)) {
    for (const a of raw) put(String(a.field_id ?? a.fieldId ?? a.id ?? a.label ?? ''), a.value ?? a.answer);
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) put(k, v);
  }
  return out;
}

async function routeWebhook(body: any, deliveryId: string) {
  const type = String(body?.event ?? body?.type ?? '');
  const data = body?.data ?? {};

  if (type === 'email.received') {
    const e = emailFields(data);
    const who = whoForAddress(e.to);
    if (!e.id || !who) return log(`email.received ignored (id=${e.id} to=${e.to.join(',')})`);
    if (!firstTime(`email:${e.id}:${who}`)) return;
    if (!e.from || !e.subject) {
      try {
        const full = await ambi(who, ['mail', 'get', e.id, '--detail', 'headers']);
        const m = full?.email ?? full?.data ?? full;
        e.from ||= addr(m?.from);
        e.subject ||= String(m?.subject ?? '');
      } catch (err: any) {
        log(`mail get ${e.id} failed: ${err?.message}`);
      }
    }
    return dispatch({ type: 'email', who, emailId: e.id, to: e.to[0] ?? '', from: e.from, subject: e.subject, raw: body });
  }

  if (type === 'form.submitted') {
    const f = formFields(data);
    const who: Who | undefined =
      f.formId === ids?.forms?.request_care?.id ? 'cara' :
      f.formId === ids?.forms?.apply?.id ? 'ravi' : undefined;
    if (!who) return log(`form.submitted ignored (form ${f.formId})`);
    if (!firstTime(`form:${f.responseId ?? deliveryId}`)) return;
    let rawAnswers = f.answers;
    if (!rawAnswers && f.responseId) {
      const res = await ambi('ops', ['forms', 'response', 'get', f.formId, f.responseId]);
      const r = res?.response ?? res?.data ?? res;
      rawAnswers = r?.answers ?? r?.data ?? r?.values;
    }
    let fields: { id: string; label: string }[] = [];
    try {
      fields = await formFieldDefs(f.formId);
    } catch (err: any) {
      log(`forms get ${f.formId} failed, keeping answer keys as-is: ${err?.message}`);
    }
    const answers = normalizeAnswers(rawAnswers, fields);
    return dispatch({ type: 'form', who, formId: f.formId, responseId: f.responseId, answers, raw: body });
  }

  if (type === 'task.completed') {
    const id = taskId(data);
    if (!id || !firstTime(`task:${id}`)) return;
    try {
      approvals.resolve(id, true);
    } catch (err: any) {
      log(`approvals.resolve failed: ${err?.message}`);
    }
    return dispatch({ type: 'task_done', who: 'sam', taskId: id, raw: body });
  }

  log(`event ${type || '(none)'} not routed`);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function pollInboxes() {
  for (const who of WHO) {
    try {
      const res = await ambi(who, ['mail', 'inbox', '--unread', 'true', '--detail', 'headers']);
      for (const m of list(res)) {
        const id = String(m.id ?? m.email_id ?? '');
        if (!id || !firstTime(`email:${id}:${who}`)) continue;
        await dispatch({
          type: 'email', who, emailId: id, to: addrs(m.to)[0] ?? '', from: addr(m.from), subject: String(m.subject ?? ''), raw: m,
        });
      }
    } catch (err: any) {
      log(`poll ${who} failed: ${err?.message}`);
    }
  }
}

function localClock(): { date: string; hm: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` };
}

const firedTimers = new Set<string>();
function tickTimers() {
  const { date, hm } = localClock();
  const fire = (key: string, at: string, ev: Event) => {
    if (hm !== at || firedTimers.has(`${key}:${date}`)) return;
    firedTimers.add(`${key}:${date}`);
    void dispatch(ev);
  };
  fire('morning_brief', '07:00', { type: 'timer', who: 'ops', kind: 'morning_brief' });
  fire('cert_sweep', '07:05', { type: 'timer', who: 'ravi', kind: 'cert_sweep' });
}

export function start(port = Number(process.env.PORT) || 3000) {
  process.on('unhandledRejection', (err) => log(`unhandledRejection: ${err}`));
  process.on('uncaughtException', (err) => log(`uncaughtException: ${err?.stack || err}`));

  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, uptime_s: Math.round((Date.now() - startedAt) / 1000), poll: process.env.POLL === '1', recent }, null, 2));
        return;
      }
      if (req.method === 'POST' && req.url?.startsWith('/events')) {
        const raw = await readBody(req);
        if (!verify(req, raw)) {
          log('rejected webhook: bad signature');
          res.writeHead(401).end('bad signature');
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
        let body: any;
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          return log('webhook body is not JSON');
        }
        const deliveryId = String(req.headers['x-webhook-id'] ?? body?.id ?? `${Date.now()}`);
        routeWebhook(body, deliveryId).catch((err) => log(`route failed: ${err?.stack || err}`));
        return;
      }
      res.writeHead(404).end('not found');
    } catch (err: any) {
      log(`request failed: ${err?.stack || err}`);
      if (!res.headersSent) res.writeHead(500).end('error');
    }
  });

  server.listen(port, () => log(`listening on :${port}${process.env.POLL === '1' ? ' (polling inboxes every 15s)' : ''}`));
  setInterval(tickTimers, 60_000);
  if (process.env.POLL === '1') {
    let polling = false;
    setInterval(async () => {
      if (polling) return;
      polling = true;
      await pollInboxes().finally(() => (polling = false));
    }, 15_000);
  }
  return server;
}

// Only listen when run directly, so importing handoff from here never binds a port.
if (process.argv[1] && /server\.ts$/.test(process.argv[1])) start();
