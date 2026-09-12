// Seeds the workspace as Ops. Idempotent; run in stages with --only containers|contacts|visits.
import 'dotenv/config';
import { ambi, atLocal, cal, crm, formatVisit, ids, list, localISO, one, saveIds, sleep } from '../ambi.ts';
import type { Who } from '../types.ts';
import { buildSeed, seriesTimes, SKILLS, VISIT_COLOR, type Person, type SeedData } from './data.ts';

const AS: Who = 'ops';
const WRITE_GAP_MS = 1100;

async function write(args: string[], body?: Record<string, unknown>): Promise<any> {
  const res = await ambi(AS, args, body);
  await sleep(WRITE_GAP_MS);
  return res;
}

// Response-shape assumptions, each isolated here until confirmed against live output.
const idOf = (res: any): string => one(res)?.id ?? one(res)?.calendar?.id ?? one(res)?.form?.id ?? one(res)?.document?.id ?? '';
const nameOf = (x: any): string => String(x?.name ?? x?.title ?? '');
const stagesOf = (p: any): any[] => p?.stages ?? p?.pipeline_stages ?? [];
const emailOf = (c: any): string => String(c?.email ?? c?.emails?.[0] ?? '').toLowerCase();
const noteText = (a: any): string => String(a?.body ?? a?.content ?? a?.subject ?? '');
const formPublicUrl = (f: any): string => f?.public_url ?? f?.url ?? f?.share_url ?? (f?.slug ? `https://app.ambiguous.ai/f/${f.slug}` : '');

const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const otherAgents = (): Who[] => ['sam', 'cara', 'ravi'];
const agentUserId = (w: Who): string => ids.agents?.[w]?.user_id;

async function containers() {
  let calendarId = ids.visits_calendar_id;
  if (!calendarId) {
    calendarId = list(await ambi(AS, ['calendar', 'list'])).find((c) => nameOf(c) === 'Visits')?.id;
    if (!calendarId) calendarId = idOf(await write(['calendar', 'create', '--name', 'Visits', '--timezone', 'America/Los_Angeles']));
    saveIds({ visits_calendar_id: calendarId });
  }
  for (const userId of [ids.owner_user_id, ...otherAgents().map(agentUserId)].filter(Boolean)) {
    try {
      await write(['calendar', 'permissions', 'add', calendarId, '--role', 'editor', '--user-id', userId]);
    } catch (e) {
      console.log(`  calendar share ${userId}: ${(e as Error).message}`);
    }
  }

  let channelId = ids.office_channel_id;
  if (!channelId) {
    channelId = list(await ambi(AS, ['chat', 'channels', 'list'])).find((c) => nameOf(c) === 'office')?.id;
    if (!channelId) {
      const members = [ids.owner_user_id, ...otherAgents().map(agentUserId)].filter(Boolean).join(',');
      try {
        channelId = idOf(await write(['chat', 'channels', 'create', '--type', 'public', '--name', 'office', '--member-ids', members]));
      } catch (e) {
        console.log(`  channel create with members failed, retrying without: ${(e as Error).message}`);
        channelId = idOf(await write(['chat', 'channels', 'create', '--type', 'public', '--name', 'office']));
      }
    }
    saveIds({ office_channel_id: channelId });
  }
  // Joining is harmless when already a member; covers the case where --member-ids was ignored.
  for (const w of otherAgents()) {
    try {
      await ambi(w, ['chat', 'channels', 'join', channelId]);
    } catch (e) {
      console.log(`  ${w} join #office: ${(e as Error).message}`);
    }
  }

  let projectId = ids.office_project_id;
  if (!projectId) {
    projectId = list(await ambi(AS, ['projects', 'list', '--limit', '100'])).find((p) => nameOf(p) === 'Office')?.id;
    if (!projectId) projectId = idOf(await write(['projects', 'create', '--name', 'Office', '--visibility', 'workspace']));
    saveIds({ office_project_id: projectId });
  }

  const pipelineSpecs = [
    { key: 'client_onboarding', name: 'Client Onboarding', stages: ['New request', 'Assessment booked', 'Care plan drafted', 'Active client'] },
    { key: 'hiring', name: 'Hiring', stages: ['Applied', 'Screened', 'Interview booked', 'Offer', 'Active caregiver'] },
  ];
  for (const spec of pipelineSpecs) {
    let found = list(await ambi(AS, ['crm', 'pipelines', 'list'])).find((p) => nameOf(p) === spec.name);
    if (!found) {
      const stages = spec.stages.map((name, sort_order) => ({ name, sort_order }));
      await write(['crm', 'pipelines', 'create', '--name', spec.name, '--stages', JSON.stringify(stages)]);
      found = list(await ambi(AS, ['crm', 'pipelines', 'list'])).find((p) => nameOf(p) === spec.name);
    }
    if (!found) throw new Error(`pipeline ${spec.name} not found after create`);
    const stageIds = Object.fromEntries(stagesOf(found).map((s) => [snake(nameOf(s)), s.id]));
    saveIds({ pipelines: { [spec.key]: { id: found.id, stages: stageIds } } });
  }

  await ensureForms();
  await ensureRulebook();

  saveIds({ email_allowlist: ['+maria@', '+priya@', '+dev@', '+rosa@', '+neha@', '+lena@', '+jordan@'] });
  console.log(`✔︎ containers: calendar ${calendarId}, channel ${channelId}, project ${projectId}, pipelines ${Object.keys(ids.pipelines ?? {}).length}, forms ${Object.keys(ids.forms ?? {}).length}, rulebook ${ids.rulebook_doc_id}`);
}

