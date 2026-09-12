# Lane 3 — Cara (care coordination) and Ravi (people)

**Owner: Person 3.** You build `src/coworkers/cara.ts`, `src/coworkers/ravi.ts`, and `fixtures/cara/*.json`, `fixtures/ravi/*.json`. Nothing else. Read `plan/00-README-everyone.md` first, especially sections 3, 4, and 9.

Both coworkers have the same shape: a public form (no login) is the front door, the coworker turns the submission into records, a booked meeting, an email, and a pipeline card that moves. Cara is fully autonomous (nothing risky happens). Ravi is autonomous for the good cases and hands anything unclear to the owner, because we never let software reject a person on its own.

Together they are 20 seconds of the video, two quick cuts. They matter because they turn the story from "one clever workflow" into "the whole office". Build Cara first (simpler, fully in your control), then Ravi.

---

## What you can start right now

1. Read the command shapes you will use:
   ```bash
   cd ~/Personal/hackathons/agents-everywhere
   npx ambiguous@latest catalog forms
   npx ambiguous@latest catalog crm
   npx ambiguous@latest catalog docs
   npx ambiguous@latest catalog calendar
   npx ambiguous@latest catalog mail
   npx ambiguous@latest catalog tasks
   npx ambiguous@latest forms create --help        # field types and the options shape; tell Person 1 if the ids in lane 1 step 4.5 need changing
   npx ambiguous@latest calendar availability --help
   ```
2. Write the fixtures (shapes from README 4.1). Use the exact field ids Person 1 will create (lane 1, step 4.5):
   - `fixtures/cara/request-care.json`:
     ```json
     { "type":"form", "who":"cara", "formId":"<from config/ids.json>", "answers": {
       "family_name":"Lena Ortiz", "family_email":"<DEMO_GMAIL>+lena@gmail.com", "family_phone":"415-555-0142",
       "client_name":"Carlos Ortiz", "client_age":81, "zip":"94110",
       "needs":["bathing","meals","companionship"], "days_times":"Mon, Wed, Fri mornings, about 3 hours",
       "language":"Spanish", "has_pets":"yes", "smoker":"no", "gender_pref":"no preference", "hours_week":9,
       "notes":"Dad has a small dog, Chispa. He gets confused in the evenings." } }
     ```
   - `fixtures/ravi/apply.json`:
     ```json
     { "type":"form", "who":"ravi", "formId":"<from config/ids.json>", "answers": {
       "name":"Jordan Kim", "email":"<DEMO_GMAIL>+jordan@gmail.com", "phone":"415-555-0199", "zip":"94122",
       "cert_type":"HHA", "cert_expires":"2027-03-01", "years_experience":3,
       "skills":["bathing","transfers","dementia","meals"], "languages":"English, Korean",
       "availability":"Mon-Fri 07:00-15:00", "has_car":"yes",
       "why":"I cared for my grandmother for two years and want to do this professionally." } }
     ```
   - `fixtures/ravi/apply-hold.json`: same person but `cert_type:"none"`, `years_experience:0.5`, so the hold path is testable.
   - `fixtures/ravi/timer-cert-sweep.json`: `{ "type":"timer", "who":"ravi", "kind":"cert_sweep" }`
3. Draft the care plan prompt and the screening prompt (below) in a scratch file.

When Person 1 posts keys and ids: `AMBI_API_TOKEN=$AMBI_KEY_CARA npx ambiguous@latest whoami` → Cara; same for Ravi.

Note on form events: the raw form event may deliver answers keyed by field id, by label, or as a list. Person 1's `server.ts` normalizes to `answers` keyed by our field ids. If you get to live testing before that lands, `npx ambiguous@latest api GET /api/forms/<id>/responses` shows the real shape; adapt a tiny `normalizeAnswers()` in your file and tell Person 1.

---

# Cara — from "we need care" to a booked assessment

## Step 1 — People records

- `people.upsert('cara', { email: family_email, name: family_name, phone, title:'Family contact', custom: { role:'family' } })` → family contact.
- `people.upsert('cara', { email: <none; build a placeholder like carlos.ortiz@client.bayside.invalid so email stays unique>, name: client_name, title:'Client', custom: { role:'client', needs: needs.join(','), preferences: <from gender_pref + language + notes, one line>, has_pets, smoker, language, zip, hours_week, family_contact_id: <family id>, status:'onboarding' } })` → client contact.
- Update the family contact with `client_id`.
- Notes: client `Cara: request received via form on <date>: <one-line summary of needs and schedule>.`; family `Cara: requested care for Carlos (father).`

Find-before-create is mandatory (people.upsert does it by email; for the client, by exact name + `role:'client'` since the client has no real email). Running the fixture twice must not create duplicates.

## Step 2 — Pipeline card

- `crm deals create --title "Carlos Ortiz" --pipeline-id <client_onboarding> --stage-id <new_request> --contact-id <client id> --confirm-zero` (the flag exists for zero-amount deals; if it errors without an amount, pass `--amount 0`). If a deal for this contact already exists in this pipeline (`crm deals list --contact-id`), reuse it.
- Post `🆕 Cara: new care request for Carlos Ortiz (Lena, daughter) — bathing, meals, companionship, MWF mornings.` in #office.

