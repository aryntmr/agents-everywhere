# Bayside Home Care — an agency run by AI coworkers inside Ambiguous

**Read this whole file before you open your coding agent. Then read `plan/01-dependency-map.md` (who waits on whom) and your lane file.**
Everything in here is a decision, not a suggestion. If you want to change one, say it in the team chat first. We have three hours. Merging three people's work at 3:45 PM only works if nobody drifts.

Hard deadline: **4:30 PM PDT today**. Code freeze **3:45 PM**. Video recorded by **4:10 PM**.

Lanes: **Adamay = lane 1** (foundation, seed, Ops, Cara, README, and getting a model key from the organizers), **Aryan = lane 2** (Sam, the spine; also workspace owner, video, submission), **Akshat = lane 3** (Ravi).

---

## 1. What we are building, in plain words

A small home care agency sends caregivers into clients' homes for scheduled visits (bathing, meals, medication reminders, company). Today an agency like this needs an office of 5 to 10 people whose whole day is: answer the phone and inbox, find a replacement when a caregiver cancels, take new client requests, screen job applicants, book interviews and assessments, keep everyone's paperwork current, and update the calendar and the client records after every change.

We are building that office inside **Ambiguous AI**, a workspace suite (mail, chat, calendar, tasks, CRM, docs, forms) where an AI can be a real coworker with its own account, inbox, and name. Our agency has **one human owner** and **four AI coworkers**:

| Coworker | Job in one line | Built by |
| --- | --- | --- |
| **Ops** | Front desk. Reads everything that arrives, decides who handles it, hands it off, keeps the office channel and the daily brief. | Adamay |
| **Sam** | Scheduler. When a caregiver cancels, finds the best replacements, makes the offers, gets the owner's OK, fixes the calendar, tells the family. | Aryan |
| **Cara** | Care coordinator. Turns a family's "we need care" request into a client record, a care plan draft, and a booked assessment. | Adamay |
| **Ravi** | People. Turns a job application into a screened candidate with a booked interview, and keeps caregiver certifications from expiring. | Akshat |

The human owner does exactly one kind of work: clicking **Done** on an approval task when a coworker wants to put a caregiver into a client's home. Everything else runs on its own and is visible in the workspace as it happens.

Why this wins the "Best Use of Ambiguous AI" prize: every action a coworker takes is a real Ambiguous action, under that coworker's own name, in the same apps the owner uses. Work arrives the way it arrives at a real office (an email, a form, a task) and the coworkers hand work to each other through the workspace itself. The audit log at the end shows four named coworkers doing a day's work.

Why it scores on the general rubric: the agent lives where the work already is (criterion 2), it is many real integrations chained together with a human approval step (criterion 3), and the value is obvious: a one-person agency (criterion 4). Criterion 1 is "does it run", which is what the next three hours are for.

---

## 2. The two-minute demo, shot by shot

This is the target. Every lane exists to make one of these shots real. If something is not in this list, it is not in scope.

| Time | On screen | Who makes it work |
| --- | --- | --- |
| 0:00 | Title: "Bayside Home Care. One owner. Four AI coworkers. Zero office staff." | Adamay |
| 0:08 | Ambiguous member list: the owner plus Ops, Sam, Cara, Ravi. CRM with 50 clients and 50 caregivers. The Visits calendar for the month. | Adamay |
| 0:22 | Maria (a caregiver) emails the office from her phone: "Sick today, can't do Mr. Patel 2 to 6." Ops's inbox lights up. Ops posts in #office: "Call-out from Maria for Patel today. Handing to Sam." | Adamay |
| 0:40 | Sam flips the calendar visit to red NEEDS COVER. A task appears: "Cover Patel, Tue 2–6pm" with three ranked caregivers and a one-line reason each ("Gujarati speaker, did 4 visits with Patel, free Tue afternoons"). Three offer emails go out from Sam's own address. | Aryan |
| 1:00 | Priya replies YES from her phone. Sam creates "APPROVE: Priya for Patel, Tue 2–6pm" assigned to the owner. Owner clicks Done. | Aryan + Adamay (approval helper) |
| 1:15 | Calendar visit turns green with Priya's name. The family gets an email. The other two get "filled, thank you". Both CRM cards get a note. The cover task closes itself. | Aryan |
| 1:30 | Cut: a family fills the public "Request care" form. Cara creates the client, drafts a care plan doc, books an assessment on the owner's calendar, emails the family. Pipeline card moves to "Assessment booked". | Adamay |
| 1:42 | Cut: someone fills the public "Apply to work here" form. Ravi screens it, books an interview, emails them. Pipeline card moves to "Interview booked". | Akshat |
| 1:52 | Audit log filtered to the last 10 minutes: Ops, Sam, Cara, Ravi by name, dozens of actions. Closing card. | Adamay |

