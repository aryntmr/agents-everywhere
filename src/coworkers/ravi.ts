// Ravi — people: hiring and certifications. Owner: Akshat (lane 3).
// Spine: apply form -> applicant record + Hiring deal -> screen against the Rulebook
// -> advance (book interview) | hold (kind email) | owner_review (task for the owner).
// Plus a daily certification sweep. Ravi never rejects anyone.
import type { Coworker, Event, Who } from '../types.ts';
import { TZ, ambi, atLocal, cal, chat, crm, ids, list, localDate, localISO, localWeekday, mail, one, tasks, toFlags } from '../ambi.ts';
import * as llm from '../llm.ts';
import * as people from '../people.ts';
import * as rulebook from '../rulebook.ts';

const AS: Who = 'ravi';
const SKILLS = ['bathing', 'transfers', 'dementia', 'meals', 'meds', 'companionship', 'driving', 'hoyer', 'mobility', 'overnight'];

// ---------------------------------------------------------------------------
// Form answers: the raw event may key answers by field id, by label, or ship a
// list of {id,label,value}. server.ts is meant to normalize; until it does (and
// as a belt against label drift) we normalize here too. Told Adamay.
// ---------------------------------------------------------------------------

const ALIASES: Record<string, string[]> = {
  name: ['name', 'full name', 'your name'],
  email: ['email', 'email address'],
  phone: ['phone', 'phone number', 'mobile'],
  zip: ['zip', 'zip code', 'postal code'],
  cert_type: ['cert_type', 'certification', 'certificate', 'certificate type', 'cert type'],
  cert_expires: ['cert_expires', 'certificate expiry', 'certificate expires', 'expiry date', 'expires'],
  years_experience: ['years_experience', 'years of experience', 'experience', 'years'],
  skills: ['skills', 'what can you do', 'care skills'],
  languages: ['languages', 'languages spoken'],
  availability: ['availability', 'when can you work', 'hours'],
  has_car: ['has_car', 'do you have a car', 'car', 'drive'],
  why: ['why', 'why do you want to work here', 'tell us about yourself'],
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');

// norm() turns "cert_expires" into "cert expires", so the alias lists have to be
// normalized too or the underscored spellings never match and the answer is
// silently dropped.
const BY_ALIAS = new Map<string, string>(
  Object.entries(ALIASES).flatMap(([canon, aliases]) => [canon, ...aliases].map((a) => [norm(a), canon] as const)),
);

function canonicalKey(k: unknown): string | null {
  return BY_ALIAS.get(norm(k)) ?? null;
}

/** Demo inboxes are Gmail plus-addresses on one account; fixtures carry a placeholder. */
function resolveEmail(v: string): string {
  const base = process.env.DEMO_GMAIL ?? '';
  if (!v.includes('{{DEMO_GMAIL}}')) return v;
  if (!base) return v.replace('{{DEMO_GMAIL}}', 'demo').replace(/@gmail\.com$/, '@example.com');
  const [local, domain] = base.split('@');
  return v.replace('{{DEMO_GMAIL}}@gmail.com', base).replace('{{DEMO_GMAIL}}', local).replace(/@gmail\.com$/, `@${domain ?? 'gmail.com'}`);
}

export function normalizeAnswers(raw: unknown): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const put = (k: unknown, v: unknown) => {
    const canon = canonicalKey(k);
    if (canon && (flat[canon] === undefined || flat[canon] === '')) flat[canon] = v;
  };
  if (Array.isArray(raw)) {
    for (const row of raw as any[]) {
      if (!row || typeof row !== 'object') continue;
      put(row.id ?? row.field_id ?? row.key ?? row.label ?? row.question, row.value ?? row.answer ?? row.response);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && ('value' in (v as any) || 'answer' in (v as any))) {
        put((v as any).id ?? (v as any).label ?? k, (v as any).value ?? (v as any).answer);
      } else put(k, v);
    }
  }
  return flat;
}

export type Application = {
  name: string; email: string; phone: string; zip: string;
  cert_type: string; cert_expires: string; years_experience: number;
  skills: string[]; languages: string; availability: string; has_car: string; why: string;
};

const csv = (v: unknown): string[] =>
  (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean);