## Step 3 — Care plan draft (Doc)

- `llm.askJSON('cara', { rulebook: true, system, user: <all answers>, schema: { title: string, markdown: string, questions_for_assessment: string[] /* 3–5 */ } })`.
  System prompt (draft):
  ```
  You are Cara, care coordinator at Bayside Home Care. Write a one-page DRAFT care plan from what the family told us, in plain words a family would understand. Sections: About <client>; What we'll help with (each need as a short line); Schedule; Things to know at home (pets, language, evening confusion, etc.); Questions for the assessment visit. Do not invent medical facts. Mark clearly that the owner confirms everything at the assessment.
  ```
- `docs create --type doc --title "Care Plan — Carlos Ortiz (DRAFT)" --content <markdown>` → doc id. Save the doc id on the deal or the client contact (`custom_properties.care_plan_doc_id`).
- Move the deal to `care_plan_drafted`? No: the pipeline order is `New request → Assessment booked → Care plan drafted`. Keep the order simple for the demo: after this step the card goes to **Assessment booked** (step 4) and the doc link goes in the deal's activity as a note. If Person 1's stage order differs from the README, follow `config/ids.json`.

## Step 4 — Book the assessment on the owner's calendar

- Window: next two business days (skip Sat/Sun), 09:00–17:00 local, 45 minutes.
- `cal.availability('cara', [owner_user_id], windowStart, windowEnd)` → busy blocks. Pick the first 45-minute gap on the half-hour. If the helper is not ready, `npx ambiguous@latest calendar availability --user-ids <owner> --start ... --end ... --json` shows the shape; write a 15-line gap finder.
- `cal.create('cara', { calendarId: visits_calendar_id, title: "Assessment — Ortiz", startAt, endAt, attendees: [owner_user_id], contactId: <client id>, description: "Assessment visit for Carlos Ortiz.\nFamily: Lena Ortiz, 415-555-0142\nCare plan draft: <doc link>\nclient_id: <id>\nstatus: scheduled", location: <zip> })`.
- `crm deals update <deal> --stage-id <assessment_booked>`.

## Step 5 — Email the family

- `llm.draft('cara', { system: "You are Cara at Bayside Home Care. Warm, short, plain words, first names.", user: <facts: assessment day/time, what happens at an assessment, the three needs, mention the dog by name, sign-off> })` → under 120 words.
- `mail.send('cara', { to: family_email, contactId: <family id>, subject: "Carlos — assessment visit on <Day> at <time>", markdown })`.

## Step 6 — Close the loop

- Notes: client `Cara: assessment booked <Day date time> with the owner; care plan draft created.`
- Post `📅 Cara: assessment for Carlos Ortiz booked <Day> <time>. Lena emailed. Care plan draft ready.` in #office.
- Optional: `tasks create` for the owner `Read before assessment: Carlos Ortiz` due the assessment day, description = the care plan's questions. Only if you have five spare minutes; it looks great in the task list.

## Cara from an email (handoff `kind: 'care_request_email'`) — only if time

Ops may hand Cara an email instead of a form. `mail.get` → `llm.askJSON` into the same `answers` shape (fill what you can, `null` the rest) → run steps 1–6, but skip booking if `family_email` is missing and instead create a `Needs a human:` task. If you are not going to get to this by 3:15 PM, tell Person 1 so Ops uses its fallback (task for the owner + short reply).

---

# Ravi — from "I'd like to work here" to a booked interview, and certificates that never lapse

## Step 1 — Applicant record and card

- `people.upsert('ravi', { email, name, phone, title:'Applicant', custom: { role:'applicant', cert_type, cert_expires, years_experience, skills: skills.join(','), languages, has_car, zip, availability } })`.
- Deal: `crm deals create --title "<name>" --pipeline-id <hiring> --stage-id <applied> --contact-id <id>` (reuse if exists).
- Note: `Ravi: application received via form on <date>.`
- Post `📨 Ravi: new application from Jordan Kim (HHA, 3 yrs, Korean). Screening…`

## Step 2 — Screen (the model decides; the Rulebook is the policy)

- `llm.askJSON('ravi', { rulebook: true, system, user: <answers>, schema })`:
  ```ts
  { decision: 'advance' | 'hold' | 'owner_review',
    reasons: string[] /* 1–3 short facts */,
    interview_questions: string[] /* exactly 3, specific to this applicant */,
    note_for_owner: string /* one line */ }
  ```
  System prompt (draft):
  ```
  You are Ravi, who handles hiring at Bayside Home Care. Apply the Rulebook's Hiring rules to this application. 'advance' only when the rules are clearly met (valid unexpired HHA/CNA, or 1+ year paid experience; SF zip 941xx; some availability). 'hold' when a rule is not met but the person could qualify later (say what would change it). 'owner_review' for anything unclear. Never reject. Reasons must be facts from the application. Write three interview questions tailored to what this person said.
  ```
