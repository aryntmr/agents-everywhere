import type { Coworker, Event, Who } from '../types.ts';
import { ambi, list, one, ids, TZ, mail, chat, cal, tasks } from '../ambi.ts';
import { askJSON, draft } from '../llm.ts';
import * as people from '../people.ts';

const AS: Who = 'cara';
const SKILLS = ['bathing', 'transfers', 'dementia', 'meals', 'meds', 'companionship', 'driving', 'hoyer', 'mobility', 'overnight'];

export interface CareAnswers {
  family_name: string;
  family_email: string | null;
  family_phone: string | null;
  client_name: string;
  client_age: number | null;
  zip: string | null;
  needs: string[];
  days_times: string | null;
  language: string | null;
  has_pets: string | null;
  smoker: string | null;
  gender_pref: string | null;
  hours_week: number | null;
  notes: string | null;
}

// Fixtures use "DEMO_GMAIL+tag" so no personal address is committed; expand to base+tag@domain.
export function expandDemoEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = /^<?DEMO_GMAIL>?\+([^@\s]+)(@.*)?$/.exec(email.trim());
  if (!m) return email.trim();
  const base = process.env.DEMO_GMAIL;
  if (!base || !base.includes('@')) throw new Error('cara: DEMO_GMAIL must be set to expand ' + email);
  const [local, domain] = base.split('@');
  return `${local.split('+')[0]}+${m[1]}@${domain}`;
}

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || v === '' || Number.isNaN(n) ? null : n;
}

export function normalizeAnswers(raw: Record<string, unknown>): CareAnswers {
  const needsRaw = raw.needs;
  const needs = (Array.isArray(needsRaw) ? needsRaw : String(needsRaw ?? '').split(','))
    .map((n) => String(n).trim().toLowerCase())
    .filter((n) => SKILLS.includes(n));
  return {
    family_name: str(raw.family_name) ?? 'Family',
    family_email: expandDemoEmail(str(raw.family_email)),
    family_phone: str(raw.family_phone),
    client_name: str(raw.client_name) ?? 'New client',
    client_age: num(raw.client_age),
    zip: str(raw.zip),
    needs,
    days_times: str(raw.days_times),
    language: str(raw.language),
    has_pets: str(raw.has_pets),
    smoker: str(raw.smoker),
    gender_pref: str(raw.gender_pref),
    hours_week: num(raw.hours_week),
    notes: str(raw.notes),
  };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0];
const lastName = (name: string) => name.trim().split(/\s+/).slice(-1)[0];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

function laDateParts(d: Date): { ymd: string; weekday: string } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday };
}

// Wall-clock time in America/Los_Angeles as an ISO string with the correct offset for that date.
function laWall(ymd: string, hhmm: string): string {
  const probe = new Date(`${ymd}T12:00:00Z`);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(probe)
    .find((x) => x.type === 'timeZoneName')!.value.replace('GMT', '');
  return `${ymd}T${hhmm}:00${off || '+00:00'}`;
}

function nextBusinessDays(count: number, from = new Date()): string[] {
  const days: string[] = [];
  const cursor = new Date(from.getTime());
  while (days.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const { ymd, weekday } = laDateParts(cursor);
    if (weekday !== 'Sat' && weekday !== 'Sun' && !days.includes(ymd)) days.push(ymd);
  }
  return days;
}

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(iso));
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

function eventStart(ev: any): string | undefined {
  return ev?.start_at ?? ev?.startAt ?? ev?.start?.dateTime ?? ev?.start;
}

function docLink(doc: any): string {
  return doc?.url ?? doc?.link ?? `https://${ids.workspace_domain}/docs/${doc?.id}`;
}

function schedulePhrase(a: CareAnswers): string {
  return a.days_times ?? 'schedule to be confirmed';
}

