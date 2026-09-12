import { ambi, cal, chat, ids, list, localISO, mail, parseVisit, tasks } from '../ambi.ts';
import * as llm from '../llm.ts';
import * as people from '../people.ts';
import { handoff, hasCoworker } from '../registry.ts';
import type { Coworker, Event, Who } from '../types.ts';

type Kind = 'callout' | 'care_request' | 'application' | 'next_visit_question' | 'availability_change' | 'other';
interface Classification { kind: Kind; summary: string; urgency: 'now' | 'today' | 'this_week' }
interface Email { id: string; from: string; subject: string; body: string; threadId?: string; isFixture: boolean }

const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'summary', 'urgency'],
  properties: {
    kind: { type: 'string', enum: ['callout', 'care_request', 'application', 'next_visit_question', 'availability_change', 'other'] },
    summary: { type: 'string', description: 'one short line, plain words, e.g. "call-out from Maria (Patel, today 2-6pm)"' },
    urgency: { type: 'string', enum: ['now', 'today', 'this_week'] },
  },
};

function addr(v: any): string {
  if (!v) return '';
  if (Array.isArray(v)) return addr(v[0]);
  const s = typeof v === 'string' ? v : v.email || v.address || '';
  const m = /<([^>]+)>/.exec(s);
  return (m ? m[1] : s).trim().toLowerCase();
}

// Unconfirmed: field names of `mail get --detail full`. Fixtures carry from/subject/body in `raw`.
async function readEmail(ev: Extract<Event, { type: 'email' }>): Promise<Email> {
  const raw: any = ev.raw ?? {};
  if (ev.emailId.startsWith('fixture-')) {
    return { id: ev.emailId, from: addr(raw.from ?? ev.from), subject: raw.subject ?? ev.subject, body: raw.body ?? '', isFixture: true };
  }
  const res = await mail.get('ops', ev.emailId);
  const m = res?.email ?? res?.data ?? res ?? {};
  return {
    id: ev.emailId,
    from: addr(m.from ?? ev.from),
    subject: String(m.subject ?? ev.subject ?? ''),
    body: String(m.body_markdown ?? m.markdown ?? m.body ?? m.body_text ?? m.text ?? m.preview ?? ''),
    threadId: m.thread_id ?? m.threadId,
    isFixture: false,
  };
}

async function reply(email: Email, markdown: string) {
  await mail.send('ops', {
    to: email.from,
    subject: email.subject.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject}`,
    markdown,
    ...(email.isFixture ? {} : { inReplyTo: email.id, threadId: email.threadId }),
  });
}

async function ownerTask(email: Email, summary: string) {
  await tasks.create('ops', {
    title: `Needs a human: ${summary}`,
    description: `Email from ${email.from}\nSubject: ${email.subject}\nEmail id: ${email.id}\n\n${email.body}`,
    assigneeId: ids.owner_user_id,
    priority: 'medium',
    projectId: ids.office_project_id,
  });
  await reply(email, 'Thanks for writing in. Got it, someone from the office will get back to you today.');
}

async function routeTo(to: Who, kind: string, email: Email, c: Classification) {
  if (!hasCoworker(to)) {
    console.log(`[ops] ${to} is not available on this branch, falling back to an owner task`);
    return ownerTask(email, c.summary);
  }
  await handoff(to, {
    from: 'ops',
    kind,
    payload: { emailId: email.id, from: email.from, subject: email.subject, body: email.body, summary: c.summary, urgency: c.urgency },
  });
}

function dayOffset(days: number): string {
  const d = new Date(Date.now() + days * 86400_000);
  return localISO(d).slice(0, 10);
}

function lastName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/);
  return parts[parts.length - 1] || '';
}

async function answerNextVisit(email: Email, person: any, c: Classification) {
  const clientId = person?.custom?.client_id ?? (person?.role === 'client' ? person.id : undefined);
  const client = clientId ? await people.get('ops', clientId) : undefined;
  if (!client) return ownerTask(email, c.summary);
  const last = lastName(client.name);
  for (let i = 0; i < 7; i++) {
    const visits = (await cal.onDay('ops', dayOffset(i))).filter(
      (v) => v.contactId === client.id || parseVisit(v.description ?? '').client_id === client.id || v.title.includes(`— ${last} —`),
    );
    const v = visits.sort((a, b) => String(a.start).localeCompare(String(b.start)))[0];
    if (!v) continue;
    const when = new Date(v.start).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const caregiver = v.title.split('—').pop()?.replace('(covering)', '').trim();
    await reply(email, `Hi ${person?.firstName || 'there'},\n\n${client.firstName || client.name}'s next visit is ${when}${caregiver ? ` with ${caregiver}` : ''}.\n\nThe Bayside office`);
    await people.note('ops', client.id, `Ops: told ${person?.name || email.from} the next visit is ${when}.`);
    return;
  }
  await reply(email, `Hi ${person?.firstName || 'there'},\n\nI don't see a visit for ${client.firstName || client.name} in the next week. Someone from the office will check and get back to you today.`);
  await ownerTask(email, c.summary);
}

