# Lane 3 — Ravi (people: hiring and certifications)

**Owner: Akshat.** You build `src/coworkers/ravi.ts` and `fixtures/ravi/*.json`. Nothing else. Read `plan/00-README-everyone.md` first, especially sections 3, 4, and 9, then `plan/01-dependency-map.md`.

Ravi's job in one paragraph: someone fills the public "Apply to work with us" form. Ravi creates their record and a card in the Hiring pipeline, screens the application against the Agency Rulebook, and then either books a 30-minute interview with the owner and emails the applicant, puts them on a kind hold, or hands anything unclear to the owner as a task. We never let software reject a person on its own. Once a day Ravi also checks every caregiver's certificate and chases renewals before they lapse.

Ravi is one 10-second cut in the video plus the certification line in #office. It helps turn the story from "one clever workflow" into "the whole office". Build steps 1 to 5 first, then step 6.

Cara, the family intake coworker, is Adamay's (`plan/lane-1b-cara.md`). Do not build Cara. Two things are shared with Cara, so check with Adamay before writing your own: the free-slot finder `cal.firstGap()` in `ambi.ts`, and the form-answer normalization in `server.ts`.

---

## What you can start right now

1. Pull, then read the command shapes you will use:
   ```bash
   cd agents-everywhere && git pull
   npx ambiguous@latest catalog forms
   npx ambiguous@latest catalog crm
   npx ambiguous@latest catalog calendar
   npx ambiguous@latest catalog mail
   npx ambiguous@latest catalog tasks
   npx ambiguous@latest calendar availability --help
   ```
2. Write the fixtures (shapes from README 4.1). Use the exact field ids Adamay creates in lane 1, step 4.5:
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
3. Draft the screening prompt (step 2 below) in a scratch file.

When Aryan sends your key, put it in your `.env` as `AMBI_KEY_RAVI` and check it:
```bash
set -a; source .env; set +a; AMBI_API_TOKEN=$AMBI_KEY_RAVI npx ambiguous@latest whoami
```
It should say `ravi@freddies-workspace.ambi.cc`, type `agent`.

Note on form events: the raw form event may deliver answers keyed by field id, by label, or as a list. Adamay's `server.ts` normalizes to `answers` keyed by our field ids. If you get to live testing before that lands, `npx ambiguous@latest api GET /api/forms/<id>/responses` shows the real shape; adapt a tiny `normalizeAnswers()` in your file and tell Adamay.

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

- Window: next three business days, 09:00–17:00, 30 minutes, first free slot in the owner's calendar. Use `cal.firstGap()` from `ambi.ts`, which Adamay adds for Cara. If it is not there yet, write a 15-line `findGap()` inside `ravi.ts` and swap it out later.
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
- Seed guarantees at least three caregivers with `cert_expires` inside 30 days and one within 7, so this produces visible output. If the seed does not, tell Adamay (it is one line in the data generator).
- Optional, only if everything above is done and it is before 3:20 PM: use the Exa MCP already wired in `.mcp.json` (or `EXA_API_KEY` with `fetch` to Exa's search API) to find one HHA renewal class in San Francisco and include the link in the reminder. Real value, sponsor tick, 15 minutes. Do not start it before the spine works.


---

## Acceptance test (live workspace, before you say done)

1. `npm run co -- ravi fixtures/ravi/apply.json` → applicant contact, deal at "Interview booked", event "Interview — Jordan Kim" on Visits with the owner as attendee inside a free slot, email to the `+jordan` inbox, notes, #office lines. Run it again → nothing duplicated.
2. `npm run co -- ravi fixtures/ravi/apply-hold.json` → deal at "Screened", hold email, no interview, no owner task.
3. Submit the real public apply form from a phone (the URL is in `config/ids.json`) → same result as test 1, through the live server. If the server is not up yet, say so and rely on test 1.
4. `npm run certs` → reminder emails only to allowlisted addresses (seeded example.com people get a CRM note instead), an owner task for the person within 7 days, one summary line in #office.

Send Adamay three lines about what you built for the README.

---

## Text bar

Ravi writes to people hoping for a job. One short, warm, specific email: a real day and time, one concrete detail from their application that proves someone read it (the grandmother they cared for), what happens next, a first-name sign-off. No "your application has been processed".