export function toApplication(answers: Record<string, unknown>): Application {
  const a = normalizeAnswers(answers);
  const skills = csv(a.skills).map((s) => s.toLowerCase()).filter((s) => SKILLS.includes(s));
  const cert = String(a.cert_type ?? '').trim().toUpperCase();
  return {
    name: String(a.name ?? '').trim(),
    email: resolveEmail(String(a.email ?? '').trim()),
    phone: String(a.phone ?? '').trim(),
    zip: String(a.zip ?? '').trim(),
    cert_type: cert === 'NONE' || cert === '' ? 'none' : cert,
    cert_expires: String(a.cert_expires ?? '').trim().slice(0, 10),
    years_experience: Number.parseFloat(String(a.years_experience ?? '0')) || 0,
    skills,
    languages: csv(a.languages).join(', '),
    availability: String(a.availability ?? '').trim(),
    has_car: /^y/i.test(String(a.has_car ?? '')) ? 'yes' : 'no',
    why: String(a.why ?? '').trim(),
  };
}

// ---------------------------------------------------------------------------
// Hiring pipeline ids. config/ids.json is authoritative once Adamay's seed
// lands (GATE 2); until then resolve by name off the live workspace so this
// lane is never blocked. Same code path either way.
// ---------------------------------------------------------------------------

type Hiring = { id: string; stages: Record<string, string> };
let hiringCache: Hiring | null = null;

const stageKey = (name: string) => norm(name).replace(/ /g, '_');

export async function hiring(): Promise<Hiring> {
  if (hiringCache) return hiringCache;
  const configured = ids.pipelines?.hiring;
  if (configured?.id && configured.stages?.applied) {
    hiringCache = { id: configured.id, stages: { ...configured.stages } };
    return hiringCache;
  }
  const rows = list(await ambi(AS, ['crm', 'pipelines', 'list']));
  const p = rows.find((r: any) => norm(r?.name) === 'hiring');
  if (!p) throw new Error('ravi: no Hiring pipeline yet — waiting on GATE 2 (seed)');
  const stages: Record<string, string> = {};
  for (const s of list<any>(p.stages ?? p.pipeline_stages ?? [])) stages[stageKey(s.name)] = s.id;
  hiringCache = { id: p.id, stages };
  console.log(`[ravi] hiring pipeline resolved from workspace: ${p.id}`);
  return hiringCache;
}

async function stageId(key: string): Promise<string | undefined> {
  return (await hiring()).stages[key];
}

/** Find-before-create: one open deal per applicant in the Hiring pipeline. */
async function upsertDeal(contactId: string, title: string): Promise<any> {
  const h = await hiring();
  const existing = list(await ambi(AS, ['crm', 'deals', 'list', '--pipeline-id', h.id, '--contact-id', contactId, '--limit', '20']))
    .find((d: any) => String(d?.title ?? '').trim() === title || d?.contact_id === contactId);
  if (existing) {
    console.log(`[ravi] deal exists for ${title} → ${existing.id}`);
    return existing;
  }
  return one(await ambi(AS, ['crm', 'deals', 'create', ...toFlags({
    title, pipelineId: h.id, stageId: h.stages.applied, contactId, status: 'open',
  })]));
}

async function moveDeal(dealId: string, key: string): Promise<void> {
  const sid = await stageId(key);
  if (!sid) return console.log(`[ravi] no stage id for "${key}" — leaving deal where it is`);
  await ambi(AS, ['crm', 'deals', 'update', dealId, '--stage-id', sid]);
}

// ---------------------------------------------------------------------------
// Step 2 — screening. Deterministic pre-checks first so the reasons are facts,
// then the model applies the Rulebook. Never a decline.
// ---------------------------------------------------------------------------

export type Screening = {
  decision: 'advance' | 'hold' | 'owner_review';
  reasons: string[];
  interview_questions: string[];
  note_for_owner: string;
};

const SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['advance', 'hold', 'owner_review'] },
    reasons: { type: 'array', items: { type: 'string' } },
    interview_questions: { type: 'array', items: { type: 'string' } },
    note_for_owner: { type: 'string' },
  },
} as const;

const SYSTEM = `You are Ravi, who handles hiring at Bayside Home Care, a small home care agency in San Francisco.
Apply the Rulebook's Hiring rules to this application.
'advance' only when the rules are clearly met (a valid unexpired HHA or CNA certificate, or 1+ year of paid caregiving experience; a San Francisco zip starting 941; some stated availability).
'hold' when a rule is not met but the person could qualify later — say plainly what would change it.
'owner_review' for anything unclear, contradictory, or that a person should look at.
Never reject anyone. Reasons must be 1-3 short facts taken from the application, not opinions.
Write exactly three interview questions tailored to what this specific person said — reference their own words, not generic caregiving questions.
note_for_owner is one plain line.`;