// Field type names and the options shape (plain string array) are unconfirmed; `forms create --help` does not list them.
const FIELD_TYPE = { text: 'short_text', email: 'email', number: 'number', date: 'date', select: 'select', multi: 'multi_select', long: 'long_text' } as const;
const field = (id: string, type: keyof typeof FIELD_TYPE, label: string, required = false, options?: readonly string[]) =>
  ({ id, type: FIELD_TYPE[type], label, required, ...(options ? { options: [...options] } : {}) });

const FORMS = [
  {
    key: 'request_care',
    title: 'Request care',
    description: 'Tell us about your loved one and we will get back to you within the hour.',
    fields: [
      field('family_name', 'text', 'Your name', true),
      field('family_email', 'email', 'Your email', true),
      field('family_phone', 'text', 'Your phone'),
      field('client_name', 'text', 'Name of the person who needs care', true),
      field('client_age', 'number', 'Their age'),
      field('zip', 'text', 'Zip code', true),
      field('needs', 'multi', 'What help do they need?', true, SKILLS),
      field('days_times', 'long', 'Which days and times?'),
      field('language', 'text', 'Preferred language'),
      field('has_pets', 'select', 'Are there pets in the home?', false, ['yes', 'no']),
      field('smoker', 'select', 'Does anyone smoke in the home?', false, ['yes', 'no']),
      field('gender_pref', 'select', 'Caregiver gender preference', false, ['female', 'male', 'no preference']),
      field('hours_week', 'number', 'About how many hours a week?'),
      field('notes', 'long', 'Anything else we should know?'),
    ],
  },
  {
    key: 'apply',
    title: 'Apply to work with us',
    description: 'Bayside Home Care is hiring caregivers in San Francisco.',
    fields: [
      field('name', 'text', 'Your name', true),
      field('email', 'email', 'Your email', true),
      field('phone', 'text', 'Your phone'),
      field('zip', 'text', 'Zip code'),
      field('cert_type', 'select', 'Certificate', true, ['HHA', 'CNA', 'none']),
      field('cert_expires', 'date', 'Certificate expiry date'),
      field('years_experience', 'number', 'Years of paid caregiving experience'),
      field('skills', 'multi', 'Skills', false, SKILLS),
      field('languages', 'text', 'Languages you speak'),
      field('availability', 'long', 'When can you work?'),
      field('has_car', 'select', 'Do you have a car?', false, ['yes', 'no']),
      field('why', 'long', 'Why do you want to work here?'),
    ],
  },
];

async function ensureForms() {
  for (const spec of FORMS) {
    if (ids.forms?.[spec.key]?.id) continue;
    let form = list(await ambi(AS, ['forms', 'list', '--q', spec.title, '--limit', '50'])).find((f) => nameOf(f) === spec.title);
    if (!form) {
      const res = await write(['forms', 'create', '--title', spec.title, '--description', spec.description, '--fields', JSON.stringify(spec.fields), '--is-published', 'true']);
      form = one(res)?.form ?? one(res);
    }
    if (!form?.is_published) {
      try {
        form = one(await write(['forms', 'publish', form.id]))?.form ?? form;
      } catch (e) {
        console.log(`  publish ${spec.title}: ${(e as Error).message}`);
      }
    }
    saveIds({ forms: { [spec.key]: { id: form.id, slug: form.slug ?? '', public_url: formPublicUrl(form) } } });
  }
}