The spine that must never break: **Maria emails → Sam offers → Priya says YES → owner approves → calendar, family, CRM updated.** If we are behind at 3:15 PM, everything else gets cut before this.

---

## 3. One workspace, one truth: how data is laid out in Ambiguous

Everyone reads and writes the same live workspace ("freddie's workspace"). These conventions are the contract. Do not invent parallel structures.

### 3.1 People live in the CRM

Every person the agency deals with is a CRM contact of type `person`. There are no spreadsheets. The kind of person is stored in the contact's custom properties as `role`.

| role | Who | Extra custom properties |
| --- | --- | --- |
| `caregiver` | Works visits | `skills` (comma list from the skills vocabulary), `languages` (comma list), `gender` (`female`/`male`), `ok_with_pets` (`yes`/`no`), `ok_with_smokers` (`yes`/`no`), `has_car` (`yes`/`no`), `availability` (free text like `Mon-Fri 08:00-18:00; Sat 08:00-14:00`), `max_hours_week` (number), `zip`, `cert_type` (`HHA`/`CNA`/`none`), `cert_expires` (`YYYY-MM-DD`), `status` (`active`/`onboarding`/`inactive`) |
| `client` | Receives visits | `needs` (comma list from the skills vocabulary), `preferences` (free text, e.g. `female caregiver; Gujarati speaker preferred`), `has_pets` (`yes`/`no`), `smoker` (`yes`/`no`), `language`, `zip`, `hours_week` (number), `family_contact_id` (CRM id of the family contact), `status` (`active`/`onboarding`/`paused`) |
| `family` | Speaks for a client | `client_id` (CRM id of the client) |
| `applicant` | Wants a job | `cert_type`, `cert_expires`, `years_experience`, `skills`, `languages`, `has_car`, `zip`, `availability` |

The contact's `title` field (a normal CRM field) also holds the role in words (`Caregiver`, `Client`, `Family contact`, `Applicant`) so it reads well in the UI.

**Skills vocabulary** (the only allowed values, used for both caregiver `skills` and client `needs`):
`bathing, transfers, dementia, meals, meds, companionship, driving, hoyer, mobility, overnight`

**How to find people:** fetch all contacts once with `crm contacts list --limit 100 --json` and filter in code on `custom_properties.role`. Do not rely on text search for role. Emails are unique; find a person by email with `crm contacts list --q <email>`.

**Where memory lives:** every time a coworker learns something about a person, it writes a note on that contact's timeline with `crm activities create --type note --contact-id <id> --body "..."`. Before ranking or drafting, coworkers read the timeline with `crm contacts activities <id>`. That is how Sam knows Priya has covered Patel before. Notes are the agency's memory. Write them generously, one line each, starting with the coworker's name: `Sam: covered Patel Tue Sep 16 2–6pm after Maria called out sick.`

### 3.2 Pipelines track a person's journey

Two CRM pipelines, created by the seed script (Adamay):

- **Client Onboarding**: `New request` → `Assessment booked` → `Care plan drafted` → `Active client`
- **Hiring**: `Applied` → `Screened` → `Interview booked` → `Offer` → `Active caregiver`

A deal is one journey. Deal title = the person's name. Deal is linked to the contact with `--contact-id`.

### 3.3 Visits live on one shared calendar named `Visits`