// The Rulebook doc is the policy. If Ambiguous is unreachable we still screen
// against the same rules rather than dropping the model entirely — a workspace
// outage must not silently turn Ravi into an if-statement.
const HIRING_FALLBACK = `## Hiring
- To move forward, an applicant needs an HHA or CNA certificate that is not expired, or at least one year of paid caregiving experience.
- Applicants outside San Francisco zips (941xx) or with no availability go on hold, not decline.
- We never decline a person automatically. Anything that is not a clear yes becomes a task for the owner.
- Interviews are 30 minutes with the owner within three business days.

## Tone
- Write like a kind person at a small local office. First names. Short sentences. No jargon.`;

// Each failed fetch costs ~10s against an unhealthy workspace, so remember the
// failure for a minute instead of stalling every screening.
let rulebookDownUntil = 0;

async function hiringRules(): Promise<string> {
  if (Date.now() < rulebookDownUntil) return HIRING_FALLBACK;
  try {
    const text = await rulebook.text(AS);
    if (text.trim()) return text;
    console.log('[ravi] rulebook doc is empty — using the built-in hiring rules');
  } catch (err: any) {
    console.log(`[ravi] rulebook unreachable (${err?.message ?? err}) — using the built-in hiring rules for 60s`);
  }
  rulebookDownUntil = Date.now() + 60_000;
  return HIRING_FALLBACK;
}

/** Facts checked in code, handed to the model so it cannot contradict them. */
type Forced = 'hold' | 'owner_review' | null;

/** A hold is a rule that is definitely not met; owner_review is a rule we cannot check. */
function stricter(a: Forced, b: Forced): Forced {
  if (a === 'hold' || b === 'hold') return 'hold';
  return a ?? b;
}

function precheck(a: Application): { facts: string[]; forced: Forced } {
  const facts: string[] = [];
  let forced: Forced = null;
  const hasCert = a.cert_type === 'HHA' || a.cert_type === 'CNA';
  const expired = Boolean(a.cert_expires) && a.cert_expires < localDate(new Date());
  // A certificate with no readable expiry date is not evidence of a current one.
  const unverifiable = hasCert && !/^\d{4}-\d{2}-\d{2}$/.test(a.cert_expires);
  const certOk = hasCert && !expired && !unverifiable;

  if (!hasCert) facts.push('No HHA or CNA certificate listed.');
  else if (expired) {
    facts.push(`${a.cert_type} certificate expired on ${a.cert_expires}.`);
    forced = 'hold';
  } else if (unverifiable) {
    facts.push(`${a.cert_type} certificate claimed but no expiry date given, so we cannot confirm it is current.`);
  } else facts.push(`${a.cert_type} certificate valid until ${a.cert_expires}.`);

  facts.push(`${a.years_experience} year${a.years_experience === 1 ? '' : 's'} of paid caregiving experience.`);

  if (!a.zip.startsWith('941')) {
    facts.push(`Zip ${a.zip || '(blank)'} is outside San Francisco (941xx).`);
    forced = stricter(forced, 'hold');
  } else facts.push(`Zip ${a.zip} is in San Francisco.`);

  if (!a.availability) {
    facts.push('No availability given.');
    forced = stricter(forced, 'hold');
  }
  // Neither route to a clear yes is satisfied. If the only thing missing is a
  // date we could not read, that is the owner's call, not a hold.
  if (!certOk && a.years_experience < 1) forced = stricter(forced, unverifiable ? 'owner_review' : 'hold');
  return { facts, forced };
}