const RULEBOOK = `# Bayside Home Care — how we do things

## Covering a visit when a caregiver cancels
- A replacement must have every skill the client needs.
- Respect the client's caregiver gender preference and language preference. Language match is a strong plus, not a must, unless the client speaks no English.
- No caregiver with a pet allergy or "not ok with pets" goes to a home with pets. Same for smokers.
- Never book someone who already has a visit that overlaps, and prefer people who stay under 40 hours a week.
- Prefer caregivers who have visited this client before, then the most reliable (fewest call-outs), then closest zip.
- Offer to the top three at once. First clear YES wins. The owner approves before the calendar changes.
- Always tell the family who is coming and when. Always thank the people who said yes but were not needed.

## New client requests
- Every request gets an assessment visit with the owner within two business days, 45 minutes, during 9–5.
- Draft a care plan from what the family told us; mark it DRAFT and say the owner will confirm at the assessment.
- Reply to the family the same hour, warmly, in plain words.

## Hiring
- To move forward, an applicant needs an HHA or CNA certificate that is not expired, or at least one year of paid caregiving experience.
- Applicants outside San Francisco zips (941xx) or with no availability go on hold, not decline.
- We never decline a person automatically. Anything that is not a clear yes becomes a task for the owner.
- Interviews are 30 minutes with the owner within three business days.

## Certifications
- Remind a caregiver 30 days before a certificate expires, again at 7 days, and tell the owner at 7 days.

## Routing at the front desk
- A caregiver saying they cannot make a visit → Sam.
- A family asking for care, or a new client question → Cara.
- A job application or a caregiver paperwork question → Ravi.
- A family asking when the next visit is → answer from the calendar.
- Anything else → a task for the owner, and a short reply to the sender saying the office will follow up.

## Tone
- Write like a kind person at a small local office. First names. Short sentences. No jargon.
`;

async function ensureRulebook() {
  if (ids.rulebook_doc_id) return;
  let docId = list(await ambi(AS, ['docs', 'list', '--type', 'doc', '--limit', '100'])).find((d) => nameOf(d) === 'Agency Rulebook')?.id;
  if (!docId) docId = idOf(await write(['docs', 'create', '--type', 'doc', '--title', 'Agency Rulebook'], { content: RULEBOOK }));
  saveIds({ rulebook_doc_id: docId });
}

async function contactIndex(): Promise<Map<string, any>> {
  return new Map((await crm.all(AS)).map((c) => [emailOf(c), c]));
}

async function ensureContact(index: Map<string, any>, p: Person, props: Record<string, unknown>): Promise<{ id: string; created: boolean }> {
  const existing = index.get(p.email.toLowerCase());
  if (existing) return { id: existing.id, created: false };
  const res = await write([
    'crm', 'contacts', 'create', '--type', 'person', '--name', `${p.first} ${p.last}`, '--first-name', p.first, '--last-name', p.last,
    '--email', p.email, '--title', p.title, '--custom-properties', JSON.stringify(props),
  ]);
  const contact = one(res)?.contact ?? one(res);
  index.set(p.email.toLowerCase(), contact);
  return { id: contact.id, created: true };
}

async function ensureNotes(contactId: string, created: boolean, notes: string[]) {
  if (!notes.length) return 0;
  const have = created ? new Set<string>() : new Set((await crm.activities(AS, contactId, 50)).map(noteText));
  let n = 0;
  for (const text of notes) {
    if (have.has(text)) continue;
    await crm.note(AS, contactId, text);
    await sleep(WRITE_GAP_MS);
    n++;
  }
  return n;
}