async function updateAvailability(email: Email, person: any, c: Classification) {
  if (!person || person.role !== 'caregiver') return ownerTask(email, c.summary);
  const { availability } = await llm.askJSON<{ availability: string }>('ops', {
    system: 'Rewrite the caregiver\'s new weekly availability in the format "Mon-Fri 08:00-18:00; Sat 08:00-14:00". Use their current availability for days they did not mention.',
    user: `Current availability: ${person.custom?.availability ?? 'unknown'}\n\nEmail:\n${email.body}`,
    schema: { type: 'object', additionalProperties: false, required: ['availability'], properties: { availability: { type: 'string' } } },
  });
  await ambi('ops', ['crm', 'contacts', 'update', person.id, '--custom-properties', JSON.stringify({ ...person.custom, availability })]);
  await people.note('ops', person.id, `Ops: availability updated to "${availability}" from their email.`);
  await reply(email, `Hi ${person.firstName || 'there'},\n\nUpdated, thanks. We have you down as: ${availability}.\n\nThe Bayside office`);
}

// Fallback when no model key is set or the model call fails, so a call-out still reaches Sam.
function classifyByKeywords(email: Email, person: any): Classification {
  const text = `${email.subject}\n${email.body}`.toLowerCase();
  const who = person?.name || email.from;
  const has = (re: RegExp) => re.test(text);
  if ((person?.role === 'caregiver' || !person) && has(/can'?t make|cannot make|can't come|call(ing)? out|\bsick\b|won'?t (make|be able)|unable to (make|come|work)|cover my|family emergency/))
    return { kind: 'callout', summary: `call-out from ${who}`, urgency: 'now' };
  if (person?.role === 'caregiver' && has(/availability|my hours|days i can|can now work|no longer (work|available)/))
    return { kind: 'availability_change', summary: `availability change from ${who}`, urgency: 'this_week' };
  if (has(/next visit|when is .*(visit|coming)|who is coming/))
    return { kind: 'next_visit_question', summary: `next visit question from ${who}`, urgency: 'today' };
  if (has(/\bapply\b|application|job|hiring|resume|\bhha\b|\bcna\b/))
    return { kind: 'application', summary: `job inquiry from ${who}`, urgency: 'this_week' };
  if (has(/need (some )?care|looking for (a )?(care|caregiver)|home care for|care for my/))
    return { kind: 'care_request', summary: `care request from ${who}`, urgency: 'today' };
  return { kind: 'other', summary: `email from ${who}: ${email.subject}`, urgency: 'today' };
}

async function handleEmail(ev: Extract<Event, { type: 'email' }>) {
  const email = await readEmail(ev);
  const person = email.from ? await people.findByEmail('ops', email.from).catch(() => undefined) : undefined;

  const c = await llm.askJSON<Classification>('ops', {
    system:
      'You are Ops, the front desk of Bayside Home Care. Classify one incoming email using the "Routing at the front desk" rules. ' +
      'callout = a caregiver cannot make a visit; care_request = a family asking for care or a new client question; ' +
      'application = a job application or caregiver paperwork question; next_visit_question = a family asking when the next visit is; ' +
      'availability_change = a caregiver changing the days or hours they can work; other = anything else.',
    user: `From: ${email.from}${person ? ` (${person.name}, ${person.role})` : ' (unknown sender)'}\nSubject: ${email.subject}\n\n${email.body}`,
    schema: CLASSIFY_SCHEMA,
    rulebook: true,
  }).catch((err: any) => {
    console.log(`[ops] llm classify failed, using keyword rules: ${err?.message}`);
    return classifyByKeywords(email, person);
  });

  const next: Record<Kind, string> = {
    callout: 'handing to Sam',
    care_request: 'handing to Cara',
    application: 'handing to Ravi',
    next_visit_question: 'answering from the calendar',
    availability_change: 'updating their availability',
    other: 'task for the owner',
  };
  await chat.office('ops', `📨 Ops: ${c.summary} → ${next[c.kind]}`);
  if (!email.isFixture) await mail.mark('ops', email.id, true);

  switch (c.kind) {
    case 'callout': return routeTo('sam', 'callout', email, c);
    case 'care_request': return routeTo('cara', 'care_request_email', email, c);
    case 'application': return routeTo('ravi', 'application_email', email, c);
    case 'next_visit_question': return answerNextVisit(email, person, c);
    case 'availability_change': return updateAvailability(email, person, c);
    default: return ownerTask(email, c.summary);
  }
}

async function count(label: string, fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (err: any) {
    console.log(`[ops] morning brief: ${label} failed: ${err?.message}`);
    return 0;
  }
}

async function morningBrief() {
  const today = dayOffset(0);
  let visitCount = 0;
  const needsCover: string[] = [];
  try {
    const visits = (await cal.onDay('ops', today)).filter((v) => /^(Visit|NEEDS COVER)/.test(v.title));
    visitCount = visits.length;
    for (const v of visits) {
      if (parseVisit(v.description ?? '').status === 'needs_cover' || v.title.startsWith('NEEDS COVER')) {
        const client = v.title.split('—')[2]?.trim() ?? v.title;
        const time = new Date(v.start).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric' });
        needsCover.push(`${client} ${time}`);
      }
    }
  } catch (err: any) {
    console.log(`[ops] morning brief: calendar failed: ${err?.message}`);
  }

  const approvalsWaiting = await count('approvals', async () => {
    const res = await ambi('ops', ['tasks', 'list', '--assignee-id', ids.owner_user_id, '--q', 'APPROVE:']);
    return list(res).filter((t: any) => String(t.title ?? '').startsWith('APPROVE:') && !['done', 'cancelled'].includes(t.status)).length;
  });
  const dealsIn = (stageId?: string) => async () => (stageId ? list(await ambi('ops', ['crm', 'deals', 'list', '--stage-id', stageId])).length : 0);
  const newRequests = await count('new requests', dealsIn(ids.pipelines?.client_onboarding?.stages?.new_request));
  const applicants = await count('applicants', dealsIn(ids.pipelines?.hiring?.stages?.applied));
  const expiring = await count('certificates', async () => {
    const soon = dayOffset(30);
    return (await people.byRole('ops', 'caregiver')).filter((p: any) => {
      const exp = String(p.custom?.cert_expires ?? '');
      return exp && exp >= today && exp <= soon;
    }).length;
  });

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const line =
    `☀️ Ops: Today — ${plural(visitCount, 'visit', 'visits')}, ${needsCover.length} needs cover${needsCover.length ? ` (${needsCover.join(', ')})` : ''}, ` +
    `${plural(approvalsWaiting, 'approval', 'approvals')} waiting, ${plural(newRequests, 'new client request', 'new client requests')}, ` +
    `${plural(applicants, 'new applicant', 'new applicants')}, ${plural(expiring, 'certificate', 'certificates')} expiring this month.`;
  await chat.office('ops', line);
  if (ids.owner_email) await mail.send('ops', { to: ids.owner_email, subject: `Morning brief — ${today}`, markdown: line.replace(/^☀️ Ops: /, '') });
}

export const ops: Coworker = {
  who: 'ops',
  async handle(ev: Event) {
    switch (ev.type) {
      case 'email': return handleEmail(ev);
      case 'timer': if (ev.kind === 'morning_brief') return morningBrief(); return;
      case 'handoff':
        if (ev.kind === 'narrate' && ev.payload?.line) return chat.office('ops', String(ev.payload.line));
        console.log(`[ops] ignoring handoff kind ${ev.kind} from ${ev.from}`);
        return;
      default:
        console.log(`[ops] ignoring ${ev.type} event`);
    }
  },
};

export default ops;