/** No model key yet (Adamay is chasing one) — rules-only stand-in so the spine runs. */
function fallbackScreening(a: Application, facts: string[], forced: Forced): Screening {
  const hasCert = (a.cert_type === 'HHA' || a.cert_type === 'CNA') && (!a.cert_expires || a.cert_expires >= localDate(new Date()));
  const decision: Screening['decision'] = forced ?? (hasCert || a.years_experience >= 1 ? 'advance' : 'owner_review');
  const first = a.name.split(' ')[0] || 'there';
  return {
    decision,
    reasons: facts.slice(0, 3),
    interview_questions: [
      a.why ? `You wrote: "${a.why.slice(0, 90)}" — tell me more about that.` : `What draws you to home care, ${first}?`,
      a.skills.length ? `You listed ${a.skills.slice(0, 3).join(', ')}. Walk me through a recent time you used ${a.skills[0]}.` : 'Which parts of personal care are you most confident with?',
      a.availability ? `Your availability is ${a.availability}. How firm is that week to week?` : 'What hours could you realistically commit to each week?',
    ],
    note_for_owner: `${a.name}: ${facts[0] ?? 'application received'} — screened without a model key, please sanity-check.`,
  };
}

export async function screen(a: Application): Promise<Screening> {
  const { facts, forced } = precheck(a);
  const user = [
    `Application:`,
    JSON.stringify({ ...a, why: a.why }, null, 2),
    ``,
    `Facts already checked in code (do not contradict these):`,
    ...facts.map((f) => `- ${f}`),
    forced === 'hold' ? `\nThese facts mean the decision cannot be 'advance'.`
      : forced === 'owner_review' ? `\nA rule here cannot be checked from the application alone, so this is not a clear yes and the decision cannot be 'advance'.`
      : '',
  ].join('\n');

  let out: Screening;
  try {
    out = await llm.askJSON<Screening>(AS, { system: `Rulebook:\n${await hiringRules()}\n\n${SYSTEM}`, user, schema: SCHEMA as any, label: 'screen' });
  } catch (err: any) {
    console.log(`[ravi] llm unavailable (${err?.message ?? err}) — rules-only screening`);
    return fallbackScreening(a, facts, forced);
  }
  if (forced && out.decision === 'advance') out.decision = forced;
  if (!['advance', 'hold', 'owner_review'].includes(out.decision)) out.decision = 'owner_review';
  if (!out.reasons?.length) out.reasons = facts.slice(0, 3);
  if (!out.interview_questions?.length) out.interview_questions = fallbackScreening(a, facts, forced).interview_questions;
  out.interview_questions = out.interview_questions.slice(0, 3);
  return out;
}

// ---------------------------------------------------------------------------
// Step 1 + 2 wiring
// ---------------------------------------------------------------------------

async function onApplication(ev: Extract<Event, { type: 'form' }>): Promise<void> {
  const a = toApplication(ev.answers);
  if (!a.email || !a.name) throw new Error(`ravi: application has no name/email (answers: ${JSON.stringify(ev.answers).slice(0, 200)})`);

  // Step 1 — record and card
  const person = await people.upsert(AS, {
    email: a.email,
    name: a.name,
    phone: a.phone,
    title: 'Applicant',
    custom: {
      role: 'applicant', cert_type: a.cert_type, cert_expires: a.cert_expires,
      years_experience: a.years_experience, skills: a.skills.join(','), languages: a.languages,
      has_car: a.has_car, zip: a.zip, availability: a.availability,
    },
  });
  const deal = await upsertDeal(person.id, a.name);
  await crm.note(AS, person.id, `Ravi: application received via form on ${localDate(new Date())}.`);

  const badge = [a.cert_type !== 'none' ? a.cert_type : null, `${a.years_experience} yrs`, a.languages.split(', ')[1]]
    .filter(Boolean).join(', ');
  await chat.office(AS, `📨 Ravi: new application from ${a.name} (${badge}). Screening…`);

  // Step 2 — screen
  const s = await screen(a);
  await crm.note(AS, person.id, `Ravi: screened → ${s.decision}: ${s.reasons.join(' ')}`);
  await moveDeal(deal.id, 'screened');
  console.log(`[ravi] ${a.name} → ${s.decision}`);

  await route(a, person, deal, s);
}

// ---------------------------------------------------------------------------
// Steps 3-5 — the three endings. Every one of them writes to the person.
// ---------------------------------------------------------------------------

// Demo address; override with config/ids.json -> office_address.
const OFFICE = ids.office_address ?? '1490 Ocean Ave, San Francisco';
const SIGNOFF = 'Ravi\nBayside Home Care';

