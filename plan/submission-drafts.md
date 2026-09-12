# Bayside Home Care: submission drafts

Team freddie, AI Tinkerers "Agents, Everywhere", San Francisco, Sep 12, 2026. Every claim below was checked against `src/` and `git log` at 3:58 PM (last commit 2e4ce56). The plan's offer timeout and weekly-hours check are not in the code, so they are left out.

## 1. Project name and tagline

**Project name:** Bayside Home Care

**Tagline:** A home care agency run by one owner and four AI coworkers inside Ambiguous.

## 2. Submission description

242 words including the "Built with" line (limit 250). Paste the block into Project Description; the form accepts Markdown.

```markdown
Bayside Home Care is a home care agency run in Ambiguous AI by one owner and four AI coworkers with their own accounts.

**Core requirements & functionality:** A caregiver emails ops@ that she is sick. Ops classifies it with an LLM and hands it to Sam, who flags the visit, ranks replacements from CRM data and notes, and emails three offers. After a YES and owner approval, Sam updates the calendar and CRM and emails the family. Cara turns care request forms into contacts, a deal, a care plan, an assessment and a family email. Ravi screens applications from the jobs form, then books an interview, holds, or asks the owner.

**Innovation & theme alignment:** The agents live in the workspace, not a chat box: the calendar says which visit, CRM notes show who covered this client before, the owner's free time sets meetings, and approval is an ordinary task.

**Technical execution & integration:** Every workspace action is a real Ambiguous CLI call under the coworker's own key, so the audit log shows who did what. Rules run in code, model outputs follow JSON schemas, and unclear cases become owner tasks.

**Usefulness & agentic experience:** A one-owner agency gets call-out cover, intake and hiring done in its usual tools, watches #office, and approves placements in one click.

**Built with:** Ambiguous AI (CRM, Calendar, Mail, Tasks, Chat, Docs, Forms, webhooks, agent accounts) via the ambiguous CLI; OpenAI API (gpt-5.6-luna); Node.js; TypeScript; tsx; cloudflared
```

## 3. What each person built

**Aryan Tomar (lead)**
- Planned the build (shared data contract, demo shot list, three lanes and their dependency map) and set up the Ambiguous workspace: `scripts/provision-coworkers.mjs` creates the four AI coworker accounts through the Ambiguous admin API, saves each one's API key, and writes their ids to `config/ids.json`.
- Built Sam (`src/coworkers/sam.ts`): finds the called-out visit on the Ambiguous Calendar, filters and ranks caregivers from Ambiguous CRM properties, same-day visits and timeline notes, emails three offers, reads YES/NO replies (OpenAI only when a reply is unclear), asks the owner through an Ambiguous task, then updates the calendar, caregivers, family, CRM notes and its Cover task.

