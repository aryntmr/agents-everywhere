# Lane 1 — Foundation, seed data, Ops (front desk), demo & submission

**Owner: Person 1.** You are the only person who touches shared files and the workspace's admin side. Everyone else is blocked on you for the first 20 minutes, so the order below is the order. Read `plan/00-README-everyone.md` first.

Your deliverables, in priority order:

1. Coworker identities and keys (by 1:55 PM).
2. Repo skeleton everyone codes against: `package.json`, `src/types.ts`, `src/ambi.ts`, `src/run.ts`, `config/ids.json` (by 2:05 PM).
3. Verification list results posted in chat (by 2:10 PM).
4. Seed: pipelines, calendar, channel, project, forms, rulebook, 50 clients, 50 caregivers, a month of visits (by 3:00 PM).
5. `approvals.ts`, `people.ts`, `rulebook.ts`, `llm.ts`, `server.ts` with routing (by 3:00 PM).
6. Ops coworker: classify + hand off + #office narration (by 3:15 PM).
7. Webhooks live through cloudflared; full integration run (by 3:30 PM).
8. Reset script, README, video, social post, submission (3:45 – 4:25 PM).

---

## Step 1 — Identities (do this before anything else)

You are logged in to https://app.ambiguous.ai as the workspace owner. You need one admin-capable key to provision agents, then one key per coworker.

1. In the UI: sidebar → **MCP** → **Claude Code** → **Authorize a new agent** → get the key. Name it `Ops (front desk)`, username `ops`. This first agent may or may not have admin rights; check with:
   ```bash
   cd ~/Personal/hackathons/agents-everywhere
   AMBI_API_TOKEN=ak_... npx ambiguous@latest whoami
   AMBI_API_TOKEN=ak_... npx ambiguous@latest admin users list --type agent --json
   ```
   If `admin users list` returns an auth error, provision the other three from the UI instead (Admin → Users → add agent), or create an admin API key for your own owner account in the UI (Admin → API keys) and use that for step 2 only. Do not use your owner key inside the app code.
2. Provision the other three (from the CLI with an admin-capable key, or the UI):
   ```bash
   npx ambiguous@latest admin users provision-agent --display-name "Sam (scheduling)" --username sam --role member --json
   npx ambiguous@latest admin users provision-agent --display-name "Cara (care coordination)" --username cara --role member --json
   npx ambiguous@latest admin users provision-agent --display-name "Ravi (people)" --username ravi --role member --json
   ```
   Each returns `{user, api_key}`. **The key is shown once.** If `member` cannot create calendars/pipelines/forms during seed, re-provision Ops as `admin` (seed runs as Ops).
   Free plan cap is 5 members. Owner + 4 agents = 5. If provisioning the fourth fails, merge Cara and Ravi into one coworker named `Cara (care & people)` and tell Person 3 to use `AMBI_KEY_CARA` for both.
3. Put the keys in `.env`:
   ```
   AMBI_KEY_OPS=ak_...
   AMBI_KEY_SAM=ak_...
   AMBI_KEY_CARA=ak_...
   AMBI_KEY_RAVI=ak_...
   OPENAI_API_KEY=...
   OPENAI_MODEL=<the current default GPT model from the OpenAI dashboard>
   DEMO_GMAIL=<the gmail address whose plus-addresses play the demo people>
   ```
   Send the four `ak_` keys to the team in a private message, never in the repo or the event chat.
4. Record for `config/ids.json`: each agent's `user.id` and email address (`admin users list --type agent --json`), the owner's user id (`whoami` with the owner-authorized key, or `admin users list --type human`), and the workspace email domain (`admin domains list --json`).

## Step 2 — Skeleton (push by 2:05 PM; this unblocks lanes 2 and 3)

```bash
npm init -y
npm i ambiguous openai dotenv
npm i -D tsx typescript @types/node
```

`package.json` scripts:
```json
{
  "dev": "tsx watch src/server.ts",
  "co": "tsx src/run.ts",
  "seed": "tsx src/seed/seed.ts",
  "reset": "tsx src/seed/reset.ts",
  "brief": "tsx src/run.ts ops fixtures/ops/timer-morning-brief.json",
  "certs": "tsx src/run.ts ravi fixtures/ravi/timer-cert-sweep.json"
}
```

`src/types.ts`: exactly the `Who`, `Event`, `Coworker` types from `00-README-everyone.md` section 4.1. Push it, announce "types.ts is up". Freeze it at 2:20 PM.

