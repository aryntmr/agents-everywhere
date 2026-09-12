# Lane 1b — Cara (care coordination), owned by Adamay

**Owner: Adamay.** You build `src/coworkers/cara.ts` and `fixtures/cara/*.json` on top of lane 1. The gates you owe the team come first. Start Cara after the webhooks are live (GATE 4 in `plan/01-dependency-map.md`), or earlier only while a seed run is going and you are otherwise waiting.

Cara's job in one paragraph: a family fills the public "Request care" form. Cara creates the client and the family contact in the CRM, opens a card in the Client Onboarding pipeline, drafts a one-page care plan doc, books a 45-minute assessment on the owner's calendar, and emails the family, all within a minute with no human step. It is one 10-second cut in the video.

Because you also own `ambi.ts` and `server.ts`, two pieces serve both Cara and Akshat's Ravi: add `cal.firstGap(as, userIds, startISO, endISO, minutes)` to `ambi.ts` (lane 1 step 2), and normalize form answers to our field ids in `server.ts`.

If you fall behind, Cara shrinks before any gate slips: drop the email-intake variant first, then the care plan doc (cut list item 6). Keep the contact, the card, the assessment booking, and the family email.

---

## Prep (do it while a seed run is going)

1. Fixture (shape from README 4.1, field ids from lane 1 step 4.5):
   - `fixtures/cara/request-care.json`:
     ```json
     { "type":"form", "who":"cara", "formId":"<from config/ids.json>", "answers": {
       "family_name":"Lena Ortiz", "family_email":"<DEMO_GMAIL>+lena@gmail.com", "family_phone":"415-555-0142",
       "client_name":"Carlos Ortiz", "client_age":81, "zip":"94110",
       "needs":["bathing","meals","companionship"], "days_times":"Mon, Wed, Fri mornings, about 3 hours",
       "language":"Spanish", "has_pets":"yes", "smoker":"no", "gender_pref":"no preference", "hours_week":9,
       "notes":"Dad has a small dog, Chispa. He gets confused in the evenings." } }
     ```
2. Draft the care plan prompt (step 3 below) in a scratch file.

Note on form events: the raw form event may deliver answers keyed by field id, by label, or as a list. Adamay's `server.ts` normalizes to `answers` keyed by our field ids. If you get to live testing before that lands, `npx ambiguous@latest api GET /api/forms/<id>/responses` shows the real shape; adapt a tiny `normalizeAnswers()` in your file and tell Adamay.

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
- Move the deal to `care_plan_drafted`? No: the pipeline order is `New request → Assessment booked → Care plan drafted`. Keep the order simple for the demo: after this step the card goes to **Assessment booked** (step 4) and the doc link goes in the deal's activity as a note. If Adamay's stage order differs from the README, follow `config/ids.json`.

## Step 4 — Book the assessment on the owner's calendar

- Window: next two business days (skip Sat/Sun), 09:00–17:00 local, 45 minutes.
- `cal.availability('cara', [owner_user_id], windowStart, windowEnd)` → busy blocks. Pick the first 45-minute gap on the half-hour. If the helper is not ready, `npx ambiguous@latest calendar availability --user-ids <owner> --start ... --end ... --json` shows the shape; write it as `cal.firstGap(as, userIds, startISO, endISO, minutes)` in `ambi.ts`, since Ravi needs the same helper.
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

Ops may hand Cara an email instead of a form. `mail.get` → `llm.askJSON` into the same `answers` shape (fill what you can, `null` the rest) → run steps 1–6, but skip booking if `family_email` is missing and instead create a `Needs a human:` task. If you are not going to get to this by 3:15 PM, skip it and let Ops use its fallback (task for the owner + short reply).


---

## Acceptance test (live workspace, before you say done)

1. `npm run co -- cara fixtures/cara/request-care.json` → two new contacts (client and family) with the right custom properties, one deal in Client Onboarding at "Assessment booked", one doc "Care Plan — Carlos Ortiz (DRAFT)", one event "Assessment — Ortiz" on Visits with the owner as attendee inside a free slot, one email to the `+lena` inbox, two #office lines. Run it again → nothing duplicated.
2. Submit the real public request-care form from a phone (the URL is in `config/ids.json`) → the same result through the live server. Akshat can do this test for you while you fix things.

---

## Text bar

Cara writes to worried adult children. One short, warm, specific email: a real day and time, one concrete detail that proves someone read the form (the dog's name), what happens next, a first-name sign-off. No "your request has been processed".