**Adamay Mann**
- Built the shared layer: `src/ambi.ts` (runs the official Ambiguous CLI under each coworker's key, email allowlist, one-day edits of repeating calendar events), `llm.ts` (OpenAI with strict JSON schemas), `people.ts`, `rulebook.ts`, `approvals.ts`, the webhook server and fixture runner, and the seed and reset scripts (Visits calendar, #office, Office project, two CRM pipelines, two public Ambiguous Forms, the Agency Rulebook doc, 150 contacts, 72 visit series).
- Built Ops (`ops.ts`: OpenAI email classification with a keyword fallback, routing, next-visit answers from the calendar, availability updates, morning brief), Cara (`cara.ts`: care request form or email to CRM contacts, a Client Onboarding deal, a draft care plan in Ambiguous Docs, an assessment in the owner's first free slot, and a family email), and Ravi's handling of job emails.

**Akshat Manral**
- Built Ravi's hiring flow (`src/coworkers/ravi.ts`): maps "Apply to work with us" form answers, creates the applicant in Ambiguous CRM with a Hiring deal, checks certificate, experience, zip and availability in code, then screens with OpenAI against the Agency Rulebook doc (built-in rules if the doc can't be read). It never rejects anyone.
- Built the three outcomes and the certificate sweep: an interview on the Ambiguous Calendar in the owner's first free 30-minute slot with three tailored questions, a hold email, or an owner review task, moving the Hiring deal as it goes; the daily sweep emails caregivers whose certificates expire within 30 days and gives the owner a task at 7 days or less, or once expired.

Check that Akshat is on team freddie in the portal: `hackathon_information.md` lists only Aryan and Adamay.

## 4. Two-minute video script

**Pre-flight**
- [ ] `npm run reset` (Patel's Tuesday visit goes back to Maria; Office tasks, pipeline deals, Assessment and Interview events, and form-intake contacts are deleted)
- [ ] On the demo machine: `npm run dev` and `cloudflared tunnel --url http://localhost:3000` running, webhooks registered to `https://<tunnel>/events` (a restarted tunnel gets a new URL and needs a new registration)
- [ ] Phone: Gmail open on the `DEMO_GMAIL` account, to send Maria's call-out and to reply YES as Priya
- [ ] Ambiguous tabs open: #office, the Visits calendar on Tuesday Sep 15, Tasks, CRM, admin audit log
- [ ] Don't save files under `src/` while recording: `npm run dev` runs `tsx watch`, and a restart drops Sam's pending approval

Cut the waits between steps in editing. The spoken lines run at about two words per second.

| Time | On screen | Spoken line |
| --- | --- | --- |
| 0:00–0:08 | Title card: "Bayside Home Care. One owner. Four AI coworkers." | "This is Bayside Home Care, a home care agency with one human owner and four AI coworkers." |
| 0:08–0:22 | Ambiguous member list: the owner, Ops (front desk), Sam (scheduling), Cara (care coordination), Ravi (people). CRM contact list (the seed's 50 caregivers, 50 clients and 50 family contacts). Visits calendar, month view. | "Each coworker has its own Ambiguous account and inbox, and works in the same CRM, calendar, mail and tasks I use. These are our clients, caregivers and visits." |
| 0:22–0:40 | Phone, Gmail, to `ops@freddies-workspace.ambi.cc`, subject "Can't make it Tuesday", body "Hi, it's Maria. I'm sick and can't do Mr. Patel's visit on Tuesday 2 to 6. Sorry!" The body must name Maria: Gmail sends from the base address, so Sam finds her by name. Send, then cut to #office: Ops's one-line summary ending "→ handing to Sam". | "Maria, one of our caregivers, emails the front desk. She's sick and can't make Mr. Patel's Tuesday visit. Ops reads the email, sees it's a call-out, and hands it to Sam." |
| 0:40–1:00 | Visits calendar, Tue Sep 15: the Patel visit turns red, "NEEDS COVER — Visit — Patel — (was Maria)". Tasks: "Cover: Patel — Tue Sep 15, 2–6pm", offered to 1. Priya Shah (covered Patel before, speaks Gujarati, free Tue 14:00–18:00), 2. Dev Mehta, 3. Rosa Alvarez, plus a "Filtered out" list. #office: "Sam: offered Patel Tue Sep 15, 2–6pm to Priya, Dev, Rosa. Waiting for a YES." | "Sam marks that visit red. It rules out anyone without the right skills, hours or a free slot, reads the CRM notes of the rest, and ranks three. Priya has covered Mr. Patel before and speaks Gujarati. Sam emails all three." |
| 1:00–1:15 | Phone: open the offer addressed to `+priya` and reply "YES" to that message. If Gmail groups the three offers, use that message's own Reply, because Sam matches the reply by its email thread. #office: "Priya said YES for Patel Tue Sep 15, 2–6pm → asking the owner". Tasks: "APPROVE: Priya for Patel — Tue Sep 15, 2–6pm", assigned to the owner, with Sam's reasons. Mark it Done. | "Priya says yes. Sam doesn't book her on its own. It gives me one approval task with its reasons, and I mark it done." |
| 1:15–1:30 | Calendar: the visit turns green, "Visit — Patel — Priya (covering)". Phone: Sam's "Confirmed" email to Priya, the email to Patel's family contact Neha, and "Filled" emails to Dev and Rosa. CRM: Sam's note on Patel's timeline. Tasks: the Cover task is done, with Sam's comment. #office: "Patel Tue Sep 15, 2–6pm covered by Priya. Family notified, Dev and Rosa thanked, records updated." | "Now Sam updates the calendar, confirms with Priya, tells Mr. Patel's family, thanks Dev and Rosa, writes CRM notes, and closes its task." |
| 1:30–1:42 | Public "Request care" form (`app.ambiguous.ai/f/request-care`) filled as Lena Ortiz for her father Carlos Ortiz (bathing, meals, companionship; a small dog named Chispa) with a `+lena` email. #office: Cara's two lines. Docs: "Care Plan — Carlos Ortiz (DRAFT)". Calendar: "Assessment — Ortiz" with the owner. CRM: the Carlos Ortiz deal in "Assessment booked". | "A family fills out our public care form. Cara creates the client and a deal, drafts a care plan, books an assessment when I'm free, and emails them." |
| 1:42–1:52 | Public "Apply to work with us" form (`app.ambiguous.ai/f/apply-to-work-with-us`) filled as Jordan Kim (HHA certificate valid into 2027, 3 years, zip 94122, weekday availability) with a `+jordan` email. #office: "Ravi: Jordan Kim advances. Interview ... Emailed." Calendar: "Interview — Jordan Kim". CRM: the Jordan Kim deal in "Interview booked". | "A job application comes in. Ravi checks it against our hiring rules, books an interview, and emails the applicant." |
| 1:52–2:00 | Admin audit log for the last 10 minutes: actions by Ops, Sam, Cara and Ravi, each under its own name. End card: "Bayside Home Care · github.com/aryntmr/agents-everywhere". | "The audit log shows each coworker's actions under its own name. I clicked once." |

## 5. README.md draft

````markdown
# Bayside Home Care

A home care agency run inside [Ambiguous AI](https://www.ambiguous.ai) by one owner and four AI coworkers. Built at AI Tinkerers "Agents, Everywhere", San Francisco, Sep 12, 2026.

A small home care agency spends its office hours on the same jobs: finding cover when a caregiver calls out, taking new client requests, screening job applicants, and keeping the calendar, the CRM and families up to date. In Bayside Home Care, four AI coworkers do that work inside an Ambiguous workspace. Each has its own Ambiguous account and inbox, gets work from email, public forms and webhooks, acts in the same Mail, Calendar, CRM, Tasks, Docs and Chat the owner uses, and posts each step in #office. The owner approves a caregiver placement by marking one task Done, and the audit log shows every action under the coworker's name.

## The four coworkers

| Coworker | What it does |
| --- | --- |
| **Ops** (front desk) | Reads email sent to ops@ and classifies it with an LLM (keyword rules if the model call fails). Hands call-outs to Sam, care requests to Cara and job emails to Ravi, answers "when is the next visit" from the calendar, updates caregiver availability, and posts a morning brief in #office. Anything else becomes a "Needs a human" task for the owner. |
| **Sam** (scheduling) | Handles call-outs: finds the visit and marks that day NEEDS COVER, filters caregivers by skills, client preferences, pets, smoking, availability and that day's visits, ranks the rest using their CRM notes, and emails the top three. Reads the replies, asks the owner to approve, then updates the calendar, the caregivers, the family and the CRM. |
| **Cara** (care coordination) | Turns the "Request care" form, or a care request email from Ops, into family and client contacts, a Client Onboarding deal, a draft care plan doc, an assessment in the owner's first free 45-minute slot in the next two business days, and an email to the family. |
| **Ravi** (people) | Turns the "Apply to work with us" form into an applicant contact and a Hiring deal, checks certificate, experience, zip and availability in code, and screens with an LLM against the Agency Rulebook doc. Then it books an interview, sends a hold email, or creates an owner review task; it never rejects anyone. Job emails from Ops get a reply with the form link and a task for the owner. A daily sweep emails caregivers whose certificates expire within 30 days. |

## How work flows

A caregiver call-out, end to end:

1. Maria, a caregiver, emails ops@ that she can't make Mr. Patel's Tuesday visit.
2. Ambiguous sends an `email.received` webhook through the cloudflared tunnel to `src/server.ts`, which routes it to Ops by the recipient address.
3. Ops classifies the email as a call-out, posts a line in #office, and hands it to Sam.
4. Sam finds Maria's Tuesday visit on the Visits calendar and marks that one day red: NEEDS COVER.
5. Sam filters caregivers against the client's needs and preferences, their availability and that day's visits, ranks the rest using their CRM notes, creates a Cover task with its reasons, and emails the top three from sam@.
6. A caregiver replies YES. Sam creates "APPROVE: <caregiver> for <client> — <day, time>" for the owner and waits.
7. The owner marks the task Done. Sam hears it from the `task.completed` webhook, or from a 10-second poll.
8. Sam turns the visit green with the new caregiver, confirms with her, emails the family, thanks the others, writes CRM notes on the client and both caregivers, and closes its Cover task.

The same server sends `form.submitted` from the Request care form to Cara and from the Apply form to Ravi, and runs Ops's morning brief at 07:00 and Ravi's certificate sweep at 07:05 (Pacific time).

## Architecture

```text
Ambiguous --webhooks--> cloudflared --> src/server.ts  POST /events: HMAC check if WEBHOOK_SECRET is set, dedupe, route, timers
src/coworkers/     ops.ts, sam.ts, cara.ts, ravi.ts: one handle(event) each; Ops hands work over through src/registry.ts
src/ambi.ts        runs the official ambiguous CLI with the acting coworker's own API key; emails only allowlisted addresses
src/llm.ts         OpenAI chat completions with strict JSON schemas; src/rulebook.ts reads the Agency Rulebook doc into prompts
src/people.ts      CRM contacts and their timeline notes, the agency's shared memory
src/approvals.ts   the owner's APPROVE task, resolved by task.completed or a 10-second poll
src/run.ts         replays one fixture event against the live workspace
src/seed/          seed and reset scripts for the demo workspace
config/ids.json    workspace ids: calendar, channel, project, pipelines, forms, coworkers
```

## How to run

You need Node.js (we used Node 26), an Ambiguous workspace you own, an OpenAI API key, and cloudflared.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in:
   - `OPENAI_API_KEY` and `OPENAI_MODEL` (we used `gpt-5.6-luna`).
   - `AMBI_KEY_OPS`, `AMBI_KEY_SAM`, `AMBI_KEY_CARA`, `AMBI_KEY_RAVI`: one Ambiguous API key per coworker. With your own owner key in `.env` as `AMBI_OWNER_KEY`, `node scripts/provision-coworkers.mjs` creates the four coworker accounts, writes these keys, and records their ids in `config/ids.json`. For a new workspace, reset that file to `{}` first.
   - `DEMO_GMAIL`: a Gmail address you control. Demo people get plus-addresses on it (`+maria`, `+priya`, `+dev`, `+rosa`, `+neha`; use `+lena` and `+jordan` on the forms). Coworkers only send email to these addresses and the workspace's own domain; other sends become CRM notes.
3. Seed the workspace (safe to re-run):
   ```bash
   npm run seed
   ```
   This creates the Visits calendar, #office, the Office project, the Client Onboarding and Hiring pipelines, the two public forms, the Agency Rulebook doc, 150 contacts (50 caregivers, 50 clients, 50 family contacts) with notes, and 72 weekly visit series starting Monday, Sep 14, 2026.
4. Start the server and a tunnel, then register webhooks:
   ```bash
   npm run dev                                      # src/server.ts on port 3000
   cloudflared tunnel --url http://localhost:3000   # prints https://<random>.trycloudflare.com
   set -a; source .env; set +a
   AMBI_API_TOKEN=$AMBI_KEY_OPS npx ambiguous webhooks create --url https://<random>.trycloudflare.com/events \
     --name bayside-ops --events email.received,form.submitted,task.completed --json
   AMBI_API_TOKEN=$AMBI_KEY_SAM npx ambiguous webhooks create --url https://<random>.trycloudflare.com/events \
     --name bayside-sam --events email.received,form.submitted,task.completed --json
   ```
   We register from two keys: Ops receives new email at ops@ and Sam receives offer replies at sam@. To turn on the HMAC check, put the returned secrets in `.env` as `WEBHOOK_SECRET_OPS` and `WEBHOOK_SECRET_SAM`, then restart `npm run dev`. A new tunnel URL needs new registrations. Without webhooks, `POLL=1 npm run dev` checks the four inboxes every 15 seconds (email only). `GET /health` lists the last 20 routed events.
5. Run one coworker from a fixture, with no server. This uses the live workspace and sends real email to the demo addresses:
   ```bash
   npm run co -- sam fixtures/sam/callout-text.json     # Maria can't make Tuesday
   npm run co -- cara fixtures/cara/request-care.json   # Request care form
   npm run co -- ravi fixtures/ravi/apply.json          # also apply-hold.json and apply-owner-review.json
   npm run brief                                        # Ops morning brief
   npm run certs                                        # Ravi certificate sweep
   ```
   `fixtures/sam/reply-yes.json` and `fixtures/sam/task-done.json` need a real email id and task id pasted in first.
6. Reset the demo:
   ```bash
   npm run reset
   ```
   This deletes tasks in the Office project, deals in both pipelines, Assessment and Interview events, and the form-intake contacts, and puts Mr. Patel's next Tuesday visit back to Maria. Seeded contacts and visit series stay.

## Team

- **Aryan Tomar** (lead): plan, Ambiguous workspace and coworker provisioning, Sam
- **Adamay Mann**: Ambiguous CLI wrapper and shared helpers, webhook server, seed and reset scripts, Ops, Cara
- **Akshat Manral**: Ravi

All code in src/ was written during the hackathon on Sep 12, 2026.
````

## 6. Social posts

### LinkedIn (589 characters, limit 600)

On LinkedIn, type @ and pick each company page from the list; the names below mark where each tag goes.

```text
At the AI Tinkerers Agents, Everywhere hackathon in San Francisco we built Bayside Home Care: a home care agency run by one owner and four AI coworkers inside Ambiguous AI, each with its own account and inbox. When a caregiver emails in sick, Sam finds the visit, ranks replacements, emails three offers, and asks the owner to approve with one task. Cara takes new client requests and Ravi screens job applications.

Code: github.com/aryntmr/agents-everywhere

@AI Tinkerers @OpenAI @CopilotKit @OpenRouter @Exa @Auth0 @Ambiguous AI @Trigger.dev @Mozilla.ai @Google Cloud #AgentsEverywhere
```

### X (274 characters, limit 280)

`resources.md` lists no X handle for Trigger.dev, so it is tagged on LinkedIn only.

```text
Bayside Home Care: one owner, four AI coworkers in Ambiguous. A caregiver emails in sick; Sam offers the visit to three others; the owner approves one task. #AgentsEverywhere
@AITinkerers @OpenAI @CopilotKit @openrouter @exaailabs @auth0 @ambiguousio @mozillaAI @googlecloud
```