async function findOrCreateClient(a: CareAnswers, familyId: string): Promise<people.Person> {
  const custom = {
    role: 'client',
    needs: a.needs.join(','),
    preferences: [
      a.gender_pref && a.gender_pref !== 'no preference' ? `${a.gender_pref} caregiver` : null,
      a.language ? `${a.language} speaker preferred` : null,
      a.notes,
    ].filter(Boolean).join('; '),
    has_pets: a.has_pets ?? '',
    smoker: a.smoker ?? '',
    language: a.language ?? '',
    zip: a.zip ?? '',
    hours_week: a.hours_week ?? '',
    family_contact_id: familyId,
    status: 'onboarding',
  };
  const existing = await people.findClientByName(AS, a.client_name);
  const email = existing?.email || `${slug(a.client_name)}@client.bayside.invalid`;
  return people.upsert(AS, { email, name: a.client_name, title: 'Client', custom });
}

async function findOrCreateDeal(clientId: string, title: string): Promise<any> {
  const pipe = ids.pipelines.client_onboarding;
  const existing = list(await ambi(AS, ['crm', 'deals', 'list', '--contact-id', clientId, '--pipeline-id', pipe.id]))
    .find((d: any) => !d.pipeline_id || d.pipeline_id === pipe.id);
  if (existing) return existing;
  return one(await ambi(AS, [
    'crm', 'deals', 'create', '--title', title, '--pipeline-id', pipe.id,
    '--stage-id', pipe.stages.new_request, '--contact-id', clientId, '--amount', '0', '--confirm-zero',
  ]));
}

async function findOrCreateCarePlan(a: CareAnswers, client: people.Person): Promise<{ doc: any; questions: string[] }> {
  const title = `Care Plan — ${a.client_name} (DRAFT)`;
  const docs = list(await ambi(AS, ['docs', 'list', '--type', 'doc', '--limit', '100']));
  const found = docs.find((d: any) => d.title === title);
  if (found) return { doc: found, questions: [] };

  const plan = await askJSON<{ title: string; markdown: string; questions_for_assessment: string[] }>(AS, {
    rulebook: true,
    label: 'care-plan',
    system: `You are Cara, care coordinator at Bayside Home Care. Write a one-page DRAFT care plan from what the family told us, in plain words a family would understand. Sections: About ${a.client_name}; What we'll help with (each need as a short line); Schedule; Things to know at home (pets, language, evening confusion, etc.); Questions for the assessment visit. Do not invent medical facts. Mark clearly that the owner confirms everything at the assessment. Give 3 to 5 questions_for_assessment.`,
    user: JSON.stringify(a, null, 2),
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        markdown: { type: 'string' },
        questions_for_assessment: { type: 'array', items: { type: 'string' } },
      },
    },
  });
  const doc = one(await ambi(AS, ['docs', 'create', '--type', 'doc', '--title', title], { content: plan.markdown }));
  await people.upsert(AS, { email: client.email, name: client.name, custom: { care_plan_doc_id: doc.id } });
  return { doc, questions: plan.questions_for_assessment ?? [] };
}

async function findAssessment(title: string, days: string[]): Promise<any | undefined> {
  const res = await ambi(AS, [
    'calendar', 'events', 'list-by-calendar', ids.visits_calendar_id,
    '--start', laWall(days[0], '00:00'), '--end', laWall(days[days.length - 1], '23:59'),
    '--q', title, '--single-events', 'true',
  ]);
  return list(res).find((e: any) => e.title === title && e.status !== 'cancelled');
}

async function bookSlot(days: string[]): Promise<{ start: string; end: string } | null> {
  for (const day of days) {
    const gap = await cal.firstGap(AS, [ids.owner_user_id], laWall(day, '09:00'), laWall(day, '17:00'), 45);
    if (gap) return gap;
  }
  return null;
}