`src/ambi.ts`:
- `ambi(as, args, body?)`: `execFile(node_modules/.bin/ambiguous, [...args, '--json'], { env: { ...process.env, AMBI_API_TOKEN: KEYS[as] } })`, pipe `JSON.stringify(body)` to stdin when given, parse stdout, throw an `Error` with the CLI's `error` text when `ok === false` or exit code ≠ 0. Log one line per call: `[sam] mail send → ok (412ms)`.
- Wrappers listed in section 4.2 of the README. The two that need care:
  - `mail.send(as, {to, subject, markdown, inReplyTo?, threadId?, contactId?})`: enforce the allowlist from `config/ids.json → email_allowlist` (array of address suffixes, e.g. `["+maria@gmail.com", "@yourdomain"]` or the whole plus-base). Non-allowlisted → write a CRM note instead if `contactId` is given, and return `{skipped: true}`. Use `--idempotency-key` = sha1 of `to+subject` so re-runs of a fixture do not double-send.
  - `cal.onDay(as, dateISO)`: `calendar events list --start <00:00 local as RFC3339> --end <23:59:59> --single-events true --limit 200` and parse occurrences; return objects with `{id, masterId, occurrenceDate, title, description, start, end, contactId, color}`. Look at one real response first (`--json`) to learn which field carries the master id for an occurrence; document it in a comment for lanes 2 and 3.
- `parseVisit(description)` and `formatVisit({client_id, caregiver_id, status})` helpers for the fixed description lines.

`src/run.ts`: `npm run co -- <who> <fixture.json>` → loads `.env`, imports `src/coworkers/<who>.ts`, calls `handle(JSON.parse(file))`, prints the result, exits non-zero on throw.

`src/llm.ts`:
- `askJSON<T>(as, {system, user, schema})` → OpenAI chat completion with `response_format: json_schema` (strict), temperature 0, returns parsed `T`. Prepend `Rulebook:\n<text>` to `system` when the caller passes `rulebook: true`.
- `draft(as, {system, user})` → plain text for emails, temperature 0.7, max 300 tokens.
- Model from `OPENAI_MODEL`. If `OPENROUTER_API_KEY` is set and `OPENAI_API_KEY` is not, use `baseURL: https://openrouter.ai/api/v1`.
- Log `[sam] llm rank → 1.8s` per call.

`config/ids.json` (commit a partial version now, fill it as seed runs):
```json
{
  "workspace_domain": "",
  "owner_user_id": "",
  "agents": { "ops": {"user_id": "", "email": ""}, "sam": {...}, "cara": {...}, "ravi": {...} },
  "visits_calendar_id": "",
  "office_channel_id": "",
  "office_project_id": "",
  "rulebook_doc_id": "",
  "pipelines": { "client_onboarding": {"id": "", "stages": {"new_request": "", "assessment_booked": "", "care_plan_drafted": "", "active_client": ""}},
                 "hiring": {"id": "", "stages": {"applied": "", "screened": "", "interview_booked": "", "offer": "", "active_caregiver": ""}} },
  "forms": { "request_care": {"id": "", "public_url": ""}, "apply": {"id": "", "public_url": ""} },
  "email_allowlist": ["+maria@", "+priya@", "+dev@", "+rosa@", "+neha@", "+lena@", "+jordan@"],
  "demo": { "maria_contact_id": "", "priya_contact_id": "", "patel_contact_id": "", "patel_series_event_id": "" }
}
```

## Step 3 — Verification list (post ✅/❌ per item in chat by 2:10 PM)

Run the six checks in `00-README-everyone.md` section 8. Concretely:

```bash
# 2. event names
npx ambiguous@latest webhooks event-types --json
# 3. email round trip (as Sam)
AMBI_API_TOKEN=$AMBI_KEY_SAM npx ambiguous@latest mail send --to "$DEMO_GMAIL" --subject "Test from Sam" --body-markdown "Reply YES to this." --json
#    reply from Gmail, then:
AMBI_API_TOKEN=$AMBI_KEY_SAM npx ambiguous@latest mail inbox --unread true --detail full --json
# 4. form: create a throwaway form, open its public URL in a private window, submit, then:
npx ambiguous@latest api GET /api/forms/<id>/responses
# 5. calendar recurrence
npx ambiguous@latest calendar create --name "TEST cal" --timezone America/Los_Angeles --json
npx ambiguous@latest calendar events create <cal> --title "TEST rec" --start-at 2026-09-15T14:00:00-07:00 --end-at 2026-09-15T18:00:00-07:00 --recurrence-rule "FREQ=WEEKLY;BYDAY=TU,TH" --json
npx ambiguous@latest calendar events list --calendar-id <cal> --start 2026-09-17T00:00:00-07:00 --end 2026-09-17T23:59:59-07:00 --single-events true --json
npx ambiguous@latest calendar events edit-single <master> --occurrence-date 2026-09-17 --title "TEST rec (edited)" --json
# 6. task completed event: register a webhook first (step 7) or just note that approvals.ts polls.
```