const TEXT_BAR = `You are Ravi, who handles hiring at Bayside Home Care, a small home care agency in San Francisco.
Write a short email to someone who is hoping for a job here. Under 100 words.
Warm, plain, specific. First names. Short sentences. Include one concrete detail from their own application so it is obvious a person read it.
No corporate voice, no "your application has been processed", no bullet lists, no subject line, no placeholders.
Sign off with just "${SIGNOFF}".`;

async function write(user: string, fallback: string, label: string): Promise<string> {
  try {
    return await llm.draft(AS, { system: TEXT_BAR, user, label });
  } catch (err: any) {
    console.log(`[ravi] llm unavailable (${err?.message ?? err}) — template email`);
    return fallback;
  }
}

/** Next three business days, 09:00-17:00 local. */
function interviewWindow(): { startISO: string; endISO: string } {
  const now = new Date();
  const start = new Date(Math.max(now.getTime(), atLocal(localDate(now), '09:00').getTime()));
  let end = new Date(start);
  for (let days = 0; days < 3; ) {
    end = new Date(end.getTime() + 86_400_000);
    if (!['Sat', 'Sun'].includes(localWeekday(end))) days++;
  }
  return { startISO: localISO(start), endISO: localISO(atLocal(localDate(end), '17:00')) };
}

/** "Tue 16 Sep, 10:30 am" */
function when(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d).toLowerCase().replace(' ', ' ');
  return `${day}, ${time}`;
}


/** Find-before-create so a repeated fixture never double-books. */
async function existingInterview(title: string, w: { startISO: string; endISO: string }): Promise<any | null> {
  const rows = list(await ambi(AS, ['calendar', 'events', 'list', ...toFlags({
    calendarId: ids.visits_calendar_id, q: title, start: w.startISO, end: w.endISO, singleEvents: 'true', limit: 50,
  })]));
  return rows.find((e: any) => String(e?.title ?? '').trim() === title) ?? null;
}

async function findTask(title: string): Promise<any | null> {
  const rows = list(await ambi(AS, ['tasks', 'list', ...toFlags({
    q: title, projectId: ids.office_project_id, status: 'todo,in_progress,blocked', limit: 20,
  })]));
  return rows.find((t: any) => String(t?.title ?? '').trim() === title) ?? null;
}

// --- Step 3 — advance: book the interview -----------------------------------

async function advance(a: Application, person: people.Person, deal: any, s: Screening): Promise<void> {
  const title = `Interview — ${a.name}`;
  const w = interviewWindow();
  const first = a.name.split(' ')[0] || 'there';

  let event = await existingInterview(title, w);
  let slotStart: string | undefined;
  if (!event) {
    const slot = await cal.firstGap(AS, [ids.owner_user_id], w.startISO, w.endISO, 30);
    if (!slot) {
      console.log('[ravi] no free 30-minute slot in the next three business days — handing to the owner');
      return ownerReview(a, person, deal, { ...s, note_for_owner: 'No free interview slot in the next three business days. Please pick a time.' });
    }
    slotStart = slot.start;
    event = await cal.create(AS, {
      calendarId: ids.visits_calendar_id,
      title,
      startAt: slot.start,
      endAt: slot.end,
      attendees: [ids.owner_user_id],
      contactId: person.id,
      description: [
        'Interview.',
        'Questions:',
        ...s.interview_questions.map((q) => `- ${q}`),
        `contact_id: ${person.id}`,
        'status: scheduled',
      ].join('\n'),
    });
  }
  // The create response may wrap the event; the slot we asked for is the fallback so when() never gets undefined.
  const startAt = event.start_at ?? event.event?.start_at ?? event.start?.dateTime ?? slotStart ?? event.start;
  const slotLabel = when(startAt);

  await moveDeal(deal.id, 'interview_booked');

  const warm = s.reasons[0] ?? a.why.slice(0, 120);
  const body = await write(
    [
      `Applicant: ${a.name} (first name ${first}).`,
      `They wrote: "${a.why}"`,
      `Why we liked it: ${warm}`,
      `Invite them to a 30-minute interview with Freddie, our owner, on ${slotLabel}, at ${OFFICE}.`,
      `Ask them to bring their ${a.cert_type !== 'none' ? a.cert_type + ' certificate' : 'certificate'} and photo ID.`,
      `Tell them to reply if that time does not work.`,
    ].join('\n'),
    [
      `Hi ${first},`,
      ``,
      `Thanks for applying to Bayside Home Care — ${warm.toLowerCase().replace(/\.$/, '')} is exactly the kind of experience our clients need.`,
      ``,
      `Can you come in on ${slotLabel}? It is 30 minutes with Freddie, our owner, at ${OFFICE}. Please bring your ${a.cert_type !== 'none' ? a.cert_type + ' certificate' : 'certificate'} and photo ID.`,
      ``,
      `If that time does not work, just reply and we will find another.`,
      ``,
      `— ${SIGNOFF}`,
    ].join('\n'),
    'advance-email',
  );

  await mail.send(AS, {
    to: a.email,
    subject: `Interview at Bayside Home Care — ${slotLabel}`,
    markdown: body,
    contactId: person.id,
  });

  await crm.note(AS, person.id, `Ravi: interview booked ${slotLabel}, emailed ${a.email}.`);
  await chat.office(AS, `📅 Ravi: ${a.name} advances. Interview ${slotLabel}. Emailed.`);
}