async function onboard(a: CareAnswers): Promise<void> {
  if (!a.family_email) throw new Error('cara: family_email is required');
  const clientFirst = firstName(a.client_name);
  const familyFirst = firstName(a.family_name);
  const today = new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium' }).format(new Date());

  const family = await people.upsert(AS, {
    email: a.family_email,
    name: a.family_name,
    phone: a.family_phone ?? undefined,
    title: 'Family contact',
    custom: { role: 'family' },
  });
  const client = await findOrCreateClient(a, family.id);
  await people.upsert(AS, { email: a.family_email, name: a.family_name, phone: a.family_phone ?? undefined, title: 'Family contact', custom: { role: 'family', client_id: client.id } });

  const deal = await findOrCreateDeal(client.id, a.client_name);
  const needsLine = a.needs.join(', ') || 'needs to be confirmed';
  await chat.office(AS, `🆕 Cara: new care request for ${a.client_name} (${familyFirst}, family) — ${needsLine}, ${schedulePhrase(a)}.`);

  const days = nextBusinessDays(2);
  const eventTitle = `Assessment — ${lastName(a.client_name)}`;
  const already = await findAssessment(eventTitle, days);

  const { doc, questions } = await findOrCreateCarePlan(a, client);
  const link = docLink(doc);

  if (already) {
    const start = eventStart(already);
    await chat.office(AS, `📅 Cara: assessment for ${a.client_name} already booked${start ? ` ${dayLabel(start)} ${timeLabel(start)}` : ''}. Nothing new to send.`);
    return;
  }

  await people.note(AS, client.id, `Cara: request received via form on ${today}: ${needsLine}; ${schedulePhrase(a)}.`);
  await people.note(AS, family.id, `Cara: requested care for ${clientFirst}.`);
  await ambi(AS, ['crm', 'activities', 'create', '--type', 'note', '--deal-id', deal.id], { body: `Cara: care plan draft ${link}` });

  const slot = await bookSlot(days);
  if (!slot) {
    await tasks.create(AS, {
      title: `Needs a human: book assessment for ${a.client_name}`,
      description: `No free 45-minute slot on ${days.join(' or ')} between 9 and 5. Family: ${a.family_name}, ${a.family_phone ?? a.family_email}.`,
      assigneeId: ids.owner_user_id,
      projectId: ids.office_project_id,
      contactId: client.id,
    });
    await chat.office(AS, `‼️ Cara: no free assessment slot for ${a.client_name} in the next two business days. Task left for the owner.`);
    return;
  }

  const when = `${dayLabel(slot.start)} at ${timeLabel(slot.start)}`;
  await cal.create(AS, {
    calendarId: ids.visits_calendar_id,
    title: eventTitle,
    startAt: slot.start,
    endAt: slot.end,
    attendees: [ids.owner_user_id],
    contactId: client.id,
    location: a.zip ?? undefined,
    description: [
      `Assessment visit for ${a.client_name}.`,
      `Family: ${a.family_name}, ${a.family_phone ?? a.family_email}`,
      `Care plan draft: ${link}`,
      `client_id: ${client.id}`,
      'status: scheduled',
    ].join('\n'),
  });
  await ambi(AS, ['crm', 'deals', 'update', deal.id, '--stage-id', ids.pipelines.client_onboarding.stages.assessment_booked]);

  const markdown = await draft(AS, {
    label: 'family-email',
    system: 'You are Cara at Bayside Home Care. Warm, short, plain words, first names. Under 120 words. Plain text, no subject line, no placeholders. Never say "your request has been processed".',
    user: [
      `Write to ${familyFirst} about care for ${clientFirst} (age ${a.client_age ?? 'unknown'}).`,
      `Assessment visit: ${when}, about 45 minutes, at home (zip ${a.zip ?? 'unknown'}). Our owner comes, meets ${clientFirst}, walks through the home, and confirms the care plan together.`,
      `Needs they asked about: ${needsLine}. Schedule they want: ${schedulePhrase(a)}.`,
      `Family notes, mention one concrete detail by name (for example a pet): ${a.notes ?? 'none'}.`,
      `Ask them to reply if the time does not work. Sign off as "Cara".`,
    ].join('\n'),
  });
  await mail.send(AS, {
    to: a.family_email,
    contactId: family.id,
    subject: `${clientFirst} — assessment visit on ${dayLabel(slot.start)} at ${timeLabel(slot.start)}`,
    markdown,
  });

  await people.note(AS, client.id, `Cara: assessment booked ${when} with the owner; care plan draft created.`);
  await chat.office(AS, `📅 Cara: assessment for ${a.client_name} booked ${when}. ${familyFirst} emailed. Care plan draft ready.`);

  if (questions.length) {
    await tasks.create(AS, {
      title: `Read before assessment: ${a.client_name}`,
      description: `${link}\n\n${questions.map((q) => `- ${q}`).join('\n')}`,
      assigneeId: ids.owner_user_id,
      projectId: ids.office_project_id,
      contactId: client.id,
      dueDate: laDateParts(new Date(slot.start)).ymd,
    });
  }
}