Save one real payload of each event type you receive into `fixtures/raw/<event>.json`. Lanes 2 and 3 build their fixtures from those.

## Step 4 — Seed (`src/seed/seed.ts`, run as Ops)

Idempotent: every create is preceded by a find (by name for calendar/channel/project/pipelines/forms/doc, by email for contacts). Sleep 1.1 s between writes. Print every id and write them into `config/ids.json` at the end.

1. `calendar create --name Visits --timezone America/Los_Angeles`. Share it with the owner and all four agents as editor (`calendar permissions add <cal> --role editor --user-id <id>`), so events created by Sam show up for everyone.
2. `chat channels create --type public --name office`; add all agents (`--member-ids`) if the flag is accepted, otherwise each agent runs `chat channels join <id>` once.
3. `projects create --name Office --visibility workspace`.
4. Pipelines: `crm pipelines create --name "Client Onboarding" --stages '[...]'` and `Hiring` with the stage names from the README, in order. Read back with `crm pipelines list --json` to capture stage ids.
5. Forms (`forms create --is-published true`). Use field ids exactly as below; Person 3 codes against them.
   - `request_care`: `family_name` (text), `family_email` (email), `family_phone` (text), `client_name` (text), `client_age` (number), `zip` (text), `needs` (multi-select checkbox from the skills vocabulary), `days_times` (long text), `language` (text), `has_pets` (select yes/no), `smoker` (select yes/no), `gender_pref` (select female/male/no preference), `hours_week` (number), `notes` (long text).
   - `apply`: `name` (text), `email` (email), `phone` (text), `zip` (text), `cert_type` (select HHA/CNA/none), `cert_expires` (date), `years_experience` (number), `skills` (multi-select from the vocabulary), `languages` (text), `availability` (long text), `has_car` (select yes/no), `why` (long text).
   Run `forms create --help` to see the exact `type` values (text, email, number, date, select, checkbox, long text) and the shape of `options`.
6. Rulebook doc (`docs create --type doc --title "Agency Rulebook"`). Content (plain English, this is what the coworkers read):
   ```
   # Bayside Home Care — how we do things

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
   ```
7. Contacts. Generate deterministically in `src/seed/data.ts` (no faker needed; hand-written name lists and a seeded random). 50 caregivers, 50 clients, 50 family contacts (one per client, created with `role: family`; this makes 150 contacts, ~3 minutes at 1.1 s. If short on time, create family contacts only for the 10 clients with visits this week and for Patel).
   - All addresses `first.last@example.com` except the demo people (section 10 of the README), who get `DEMO_GMAIL` plus-addresses.
   - Demo guarantee: Patel's `needs = transfers, meals, meds`, `preferences = "Gujarati speaker preferred"`, `has_pets = no`, Tue/Thu 2–6 pm, caregiver Maria. Exactly three caregivers have `transfers` + (`Gujarati` or `Hindi`) + Tuesday afternoons free + no visit Tue 2–6: Priya (has visited Patel before, note on her timeline and his), Dev, Rosa. Give five other caregivers `transfers` but block them (a Tue 2–6 visit, or `ok_with_smokers` irrelevant here, or `gender = male` while Patel prefers female... pick one blocker each) so Sam's filters visibly do work.
   - Write 1–3 notes on ~15 caregivers and ~15 clients (`crm activities create --type note`) so the timelines are not empty: `Ops: called out sick 2026-08-21`, `Sam: covered Nguyen Thu Aug 28 2–6pm`, `Cara: family prefers morning visits`.
   - Set `title` to the role word.
8. Visits. For each client with `status = active` (make 40 of the 50 active), create one or two repeating series on `Visits`: start next Monday 2026-09-14 (or today), 2–4 hours, `FREQ=WEEKLY;BYDAY=<2–3 days>`, `--contact-id <client>`, description lines per the README, title `Visit — <Client last> — <Caregiver first>`. Balance so each active caregiver has 2–4 series and nobody exceeds ~30 hours/week. ~70 series total. Record Patel's series id in `config/ids.json → demo.patel_series_event_id`.
9. Write all ids to `config/ids.json`, commit, push, announce.