async function contacts(data: SeedData) {
  const index = await contactIndex();
  let created = 0;
  let notes = 0;

  for (const c of data.caregivers) {
    const r = await ensureContact(index, c, c.props);
    created += Number(r.created);
    notes += await ensureNotes(r.id, r.created, c.notes);
  }

  const famByKey = new Map(data.families.map((f) => [f.key, f]));
  for (const c of data.clients) {
    const r = await ensureContact(index, c, c.props);
    created += Number(r.created);
    const fam = famByKey.get(c.familyKey)!;
    const fr = await ensureContact(index, fam, { ...fam.props, client_id: r.id });
    created += Number(fr.created);
    const current = index.get(c.email.toLowerCase());
    if (current?.custom_properties?.family_contact_id !== fr.id) {
      // Full property object is sent in case update replaces custom_properties rather than merging.
      const propsWithFamily = { ...c.props, family_contact_id: fr.id };
      await write(['crm', 'contacts', 'update', r.id, '--custom-properties', JSON.stringify(propsWithFamily)]);
      index.set(c.email.toLowerCase(), { ...current, id: r.id, custom_properties: propsWithFamily });
    }
    notes += await ensureNotes(r.id, r.created, c.notes);
  }

  const idFor = (email: string) => index.get(email.toLowerCase())?.id ?? '';
  const [maria, priya, dev, rosa] = data.caregivers;
  saveIds({
    demo: {
      maria_contact_id: idFor(maria.email),
      priya_contact_id: idFor(priya.email),
      dev_contact_id: idFor(dev.email),
      rosa_contact_id: idFor(rosa.email),
      patel_contact_id: idFor(data.clients[0].email),
      neha_contact_id: idFor(data.families[0].email),
    },
  });
  console.log(`✔︎ contacts: ${data.caregivers.length + data.clients.length + data.families.length} expected, ${created} created, ${notes} notes written`);
}

async function visits(data: SeedData) {
  if (!ids.visits_calendar_id) throw new Error('visits_calendar_id missing; run --only containers first');
  const index = await contactIndex();
  const personByKey = new Map<string, Person>([...data.caregivers, ...data.clients].map((p) => [p.key, p]));
  const contactId = (key: string) => index.get(personByKey.get(key)!.email.toLowerCase())?.id;

  // Series created by an earlier run that crashed before saving its id are matched by title.
  const existingTitles = new Map<string, string>(
    list(await ambi(AS, ['calendar', 'events', 'list', '--calendar-id', ids.visits_calendar_id, '--start', '2026-09-14T00:00:00-07:00', '--end', '2026-09-21T00:00:00-07:00', '--limit', '500']))
      .map((e) => [String(e.title ?? ''), String(e.recurring_event_id ?? e.id)]),
  );

  let created = 0;
  for (const s of data.series) {
    const known = ids.visit_series?.[s.key] ?? existingTitles.get(s.title);
    let eventId = known;
    if (!eventId) {
      const clientId = contactId(s.clientKey);
      const caregiverId = contactId(s.caregiverKey);
      if (!clientId || !caregiverId) {
        console.log(`  skip ${s.title}: contact missing (run --only contacts)`);
        continue;
      }
      const { startLocal, endLocal } = seriesTimes(s);
      const ev = await cal.create(AS, {
        title: s.title,
        startAt: localISO(atLocal(s.firstDate, startLocal)),
        endAt: localISO(atLocal(s.firstDate, endLocal)),
        description: formatVisit({ client_id: clientId, caregiver_id: caregiverId, status: 'scheduled' }),
        contactId: clientId,
        color: VISIT_COLOR,
        recurrenceRule: s.rrule,
      });
      eventId = ev?.id ?? ev?.event?.id;
      created++;
      await sleep(WRITE_GAP_MS);
    }
    saveIds({ visit_series: { [s.key]: eventId } });
    if (s.key === `${data.clients[0].key}|${data.caregivers[0].key}`) saveIds({ demo: { patel_series_event_id: eventId } });
  }
  console.log(`✔︎ visits: ${data.series.length} series, ${created} created, Patel series ${ids.demo?.patel_series_event_id}`);
}

async function main() {
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined;
  if (only && !['containers', 'contacts', 'visits'].includes(only)) throw new Error('--only must be containers, contacts, or visits');

  if (!only || only === 'containers') await containers();
  if (only === 'containers') return;
  const demoGmail = process.env.DEMO_GMAIL;
  if (!demoGmail?.includes('@')) throw new Error('DEMO_GMAIL is not set in .env');
  const data = buildSeed(demoGmail);
  if (!only || only === 'contacts') await contacts(data);
  if (!only || only === 'visits') await visits(data);
}

main().catch((e) => {
  console.error(`‼︎ seed failed: ${(e as Error).message}`);
  process.exit(1);
});