const nullable = (type: string) => ({ type: [type, 'null'] });

async function answersFromEmail(payload: Record<string, unknown>): Promise<CareAnswers> {
  let from = str(payload.from);
  let subject = str(payload.subject);
  let body = str(payload.body);
  if (!body && payload.emailId) {
    const m = await mail.get(AS, String(payload.emailId));
    const msg = m?.data ?? m;
    from = from ?? str(msg?.from?.email ?? msg?.from_email ?? msg?.from);
    subject = subject ?? str(msg?.subject);
    body = str(msg?.body_text ?? msg?.text ?? msg?.body ?? msg?.snippet);
  }
  const extracted = await askJSON<Record<string, unknown>>(AS, {
    label: 'care-email',
    system: `Extract a home care request from an email into the fields given. Fill only what the email says; use null for anything missing. family_email is the sender's address unless the email gives another. needs must only use: ${SKILLS.join(', ')}.`,
    user: `From: ${from ?? 'unknown'}\nSubject: ${subject ?? ''}\n\n${body ?? ''}`,
    schema: {
      type: 'object',
      properties: {
        family_name: nullable('string'),
        family_email: nullable('string'),
        family_phone: nullable('string'),
        client_name: nullable('string'),
        client_age: nullable('number'),
        zip: nullable('string'),
        needs: { type: 'array', items: { type: 'string' } },
        days_times: nullable('string'),
        language: nullable('string'),
        has_pets: nullable('string'),
        smoker: nullable('string'),
        gender_pref: nullable('string'),
        hours_week: nullable('number'),
        notes: nullable('string'),
      },
    },
  });
  return normalizeAnswers(extracted);
}

async function handle(event: Event): Promise<void> {
  if (event.type === 'form') {
    const expected = ids.forms?.request_care?.id;
    const formId = event.formId && event.formId !== '<from config>' ? event.formId : null;
    if (formId && expected && formId !== expected) {
      console.log(`[cara] ignoring form ${formId}`);
      return;
    }
    await onboard(normalizeAnswers(event.answers));
    return;
  }
  if (event.type === 'handoff' && event.kind === 'care_request_email') {
    const a = await answersFromEmail(event.payload);
    if (!a.family_email) {
      await tasks.create(AS, {
        title: `Needs a human: care request from ${a.family_name} has no reply address`,
        description: `Cara could not find an email to reply to.\nClient: ${a.client_name}\nPhone: ${a.family_phone ?? 'none'}\nNeeds: ${a.needs.join(', ') || 'unknown'}\nNotes: ${a.notes ?? ''}`,
        assigneeId: ids.owner_user_id,
        projectId: ids.office_project_id,
      });
      await chat.office(AS, `‼️ Cara: care request for ${a.client_name} came in without an email address. Task left for the owner.`);
      return;
    }
    await onboard(a);
    return;
  }
  console.log(`[cara] no handler for ${event.type}${'kind' in event ? `:${event.kind}` : ''}`);
}

export const cara: Coworker = { who: AS, handle };
export default cara;