// --- Step 4 — hold: be kind, keep the door open -----------------------------

function whatWouldChangeIt(a: Application, s: Screening): string {
  const gaps: string[] = [];
  const hasCert = (a.cert_type === 'HHA' || a.cert_type === 'CNA') && (!a.cert_expires || a.cert_expires >= localDate(new Date()));
  if (!hasCert && a.years_experience < 1) gaps.push('an HHA or CNA certificate, or a year of paid caregiving');
  else if (!hasCert) gaps.push('a current HHA or CNA certificate');
  if (!a.zip.startsWith('941')) gaps.push('an address inside San Francisco');
  if (!a.availability) gaps.push('the hours you could work');
  return gaps.join(', or ') || (s.reasons[0] ?? 'a little more detail');
}

async function hold(a: Application, person: people.Person, deal: any, s: Screening): Promise<void> {
  const first = a.name.split(' ')[0] || 'there';
  const gap = whatWouldChangeIt(a, s);
  const reason = s.reasons[0] ?? gap;

  const body = await write(
    [
      `Applicant: ${a.name} (first name ${first}).`,
      `They wrote: "${a.why}"`,
      `We cannot move forward yet because: ${s.reasons.join(' ')}`,
      `Tell them kindly what would change it: ${gap}.`,
      `Say we are keeping their application on file and they should come back to us the moment that changes.`,
      `Do not say no, do not say rejected, do not say unfortunately.`,
    ].join('\n'),
    [
      `Hi ${first},`,
      ``,
      `Thank you for applying to Bayside Home Care — ${a.why ? 'what you wrote about ' + a.why.slice(0, 60).toLowerCase() + ' came through clearly' : 'we read every application'}.`,
      ``,
      `We are not able to move forward just yet. What would change that is ${gap}. We are keeping your application on file, so come straight back to us when you have it.`,
      ``,
      `If you would like a hand finding a class, just reply — happy to point you somewhere.`,
      ``,
      `— ${SIGNOFF}`,
    ].join('\n'),
    'hold-email',
  );

  await mail.send(AS, {
    to: a.email,
    subject: 'Your application to Bayside Home Care',
    markdown: body,
    contactId: person.id,
  });

  await moveDeal(deal.id, 'screened');
  await crm.note(AS, person.id, `Ravi: on hold — ${reason}`);
  await chat.office(AS, `⏸️ Ravi: ${a.name} on hold (${reason}). Emailed.`);
}

// --- Step 5 — owner review: hand it over ------------------------------------

