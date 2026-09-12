# Bayside Home Care

A home care agency run inside [Ambiguous AI](https://www.ambiguous.ai) by one owner and four AI coworkers. Built at AI Tinkerers "Agents, Everywhere", San Francisco, Sep 12, 2026.

A small home care agency spends its office hours on the same jobs: finding cover when a caregiver calls out, taking new client requests, screening job applicants, and keeping the calendar, the CRM and families up to date. In Bayside Home Care, four AI coworkers do that work inside an Ambiguous workspace. Each has its own Ambiguous account and inbox, gets work from email, public forms and webhooks, works in the same Mail, Calendar, CRM, Tasks, Docs and Chat the owner uses, and posts each step in #office. The owner approves a caregiver placement by marking one task Done, and the audit log shows every action under the coworker's name.

## The four coworkers

| Coworker | What it does |
| --- | --- |
| **Ops** (front desk) | Reads email sent to ops@ and classifies it with an LLM, falling back to keyword rules if the model call fails. Hands call-outs to Sam, care requests to Cara and job emails to Ravi. Answers "when is the next visit" from the calendar, updates caregiver availability, and posts a morning brief in #office. Anything else becomes a "Needs a human" task for the owner. |
| **Sam** (scheduling) | Handles call-outs. Marks the visit NEEDS COVER, filters caregivers by skills, client preferences, pets, smoking, availability and that day's visits, ranks the rest using their CRM notes, and emails the top three. Reads the replies, asks the owner to approve, then updates the calendar, the caregivers, the family and the CRM. |
| **Cara** (care coordination) | Turns the "Request care" form, or a care request email from Ops, into family and client contacts, a Client Onboarding deal, a draft care plan doc, an assessment in the owner's first free 45-minute slot in the next two business days, and an email to the family. |
| **Ravi** (people) | Turns the "Apply to work with us" form into an applicant contact and a Hiring deal. Checks certificate, experience, zip and availability in code, then screens with an LLM against the Agency Rulebook doc. Books an interview, sends a hold email, or creates an owner review task; it never rejects anyone. Job emails from Ops get a reply with the form link and a task for the owner. A daily sweep emails caregivers whose certificates expire within 30 days. |

## How a call-out flows

1. Maria, a caregiver, emails ops@ that she can't make Mr. Patel's Tuesday visit.
2. Ambiguous sends an `email.received` webhook through the cloudflared tunnel to `src/server.ts`, which routes it to Ops by recipient address.
3. Ops classifies the email as a call-out, posts a line in #office, and hands it to Sam.
4. Sam finds Maria's Tuesday visit on the Visits calendar and marks that one day red: NEEDS COVER.
5. Sam filters and ranks caregivers, creates a Cover task with its reasons, and emails the top three from sam@.
6. A caregiver replies YES. Sam creates an APPROVE task for the owner and waits.
7. The owner marks the task Done. Sam hears it from the `task.completed` webhook, or from a 10-second poll.
8. Sam turns the visit green with the new caregiver, confirms with her, emails the family, thanks the others, writes CRM notes on the client and both caregivers, and closes its Cover task.

The same server sends `form.submitted` events from the Request care form to Cara and from the Apply form to Ravi. It also runs the Ops morning brief at 07:00 and the Ravi certificate sweep at 07:05, Pacific time.

## Architecture

```text
Ambiguous --webhooks--> cloudflared --> src/server.ts
src/server.ts      POST /events: HMAC check when WEBHOOK_SECRET or WEBHOOK_SECRET_* is set, dedupe, route; daily timers
src/coworkers/     ops.ts, sam.ts, cara.ts, ravi.ts: one handle(event) each; Ops hands work over through src/registry.ts
src/ambi.ts        runs the ambiguous CLI with the acting coworker's own API key; emails only allowlisted addresses
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
   - `AMBI_KEY_OPS`, `AMBI_KEY_SAM`, `AMBI_KEY_CARA`, `AMBI_KEY_RAVI`: one Ambiguous API key per coworker. Add your own owner key to `.env` as `AMBI_OWNER_KEY`, then run `node scripts/provision-coworkers.mjs` (add `--dry-run` to preview). It creates the four coworker accounts, saves their keys to `.env`, and writes their ids to `config/ids.json`. For a new workspace, set that file to `{}` first.
   - `DEMO_GMAIL`: an email address you control that accepts plus-addresses. Demo people get `+maria`, `+priya`, `+dev`, `+rosa` and `+neha` on it; use `+lena` and `+jordan` on the forms. Coworkers only send email to these addresses and the workspace's own domain; other sends become CRM notes.

3. Seed the workspace (safe to re-run):

   ```bash
   npm run seed
   ```

   This creates the Visits calendar, #office, the Office project, the Client Onboarding and Hiring pipelines, the two public forms, the Agency Rulebook doc, 150 contacts (50 caregivers, 50 clients, 50 family contacts) with notes, and 72 weekly visit series starting Monday, Sep 14, 2026.

4. Start the server and a tunnel (each in its own terminal), then register webhooks:

   ```bash
   npm run dev                                      # src/server.ts on port 3000
   cloudflared tunnel --url http://localhost:3000   # prints https://<random>.trycloudflare.com
   set -a; source .env; set +a
   AMBI_API_TOKEN=$AMBI_KEY_OPS npx ambiguous webhooks create --url https://<random>.trycloudflare.com/events \
     --name bayside-ops --events email.received,form.submitted,task.completed --json
   AMBI_API_TOKEN=$AMBI_KEY_SAM npx ambiguous webhooks create --url https://<random>.trycloudflare.com/events \
     --name bayside-sam --events email.received,form.submitted,task.completed --json
   ```

   Ops receives new email at ops@ and Sam receives offer replies at sam@, so register from both keys. To turn on the HMAC check, put the returned secrets in `.env` as `WEBHOOK_SECRET_OPS` and `WEBHOOK_SECRET_SAM` and restart `npm run dev`. A new tunnel URL needs new registrations. Without webhooks, `POLL=1 npm run dev` checks the four inboxes every 15 seconds (email only). `GET /health` shows the last 20 routed events.

5. Run one coworker from a fixture, without the server. This uses the live workspace and sends real email to the demo addresses:

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