`src/seed/reset.ts` (for the demo): delete tasks in project Office (`tasks list --project-id` → `tasks delete <id> --yes`), delete deals in both pipelines, delete calendar events whose title starts with `TEST `, `Assessment —`, or `Interview —`, delete contacts whose email is a demo plus-address for intake/hiring (Lena/Carlos/Jordan) so the forms can be re-submitted, and reset Patel's next-Tuesday occurrence back to `Visit — Patel — Maria` with `status: scheduled` (`calendar events edit-single`). Leave the 150 seed contacts and the 70 series alone.

## Step 5 — Shared helpers

`src/people.ts`
- `all(as)`: `crm contacts list --limit 100` (page with `--cursor`/`--offset` until done), cache 60 s in memory. Returns `Person[]` with `role` and parsed custom properties (`skills` and `languages` as arrays).
- `byRole(as, role)`, `findByEmail(as, email)`, `get(as, id)`, `note(as, id, text)`, `timeline(as, id)` (last 20 notes as strings).
- `upsert(as, {email, ...fields})`: find by email → update or create.

`src/rulebook.ts`: `text(as)` → `docs get <rulebook_doc_id>` content, cached 60 s.

`src/approvals.ts`
- `request(as, {title, description, contactId?}): Promise<boolean>`: `tasks create --assignee-id <owner> --project-id <office> --priority high --title "APPROVE: ..." --description ...`; post `🙋 <Who>: needs your OK → <task title>` in #office; register `taskId → resolver` in a Map; also start a 10-second poll of `tasks get <id>` until `status === 'done'` (or `cancelled` → false). `resolve(taskId, ok)` is called by `server.ts` on the task-completed event; whichever comes first wins. Timeout after 20 minutes → false.

`src/server.ts`
- `node:http` server on port 3000. `POST /events` receives Ambiguous webhooks. Verify the HMAC if the secret is set (headers `x-webhook-timestamp` and `x-webhook-signature`, HMAC-SHA256 of `timestamp + "." + rawBody` with the webhook secret; confirm the exact scheme from the recipe page `https://www.ambiguous.ai/agents/recipes` recipe 2 and the payload you captured). Respond 200 immediately, process async.
- Normalize into `Event` (section 4.1). The routing table:
  - email received → look at the `to` address: `ops@` → `ops`; `sam@` → `sam`; `cara@` → `cara`; `ravi@` → `ravi`. Fetch `mail get <id> --detail full` to fill `from`, `subject`; pass `emailId`.
  - form submitted → by `formId`: request_care → `cara`, apply → `ravi`. Put the answers object in `answers` keyed by our field ids.
  - task completed → `approvals.resolve(taskId, true)`; also emit `task_done` to `sam` (in case Sam wants it).
- `export async function handoff(to: Who, ev: Omit<Extract<Event,{type:'handoff'}>,'type'|'who'>)` → `coworkers[to].handle({type:'handoff', who: to, ...ev})`.
- Timers: `setInterval` every 60 s → if local time is 07:00 fire `ops` `morning_brief`; every 60 s → `ravi` `cert_sweep` once per day at 07:05. Both also runnable via `npm run brief` / `npm run certs`.
- Fallback listener (only if check 2 failed): spawn `ambiguous notifications watch` per coworker key and poll `mail inbox --unread true` every 15 s per coworker, dedupe by email id in a Set, then route the same way.
- Dedupe every event by id (Set with 1-hour expiry) so retries do not double-run.

Webhook registration (step 7) happens after the tunnel is up:
```bash
cloudflared tunnel --url http://localhost:3000     # prints https://<random>.trycloudflare.com
AMBI_API_TOKEN=$AMBI_KEY_OPS npx ambiguous@latest webhooks create --url https://<random>.trycloudflare.com/events --name bayside --events <exact names from event-types, or '*'> --json
```
If webhooks are scoped to the caller's own inbox, register the same URL once per coworker key (four registrations). Save the returned secrets in `.env` as `WEBHOOK_SECRET_OPS` etc. Keep the tunnel and `npm run dev` running in two terminal tabs until the video is done.

## Step 6 — Ops coworker (`src/coworkers/ops.ts`)

Ops is small on purpose. Its value is that every human contact has one door and everything gets routed and narrated.