async function ownerReview(a: Application, person: people.Person, deal: any, s: Screening): Promise<void> {
  const first = a.name.split(' ')[0] || 'there';
  const title = `Review application: ${a.name}`;

  if (!(await findTask(title))) {
    await tasks.create(AS, {
      title,
      description: [
        s.note_for_owner,
        '',
        ...s.reasons.map((r) => `- ${r}`),
        '',
        `${a.name} · ${a.email} · ${a.phone}`,
        `${a.cert_type === 'none' ? 'No certificate' : a.cert_type + ' to ' + a.cert_expires} · ${a.years_experience} yrs · zip ${a.zip}`,
        `Availability: ${a.availability || 'not given'}`,
        `In their words: "${a.why}"`,
      ].join('\n'),
      assigneeId: ids.owner_user_id,
      projectId: ids.office_project_id,
      contactId: person.id,
      priority: 'medium',
    });
  }

  const body = await write(
    [
      `Applicant: ${a.name} (first name ${first}).`,
      `They wrote: "${a.why}"`,
      `Tell them we have their application, someone here is reading it properly, and we will be in touch within two days.`,
      `Do not promise an interview. Do not say no.`,
    ].join('\n'),
    [
      `Hi ${first},`,
      ``,
      `Thanks for applying to Bayside Home Care — we have your application and someone here is reading it properly.`,
      ``,
      `We will be in touch within two days.`,
      ``,
      `— ${SIGNOFF}`,
    ].join('\n'),
    'review-email',
  );

  await mail.send(AS, {
    to: a.email,
    subject: 'We have your application — Bayside Home Care',
    markdown: body,
    contactId: person.id,
  });

  await crm.note(AS, person.id, `Ravi: sent to the owner — ${s.note_for_owner}`);
  await chat.office(AS, `🙋 Ravi: ${a.name} needs the owner's eyes: ${s.note_for_owner}`);
}