One visit = one calendar event (or one occurrence of a repeating event). Rules:

- Title format is fixed: `Visit — <Client last name> — <Caregiver first name>`. Example: `Visit — Patel — Maria`.
- When a visit needs a replacement, the title becomes `NEEDS COVER — Visit — Patel — (was Maria)` and the color is red. When covered: `Visit — Patel — Priya (covering)` and the color is green.
- The description holds machine-readable lines, one per line, exactly like this:
  ```
  client_id: <crm contact id>
  caregiver_id: <crm contact id>
  status: scheduled | needs_cover | covered
  ```
- The event is linked to the client with `--contact-id <client crm id>`.
- Repeating visits use a recurrence rule, e.g. `--recurrence-rule "FREQ=WEEKLY;BYDAY=TU,TH"`. To change one day only, use `calendar events edit-single <master id> --occurrence-date YYYY-MM-DD ...`. To list what is actually happening on a day, use `calendar events list --start ... --end ... --single-events true` (this expands repeating events into real occurrences).
- Assessments and interviews also go on `Visits` with titles `Assessment — <client last name>` and `Interview — <applicant name>`, attendees = the owner.

### 3.4 Tasks are how coworkers ask humans (and each other) for things

One project named `Office`. Task titles are fixed formats so the demo reads well:

- `Cover: <Client> — <Day> <time>` (Sam's working task, assigned to Sam)
- `APPROVE: <Caregiver> for <Client> — <Day> <time>` (assigned to the owner; owner marks Done to approve)
- `Review application: <name>` (assigned to the owner when Ravi will not decide alone)
- `Needs a human: <one line>` (Ops, for anything it cannot route)

### 3.5 Chat is the narration

One public channel `#office`. Every coworker posts one line when it starts something and one line when it finishes. Format: `<emoji> <Coworker>: <what happened>`. Examples:
`📨 Ops: call-out from Maria (Patel, today 2–6pm) → handing to Sam`
`✅ Sam: Patel Tue 2–6pm covered by Priya. Family notified.`
Keep it to one line. This channel is what the owner watches, and it is what the video shows.

### 3.6 Docs

- `Agency Rulebook` (a Doc, created by seed): the plain-English policies the coworkers follow. Every coworker reads it with `docs get <RULEBOOK_DOC_ID>` and pastes it into its prompt. It is the "how we do things here" memory and it is editable by the owner in the UI, which is a great demo line ("the owner changes a rule in a doc and the coworkers follow it").
- `Care Plan — <client>` docs created by Cara.

### 3.7 Forms (public links, no account needed)

- `Request care` (Cara's front door) and `Apply to work with us` (Ravi's front door). Fields are listed in lane 1 step 4. Adamay creates them in seed and puts their ids in `config/ids.json`.

### 3.8 Mail

Each coworker has its own inbox on the workspace domain: `ops@…`, `sam@…`, `cara@…`, `ravi@…` (exact domain comes from `whoami` / `admin domains list`). The public front door for humans is **ops@**. Sam sends offers from **sam@** and caregivers reply to that address. Emails are written in Markdown with `--body-markdown`, and must read like a friendly human wrote them: short, first name, no corporate voice, no bullet lists longer than three items.

**Safety rule for sending:** only send to addresses that end in a domain from `config/ids.json → email_allowlist` (our own Gmail plus-addresses for the demo people). Any other address (the 90-odd seeded people with `@example.com`) is not sent; instead write a CRM note `Sam: would have emailed <addr>: <subject>`. The `ambi.mail.send` helper enforces this so nobody has to remember.

---

## 4. Code layout and the contract between lanes

One repo: `github.com/aryntmr/agents-everywhere` (already exists, public). One Node + TypeScript project at the root. No build step: run with `tsx`.

```
agents-everywhere/
  package.json                 owner: Adamay   (tell chat before adding a dependency)
  .env                         never committed; keys live here
  config/ids.json              committed; every workspace id the code needs (calendar, channel, forms, pipelines, owner user id, agent user ids, email allowlist)
  fixtures/                    sample webhook payloads and sample emails/forms for offline testing (each lane adds its own)
  src/
    types.ts                   owner: Adamay   FROZEN after 2:20 PM. The event shape and the coworker interface.
    ambi.ts                    owner: Adamay   the only way anyone talks to Ambiguous
    llm.ts                     owner: Adamay   the only way anyone talks to the model
    approvals.ts               owner: Adamay   "ask the owner, wait for Done"
    rulebook.ts                owner: Adamay   loads the Agency Rulebook doc text (cached 60s)
    people.ts                  owner: Adamay   load all CRM contacts, filter by role, find by email, add note
    server.ts                  owner: Adamay   receives Ambiguous events, routes to coworkers
    seed/                      owner: Adamay   seed + reset scripts and data generators
    coworkers/
      ops.ts                   owner: Adamay
      sam.ts                   owner: Aryan
      cara.ts                  owner: Adamay
      ravi.ts                  owner: Akshat
  plan/                        these docs
  README.md                    owner: Adamay (written at 3:45 PM; each person sends 3 lines about what they built)
```

### 4.1 `src/types.ts` (Adamay pushes this in the first 15 minutes; everyone codes against it)

```ts
export type Who = 'ops' | 'sam' | 'cara' | 'ravi';

// Every event that reaches a coworker is normalized to this shape by server.ts.
// Handlers must NOT depend on the raw webhook payload. Fetch the resource by id.
export type Event =
  | { type: 'email'; who: Who; emailId: string; to: string; from: string; subject: string; raw?: unknown }
  | { type: 'form'; who: Who; formId: string; responseId?: string; answers: Record<string, unknown>; raw?: unknown }
  | { type: 'task_done'; who: Who; taskId: string; raw?: unknown }
  | { type: 'handoff'; who: Who; from: Who; kind: string; payload: Record<string, unknown> }  // coworker → coworker
  | { type: 'timer'; who: Who; kind: 'morning_brief' | 'cert_sweep' | 'offer_timeout'; payload?: Record<string, unknown> };

export interface Coworker {
  who: Who;
  handle(event: Event): Promise<void>;
}
```

### 4.2 `src/ambi.ts` (the one helper everyone uses)

```ts
// Runs the official Ambiguous CLI as the given coworker and returns parsed JSON.
// args exactly as in `npx ambiguous@latest catalog <module>`; body (optional) is piped as JSON on stdin
// for multiline fields like --body-markdown or --description.
export async function ambi(as: Who, args: string[], body?: Record<string, unknown>): Promise<any>;

// Convenience wrappers (all implemented on top of ambi):
export const mail = { send(as, {to, subject, markdown, inReplyTo?, threadId?, contactId?}), get(as, id), inbox(as) };
export const chat = { office(as, line) };                       // one-line post in #office
export const crm  = { note(as, contactId, text), findByEmail(as, email), all(as), get(as, id), activities(as, id) };
export const cal  = { onDay(as, dateISO), editOccurrence(as, masterId, date, fields), create(as, fields), availability(as, userIds, start, end) };
export const tasks = { create(as, fields), done(as, id), comment(as, id, text) };
```

If a wrapper you need is missing, call `ambi(...)` directly with the catalog's exact flags. Do not write your own subprocess code.

### 4.3 How a coworker is run

- **Live:** `npm run dev` starts `server.ts`, which receives Ambiguous events and calls `coworkers[who].handle(event)`.
- **Offline (this is how you develop):** `npm run co -- sam fixtures/sam/callout-email.json` runs `sam.handle(<that event>)` directly, against the real workspace, without waiting for any webhook. Adamay provides `src/run.ts` for this in the skeleton. **Lanes 2 and 3 never wait on lane 1's server.** Write your fixture first, then your handler.

### 4.4 Handoffs between coworkers

`await handoff('sam', { from: 'ops', kind: 'callout', payload: { emailId } })` in `src/server.ts` (exported). Offline it just calls the target handler in-process. That is how Ops hands a call-out to Sam. Sam never reads Ops's inbox.

### 4.5 Asking the owner

`const ok = await approvals.request(as, { title, description, contactId? })`. It creates the task assigned to the owner, posts in #office, then resolves `true` when the owner marks it Done (via the task-completed event, or by polling `tasks get` every 10 seconds as a fallback). Nothing else is needed from the caller.

---

## 5. Repo rules (this is how the merge works)

1. Everyone commits to `main`. No feature branches today. `git pull --rebase` before every push. Push at least every 20 minutes.
2. You only edit files you own (table in section 4). Need a change in a shared file? Post in chat; Adamay makes it within 5 minutes.
3. `src/types.ts` is frozen at 2:20 PM. After that, adapt your code to it, not the other way round.
4. New dependency? Say it in chat first (package.json is shared). Pin with `npm i <pkg>@latest`.
5. Every coworker must run offline from a fixture (`npm run co -- <who> <fixture>`) and must not throw on a repeat of the same fixture (running it twice should be safe: find-before-create for contacts, deals, tasks).
6. No secrets in git. Keys live in `.env`. Workspace ids live in `config/ids.json` and are fine to commit.
7. Test against the live workspace freely, but prefix anything you create by hand with `TEST ` so the reset script can remove it. Coworkers never create `TEST ` things.
8. Log every Ambiguous call in one line to stdout (`ambi.ts` does this) so we can debug the integration run without a debugger.
9. Plain, warm language in every email and chat line. No jargon a family member would not understand. No "per our records".

---

## 6. Timeline (PDT)

| When | Adamay (foundation + Ops + Cara) | Aryan (Sam) | Akshat (Ravi) |
| --- | --- | --- | --- |
| **now – 2:00** | Read docs. Ask the organizers for an OpenRouter/OpenAI API key (lane 1 step 0) and keep asking until it lands. Provision the 4 coworkers, collect keys. Push skeleton: package.json, types.ts, ambi.ts, run.ts, config/ids.json (partial). Start the 20-minute verification list (section 8). | Read docs. Run `npx ambiguous@latest catalog calendar`, `catalog mail`, `catalog crm`, `catalog tasks`. Write `fixtures/sam/*.json`. Draft Sam's ranking prompt. | Read docs. Run `catalog forms`, `catalog crm`, `catalog docs`, `catalog calendar`. Write `fixtures/ravi/*.json`. Draft Ravi's screening prompt. |
| **2:00 – 2:20** | Post keys + partial ids in chat. Freeze types.ts. Seed: pipelines, calendar, channel, project, forms, rulebook doc. | Implement Sam steps 1–4 (read call-out, find the visit, flip it). | Ravi steps 1–2 (applicant contact, deal, screening). |
| **2:20 – 3:00** | Seed 50 + 50 contacts and the month of visits. Post full `config/ids.json`. Write approvals.ts, people.ts, rulebook.ts, server.ts routing, Ops classify + handoff. | Sam steps 5–8 (candidates, rank, task, offers). | Ravi steps 3–5 (interview, hold, owner review). |
| **3:00 – 3:30** | Cloudflared tunnel, register webhooks, live end-to-end: real email to ops@ → Sam offers. Then Cara steps 1–6 (`plan/lane-1b-cara.md`). Reset script. Morning brief only if time. | Sam steps 9–12 (YES reply, approval, updates, notifications). | Ravi step 6 (certification sweep). Then test Cara's request-care form for Adamay and polish emails. |
| **3:30 – 3:45** | Integration run twice from a clean reset. Fix what breaks, in priority order (section 7). | Same | Same |
| **3:45** | **Code freeze.** Adamay writes README from everyone's 3 lines and drafts the social post. | Aryan drives the video (owner screen, clicks the approval). Adamay plays "Priya" on a phone. | Akshat plays the family and the applicant on a phone. |
| **3:45 – 4:10** | Record the video in one take (two if needed): Aryan's screen shows the Ambiguous UI, phones on camera for the replies. | | |
| **4:10 – 4:25** | Adamay: upload video, post the social post with all sponsor tags + #AgentsEverywhere, send Aryan the URLs. | Aryan: fill the form and submit as team lead. | Review the description text. |

---

## 7. Cut list (drop from the top when behind; never cut the spine)

1. Ops: availability-change handling and family-question answering.
2. Ravi: certification sweep.
3. Sam: offer timeout / escalation to the owner.
4. Ops: morning brief.
5. Sam: weekly-hours check.
6. Cara: care plan doc (keep the assessment booking and the email).
7. Ravi: interview booking (keep screening + pipeline move + email).

The spine (never cut): Maria emails ops@ → Ops hands to Sam → Sam flips the visit, ranks, emails three offers → Priya replies YES → approval task → owner marks Done → calendar, family email, CRM notes, #office line.

---

## 8. First-20-minute verification (Adamay runs these; results go in chat as ✅/❌ so lanes 2 and 3 can pick their fallback)

| # | Check | If ✅ | If ❌ |
| --- | --- | --- | --- |
| 1 | ✅ Done at Gate 0 by `node scripts/provision-coworkers.mjs`: ops@, sam@, cara@, ravi@freddies-workspace.ambi.cc, ids in `config/ids.json`. | Four names in the audit log. | One shared agent key; names come from the #office line prefix only. |
| 2 | ✅ Checked at Gate 0 with `webhooks event-types`. Names: `email.received`, `form.submitted`, `task.completed`, `task.assigned`. | server.ts uses those names. | Fall back to `notifications watch` (streams @mentions, DMs, task assignments) plus polling `mail inbox --unread` every 15 s. |
| 3 | Email round trip: `mail send` from sam@ to a Gmail address arrives; replying from Gmail shows up in `mail inbox` for sam@. | Offers and YES replies go by email. | Caregivers reply through a third public form `Reply to an offer` (fields: visit code, your email, yes/no) and Sam listens to form events instead. Aryan builds that path. |
| 4 | Public form link works while logged out and a submission fires the form event (or shows in `forms get`). | Cara/Ravi listen to form events. | Cara/Ravi poll `api GET /api/forms/<id>/responses` every 15 s. |
| 5 | `calendar events create` with a recurrence rule, then `calendar events list --single-events true` on a day shows occurrences, and `edit-single` changes one occurrence only. | Month of visits = ~70 repeating series. | Seed only the next 7 days as single events. |
| 6 | A task assigned to the owner, marked Done in the UI, produces a task-completed event. | approvals.ts uses the event. | approvals.ts polls `tasks get` every 10 s (write this path anyway). |

---

## 9. Ambiguous: what every coding agent needs to know (paste this section into your agent's context)

Ambiguous is a workspace suite with 17 apps and a single API. The official CLI is a thin shell over that API and is the reference: **run `npx ambiguous@latest catalog <module>` and use exactly those flags. Do not guess flag names.**

### Setup

```bash
cd ~/Personal/hackathons/agents-everywhere
set -a; source .env; set +a                 # loads AMBI_KEY_OPS, AMBI_KEY_SAM, ... and OPENAI_API_KEY
AMBI_API_TOKEN=$AMBI_KEY_SAM npx ambiguous@latest whoami     # confirm you are Sam
npx ambiguous@latest catalog crm            # list every crm command with exact flags
npx ambiguous@latest crm contacts create --help   # long help for one command
```

- Token precedence: `AMBI_API_TOKEN` env var beats any saved config. `ambi.ts` sets it per call, which is how four coworkers share one process.
- Every command: the **path id is the only positional**; every other field is a `--flag` in kebab-case (`assignee_id` → `--assignee-id`). Enum values appear inline in the catalog. Arrays are comma-separated (`--attendees id1,id2`) or JSON.
- Multiline text (email bodies, descriptions): pipe JSON on stdin, it merges over the flags. `ambi(as, args, body)` does this for you.
- `--json` (or piped stdout) returns JSON only. Errors look like `{"ok":false,"error":"Task not found","statusCode":404}`. Exit code 2 = auth problem.
- **A command that exits 0 is not proof the change happened. Read the returned object.**
- Rate limit: about 60 requests per minute per identity. The seed script sleeps 1.1 s between writes. Coworkers should batch reads (`crm contacts list --limit 100` once, not 50 `get`s).
- Budget: the workspace has 5,000 actions. Seed ≈ 250. A full demo run ≈ 60. Do not write polling loops tighter than 10 seconds.
- Escape hatch for anything without a CLI command: `npx ambiguous@latest api GET /api/forms/<id>/responses` (raw REST, same token).
- Interactive REST docs while logged in: https://app.ambiguous.ai/developers. Operating guide: `npx ambiguous@latest skill`. Recipes (webhooks, task handoff): https://www.ambiguous.ai/agents/recipes

### Commands we use (exact, from the live catalog)

**Identity / admin (Adamay only)**
```
admin users provision-agent --display-name <name> [--username <local part> --role <owner|admin|member|limited>]   → returns {user, api_key} ONCE
admin users list --type agent
admin domains list
admin audit-log list [--user-id --action --resource-type --start --end --limit]
webhooks event-types
webhooks create --url <https url> --name <name> --events <csv> [--description]   → returns HMAC secret ONCE
webhooks list
notifications watch          # JSON lines: @mentions, DMs, task assignments, doc shares (fallback wake-up path)
notifications mark-read <id> # returns was_unread; act only if true
```

Confirmed webhook event names (checked at Gate 0): `email.received`, `form.submitted`, `task.completed`, `task.assigned`, `mention`, `message.received`, `event.updated`, `deal.stage_changed`, `contact.created`, `document.shared`. Subscribing to `*` gets everything; filter in `server.ts`. A free workspace allows 5 members, so the owner plus four coworkers is the ceiling.

**CRM**
```
crm contacts create [--type person --name --first-name --last-name --email --phone --title --custom-properties <json>]
crm contacts list [--type person --q <text> --limit 100 --cursor --offset]
crm contacts get <id>
crm contacts update <id> [--name --email --phone --title --custom-properties <json>]
crm contacts activities <id> [--type note --limit]        # the person's timeline (our memory)
crm activities create --type note --contact-id <id> --body <text>   # write memory
crm pipelines create --name <name> --stages '[{"name":"New request","sort_order":0},...]'
crm pipelines list
crm deals create --title <title> --pipeline-id <id> --stage-id <id> --contact-id <id> [--amount --status open]
crm deals update <id> [--stage-id --status <open|won|lost> --lost-reason]
crm deals list [--pipeline-id --stage-id --contact-id]
crm property-definitions create --entity-type contact --key <key> --label <label> --field-type <type>   # optional typing; untyped custom_properties still store fine
```

**Calendar**
```
calendar list                                   # find the Visits calendar id (seed creates it: calendar create --name Visits --timezone America/Los_Angeles)
calendar events create <calendar_id> --title <t> --start-at <RFC3339> --end-at <RFC3339> [--description --recurrence-rule "FREQ=WEEKLY;BYDAY=TU,TH" --attendees <csv of user ids> --contact-id <crm id> --color --status <confirmed|tentative|cancelled>]
calendar events list [--start --end --calendar-id --q <text> --single-events true --limit]   # single-events expands repeating events into occurrences
calendar events instances <master id> --start --end
calendar events get <id>
calendar events update <id> [--title --description --color --attendees --status ...]         # non-repeating events
calendar events edit-single <master id> --occurrence-date YYYY-MM-DD [--title --description --color --attendees ...]   # one day of a repeating visit
calendar availability --user-ids <csv> --start <RFC3339> --end <RFC3339>                      # busy blocks for the owner
calendar conflicts [--user-ids --start --end]
```

**Mail**
```
mail send --to <csv> --subject <s> [--body-markdown <md> --in-reply-to <email id> --thread-id <id> --contact-id <crm id> --idempotency-key <k>]
mail inbox [--unread true --limit --detail full --mailbox-id]
mail get <id> --detail full                    # full Markdown body, from, to, subject, thread id
mail search --q "from:priya@..."               # Gmail-style operators
mail mark <id> --read true
```

**Tasks / projects**
```
projects create --name Office
tasks create --title <t> [--description --assignee-id <user id> --priority <urgent|high|medium|low> --due-date --project-id --contact-id --status <todo|in_progress|done|cancelled|blocked>]
tasks get <id>
tasks update <id> [--status done --assignee-id --description]
tasks list [--assignee-id --status --project-id --q]
api POST /api/tasks/<id>/comments  {"content":"..."}     # comment on a task (REST escape hatch)
```

**Chat**
```
chat channels create --type public --name office
chat channels list
chat messages send <channel_id> --content <markdown>
chat reactions add <channel_id> <message_id> --emoji 👀
```

**Docs**
```
docs create --type doc --title <t> --content <markdown>
docs get <id>                                   # returns content
docs update <id> --content <full markdown>      # replaces the whole body
docs list --type doc
```

**Forms**
```
forms create --title <t> --fields '<json array of {id,type,label,required,options,...}>' --is-published true   → returns id + public slug
forms get <id>
api GET /api/forms/<id>/responses               # list submissions (fallback when not listening to events)
```

**Cross-app**
```
search filtered --query <text> --modules docs,tasks,contacts,calendar
activity list [--resource-type --user-id --limit]    # last 30 days of workspace activity
```

### Behavioral rules from the Ambiguous operating guide (they apply to us)

- Verify a request's claims against the workspace, do not answer from the message alone (Sam checks the calendar before believing "my 2 pm visit").
- Reply where the request came from: an email gets an email reply; a chat mention gets a chat reply.
- Read the resource by id before acting on it.
- Mark a notification read before acting; act only if `was_unread` is true (only matters if we use `notifications watch`).
- Every coworker acts under its own identity so the audit log shows who did what.

---

## 10. Names, addresses, and demo people

- Agency: **Bayside Home Care**, San Francisco. Timezone America/Los_Angeles.
- Human owner: the workspace owner account (Aryan's Ambiguous login). Aryan clicks the approvals in the demo. Its user id goes in `config/ids.json → owner_user_id`.
- Coworkers: Ops, Sam, Cara, Ravi. Usernames `ops`, `sam`, `cara`, `ravi`. Display names `Ops (front desk)`, `Sam (scheduling)`, `Cara (care coordination)`, `Ravi (people)`.
- Demo caregivers with real inboxes (Gmail plus-addresses on one account we control, put the base address in `.env` as `DEMO_GMAIL` and generate `base+maria@gmail.com` etc.): **Maria Lopez** (the one who calls out), **Priya Shah** (says YES), **Dev Mehta** and **Rosa Alvarez** (the other two offers; Dev replies "no" in the video if there is time).
- Demo client: **Mr. Arun Patel**, Tuesday/Thursday 2–6 pm, needs `transfers, meals, meds`, preferences `Gujarati speaker preferred`, family contact **Neha Patel** (`base+neha@gmail.com`).
- Seed guarantees that Priya, Dev, and Rosa are the three best fits for Patel (only they have Gujarati or Hindi and `transfers`, are free Tuesday afternoons, and have no visit at 2–6 pm). Everyone else in the seed has an `@example.com` address and is never emailed.
- Demo applicant: **Jordan Kim** (Akshat's own plus-address). Demo family for intake: **Lena Ortiz** asking for her father **Carlos Ortiz** (Akshat's plus-address).

---

## 11. Submission checklist (Aryan submits as team lead at 4:10 PM; Adamay prepares README and the social post text)

- Video ≤ 2:00, uploaded (YouTube unlisted or Loom).
- Repo public, README: what it is, the four coworkers, architecture in 10 lines, how to run, what each person built, which parts were written today (all of `src/`).
- Social post with `#AgentsEverywhere` and the sponsor tags from `resources.md`.
- Form: name `Bayside Home Care — an agency run by AI coworkers in Ambiguous`; description hits all four criteria; tools ticked: Ambiguous AI, OpenAI (or OpenRouter if that key is used), Google Cloud Run only if we actually deployed (we probably will not; cloudflared is fine, and we say so).