Handles:

**`email` (to ops@):**
1. `mail.get` → from, subject, body. `people.findByEmail(from)` → the person (may be unknown).
2. `llm.askJSON` with the Rulebook's "Routing at the front desk" section and the email, schema:
   ```ts
   { kind: 'callout' | 'care_request' | 'application' | 'next_visit_question' | 'availability_change' | 'other',
     summary: string,           // one line
     urgency: 'now' | 'today' | 'this_week' }
   ```
3. Post `📨 Ops: <summary> → <what happens next>` in #office. React 👀 is not available on email; mark the email read with `mail mark <id> --read true`.
4. Route:
   - `callout` → `handoff('sam', {from:'ops', kind:'callout', payload:{emailId}})`.
   - `care_request` → `handoff('cara', {from:'ops', kind:'care_request_email', payload:{emailId}})` (Cara treats it like a form with free-text answers; if Person 3 has no time for that, Ops instead creates a `Needs a human:` task and replies "thanks, we'll call you today").
   - `application` → `handoff('ravi', {..., kind:'application_email', payload:{emailId}})` (same fallback).
   - `next_visit_question` → find the client from the sender (family contact → `client_id`), `cal.onDay` for the next 7 days filtered by the client's last name in the title, reply by email (`--in-reply-to`) with the next visit day, time, and caregiver first name. Note on the client timeline.
   - `availability_change` → update the caregiver's `availability` custom property with the LLM's rewrite of the new availability (`askJSON` → `{availability: string}`), note on the timeline, reply "updated, thanks", and create a task for the owner if any visit in the next 30 days for that caregiver now falls outside the new availability (`cal.onDay` over the range, filter by name; if too slow, skip this check and only note it).
   - `other` → `tasks create` `Needs a human: <summary>` assigned to the owner with the email link in the description; reply "Got it, someone from the office will get back to you today."

**`timer` `morning_brief`:** read today's occurrences (`cal.onDay`), count visits, list any `status: needs_cover`, open `APPROVE:` tasks, deals in `New request` / `Applied`, caregivers with `cert_expires` within 30 days. Post one message in #office:
```
☀️ Ops: Today — 14 visits, 1 needs cover (Patel 2–6pm), 1 approval waiting, 2 new client requests, 1 new applicant, 3 certificates expiring this month.
```
and email the same to the owner. No LLM needed.

**`handoff`** (from anyone, `kind: 'narrate'`): post the given line in #office. Lanes 2 and 3 may use this instead of calling `chat.office` directly if they prefer; both are fine.

## Step 7 — Integration run (3:15 – 3:45 PM)

1. `npm run reset`. 2. From `DEMO_GMAIL` send Maria's email to ops@: subject `Can't make it today`, body `Hi, it's Maria. I'm sick and can't do Mr. Patel's visit today 2 to 6. Sorry!` (For the demo, "today" must be a Tuesday or Thursday in the seed; if today is not, Maria writes "Tuesday" and the demo says "tomorrow". Decide now and put the date in `fixtures/sam/callout-email.json`.) 3. Watch #office. 4. Reply YES from `+priya`. 5. Mark the approval Done in the UI. 6. Submit the two forms from a phone. 7. Check the audit log. Time the whole thing: it must fit in 90 seconds of video with cuts.

## Step 8 — Video, README, submission

- Screen record the Ambiguous UI at 1080p, phone visible on webcam for the email replies. Narrate live; no music. Follow the shot list in the README section 2. Two takes maximum.
- README sections: one-paragraph pitch, the four coworkers, "how work flows" diagram in text, the data conventions (link to `plan/00-README-everyone.md`), run instructions, team contributions (three lines each), "written today" statement.
- Social post text (LinkedIn or X) with the sponsor tags from `resources.md` and `#AgentsEverywhere`. Copy the URL into the form.
- Submit as team lead by 4:25 PM.

## Fallbacks you own

- No webhooks → `notifications watch` + inbox polling (server.ts fallback).
- No external email → tell Person 2 to switch to the `Reply to an offer` form path; create that form in seed (fields: `visit_code` text, `email` email, `answer` select YES/NO).
- Fourth agent not allowed → Cara and Ravi share `AMBI_KEY_CARA`; change the display name to `Cara (care & people)`.
- Recurrence broken → seed 7 days of single events (about 100 events); Sam uses `calendar events update` instead of `edit-single` (Person 2's `cal.editOccurrence` wrapper hides this, so only `ambi.ts` changes).