async function route(a: Application, person: people.Person, deal: any, s: Screening): Promise<void> {
  if (s.decision === 'advance') return advance(a, person, deal, s);
  if (s.decision === 'hold') return hold(a, person, deal, s);
  return ownerReview(a, person, deal, s);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Step 6 — certification sweep. Rulebook: remind at 30 days, again at 7,
// and tell the owner at 7. Nobody's paperwork lapses quietly.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const REMIND_COOLDOWN_DAYS = 7;

const mmdd = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;

function daysUntil(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const today = atLocal(localDate(new Date()), '00:00').getTime();
  return Math.round((atLocal(iso, '00:00').getTime() - today) / DAY);
}

/** timeline() drops timestamps, so the note carries its own date: "(on YYYY-MM-DD)". */
async function remindedRecently(personId: string): Promise<boolean> {
  const cutoff = localDate(new Date(Date.now() - REMIND_COOLDOWN_DAYS * DAY));
  for (const line of await people.timeline(AS, personId)) {
    if (!line.startsWith('Ravi: reminded')) continue;
    const m = line.match(/\(on (\d{4}-\d{2}-\d{2})\)/);
    if (m && m[1] >= cutoff) return true;
  }
  return false;
}

function reminderEmail(p: people.Person, certType: string, expires: string, days: number): { subject: string; markdown: string } {
  const first = p.firstName || p.name.split(' ')[0] || 'there';
  const lapsed = days < 0;
  const subject = lapsed
    ? `Your ${certType} needs renewing — Bayside Home Care`
    : `Your ${certType} expires on ${expires}`;
  const markdown = [
    `Hi ${first},`,
    ``,
    lapsed
      ? `Your ${certType} expired on ${expires}, so we need the renewed copy before your next visit. Send it over as soon as you have it.`
      : `Your ${certType} expires on ${expires}${days <= 7 ? ' — that is ' + days + ' day' + (days === 1 ? '' : 's') + ' away' : ''}. Please send us the renewed copy when you have it.`,
    ``,
    `Need help finding a class? Just reply — we will point you at one.`,
    ``,
    `— ${SIGNOFF}`,
  ].join('\n');
  return { subject, markdown };
}

export async function certSweep(): Promise<void> {
  const caregivers = (await people.byRole(AS, 'caregiver')).filter((p) => (p.custom.status ?? 'active') === 'active');

  const due: { p: people.Person; certType: string; expires: string; days: number }[] = [];
  let unknown = 0;
  for (const p of caregivers) {
    const certType = p.custom.cert_type ?? 'none';
    const expires = (p.custom.cert_expires ?? '').slice(0, 10);
    if (certType === 'none' || !expires) continue;
    const days = daysUntil(expires);
    if (days === null) { unknown++; continue; }
    if (days <= 30) due.push({ p, certType, expires, days });
  }
  due.sort((a, b) => a.days - b.days);

  const expired = due.filter((d) => d.days < 0);
  const week = due.filter((d) => d.days >= 0 && d.days <= 7);
  console.log(`[ravi] cert sweep: ${caregivers.length} active caregivers, ${due.length} within 30 days (${week.length} within 7, ${expired.length} expired)`);

  let reminded = 0;
  const today = localDate(new Date());
  for (const d of due) {
    if (await remindedRecently(d.p.id)) {
      console.log(`[ravi] ${d.p.name}: reminded in the last ${REMIND_COOLDOWN_DAYS} days, skipping`);
      continue;
    }
    const { subject, markdown } = reminderEmail(d.p, d.certType, d.expires, d.days);
    await mail.send(AS, { to: d.p.email, subject, markdown, contactId: d.p.id });
    await crm.note(AS, d.p.id, `Ravi: reminded about ${d.certType} expiring ${d.expires} (on ${today}).`);
    reminded++;
  }

  // Rulebook: tell the owner at 7 days, and for anything already lapsed.
  for (const d of [...expired, ...week]) {
    const title = `Certificate expiring: ${d.p.name} (${d.expires})`;
    if (await findTask(title)) continue;
    await tasks.create(AS, {
      title,
      description: [
        d.days < 0
          ? `${d.p.name}'s ${d.certType} expired on ${d.expires} (${-d.days} day${d.days === -1 ? '' : 's'} ago).`
          : `${d.p.name}'s ${d.certType} expires on ${d.expires} — ${d.days} day${d.days === 1 ? '' : 's'} away.`,
        `Ravi has emailed them. They should not work a visit on a lapsed certificate.`,
        ``,
        `${d.p.name} · ${d.p.email} · ${d.p.phone}`,
      ].join('\n'),
      assigneeId: ids.owner_user_id,
      projectId: ids.office_project_id,
      contactId: d.p.id,
      priority: d.days < 0 ? 'high' : 'medium',
    });
  }

  const names = due.slice(0, 4).map((d) => `${d.p.firstName || d.p.name} ${mmdd(d.expires)}`).join(', ');
  const more = due.length > 4 ? `, +${due.length - 4} more` : '';
  const line = due.length
    ? `🪪 Ravi: ${due.length} certificate${due.length === 1 ? '' : 's'} expiring within 30 days (${names}${more}). ${reminded} reminder${reminded === 1 ? '' : 's'} sent. ${expired.length} expired.`
    : `🪪 Ravi: every certificate is current — nothing expiring in the next 30 days.`;
  await chat.office(AS, line);
  if (unknown) console.log(`[ravi] ${unknown} caregiver(s) have an unreadable cert_expires — tell Adamay if this is more than a couple`);
}

// ---------------------------------------------------------------------------

// Ops forwards job emails here; free text is not a structured application, so the owner reviews it and we point them at the form.
async function onApplicationEmail(p: Record<string, unknown>): Promise<void> {
  const from = String(p.from ?? '');
  const subject = String(p.subject ?? 'Job inquiry');
  const summary = String(p.summary ?? subject);
  const title = `Review job email: ${from}`;
  if (!(await findTask(title))) {
    await tasks.create(AS, {
      title,
      description: `${summary}\n\nFrom: ${from}\nSubject: ${subject}\n\n${String(p.body ?? '')}`,
      assigneeId: ids.owner_user_id,
      projectId: ids.office_project_id,
      priority: 'medium',
    });
  }
  if (from) {
    const form = ids.forms?.apply?.public_url;
    await mail.send(AS, {
      to: from,
      subject: subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`,
      markdown: `Hi there,\n\nThanks for getting in touch about working with us. ${form ? `The quickest way in is our short application: ${form}\n\n` : ''}Someone from the office will get back to you within two days.\n\n${SIGNOFF}`,
    });
  }
  await chat.office(AS, `🙋 Ravi: job email from ${from || 'unknown sender'}, handed to the owner.`);
}

export const ravi: Coworker = {
  who: AS,
  async handle(event: Event): Promise<void> {
    switch (event.type) {
      case 'form':
        return onApplication(event);
      case 'timer':
        if (event.kind === 'cert_sweep') return certSweep();
        return void console.log(`[ravi] ignoring timer ${event.kind}`);
      case 'handoff':
        // Ops routes job applications and paperwork questions here.
        if (event.kind === 'application' && event.payload?.answers) {
          return onApplication({ type: 'form', who: AS, formId: String(event.payload.formId ?? ids.forms?.apply?.id ?? ''), answers: event.payload.answers as Record<string, unknown> });
        }
        if (event.kind === 'application_email') return onApplicationEmail(event.payload);
        return void console.log(`[ravi] no handler for handoff "${event.kind}" from ${event.from}`);
      default:
        return void console.log(`[ravi] no handler for ${event.type}`);
    }
  },
};

export default ravi;