- Deterministic pre-checks in code before the model (belt and braces, and they make the reasons crisp): cert expiry date in the past → `hold`; zip not starting with `941` → `hold`. Pass these as "facts already checked" into the prompt so the model does not contradict them.
- Note: `Ravi: screened → <decision>: <reasons joined>`. Move the deal to `screened`.

## Step 3 — Advance: book the interview

- Window: next three business days, 09:00–17:00, 30 minutes, first gap in the owner's availability (same gap finder as Cara; put it in your own file `src/coworkers/slots.ts`? No: shared files are Person 1's. Keep a small `findGap()` in each coworker file, or ask Person 1 to add `cal.firstGap()` to `ambi.ts`. Ask early; it is 15 lines.)
- `cal.create('ravi', { calendarId, title: "Interview — Jordan Kim", startAt, endAt, attendees:[owner], contactId: <applicant id>, description: "Interview.\nQuestions:\n- q1\n- q2\n- q3\ncontact_id: <id>\nstatus: scheduled" })`.
- `crm deals update <deal> --stage-id <interview_booked>`.
- Email the applicant (`llm.draft`, under 100 words): the time, the address, "bring your HHA certificate and ID", one warm line about why we liked the application (use a reason). Subject: `Interview at Bayside Home Care — <Day> <time>`.
- Note + #office: `📅 Ravi: Jordan Kim advances. Interview <Day> <time>. Emailed.`

## Step 4 — Hold: be kind, keep the door open

- Email: what would make it work ("an HHA certificate, or a year of paid caregiving"), and that we keep the application. Move the deal to `screened` with a note `Ravi: on hold — <reason>`. Post `⏸️ Ravi: <name> on hold (<reason>). Emailed.` No task for the owner.

## Step 5 — Owner review: hand it over

- `tasks create --title "Review application: <name>" --assignee-id <owner> --project-id <office> --contact-id <id> --priority medium --description <note_for_owner + reasons + link to the contact>`.
- Email the applicant: "Thanks, we've received it and will be in touch within two days."
- Post `🙋 Ravi: <name> needs the owner's eyes: <note_for_owner>`.

## Step 6 — Certification sweep (timer `cert_sweep`; also `npm run certs`)

- `people.byRole('ravi','caregiver')` with `status === 'active'`; parse `cert_expires`. Buckets: expired, ≤ 7 days, ≤ 30 days.
- For each in ≤ 30 days (and not reminded in the last 7 days: check the timeline for a `Ravi: reminded` note with a recent date): email a reminder (template, no LLM): "Hi <first>, your <cert_type> expires on <date>. Please send us the renewed copy when you have it. Need help finding a class? Just reply." Note `Ravi: reminded about <cert_type> expiring <date>.`
- For ≤ 7 days and expired: one task for the owner `Certificate expiring: <name> (<date>)` (find-before-create by title).
- Post one summary line: `🪪 Ravi: 3 certificates expiring within 30 days (Maria 09/28, Tom 10/02, Ana 10/09). Reminders sent. 0 expired.`
- Seed guarantees at least three caregivers with `cert_expires` inside 30 days and one within 7, so this produces visible output. If the seed does not, tell Person 1 (it is one line in the data generator).
- Optional, only if everything above is done and it is before 3:20 PM: use the Exa MCP already wired in `.mcp.json` (or `EXA_API_KEY` with `fetch` to Exa's search API) to find one HHA renewal class in San Francisco and include the link in the reminder. Real value, sponsor tick, 15 minutes. Do not start it before the spine works.

---

## Acceptance test (live workspace, before you say done)

1. `npm run co -- cara fixtures/cara/request-care.json` → two new contacts (client + family) with the right custom properties, one deal in Client Onboarding at "Assessment booked", one doc "Care Plan — Carlos Ortiz (DRAFT)", one event "Assessment — Ortiz" on Visits with the owner as attendee inside a free slot, one email to the `+lena` inbox, two #office lines. Run it again → nothing duplicated, one `ℹ️` line at most.
2. Submit the real public form from a phone (the URL is in `config/ids.json`) → same result via the live server (`npm run dev` must be running on Person 1's machine; if it is not, use the fixture path and say so).
3. `npm run co -- ravi fixtures/ravi/apply.json` → applicant contact, deal at "Interview booked", event "Interview — Jordan Kim", email to `+jordan`, notes, #office lines.
4. `npm run co -- ravi fixtures/ravi/apply-hold.json` → deal at "Screened", hold email, no interview, no owner task.
5. `npm run certs` → reminder emails only to allowlisted addresses (seeded example.com people get a note instead), the owner task for the ≤ 7 day person, one summary line.

Send Person 1 three lines about what you built for the README.

---

## Text bar

Cara writes to worried adult children. Ravi writes to people hoping for a job. Both get one short, warm, specific email: a real day and time, one concrete detail that proves a human-like reader saw their form (the dog's name, the grandmother), what happens next, a first-name sign-off. No forms language. No "your request has been processed".
