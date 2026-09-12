# Lane 2 — Sam, the scheduler (the spine of the demo)

**Owner: Person 2.** You build `src/coworkers/sam.ts` and `fixtures/sam/*.json`. Nothing else. Read `plan/00-README-everyone.md` first, especially sections 3 (data conventions), 4 (contract), and 9 (Ambiguous commands).

Sam's job in one paragraph: a caregiver tells the office they cannot make a visit. Sam finds that visit on the calendar, marks it as needing cover, works out which caregivers could do it, asks the best three by email, takes the first YES, gets the owner's OK with one click, then updates the calendar, tells the family and the other caregivers, and writes down what happened on everyone's record. The owner does one click. Everything else is Sam.

This is the flow the video spends 50 seconds on. It has to be flawless. Build it in the order below and test each step against the live workspace with `npm run co -- sam fixtures/sam/<file>.json` before moving on.

---

## What you can start right now (before Person 1's skeleton lands)

1. Run these and read the output; you will use every one of them:
   ```bash
   cd ~/Personal/hackathons/agents-everywhere
   npx ambiguous@latest catalog calendar
   npx ambiguous@latest catalog mail
   npx ambiguous@latest catalog crm
   npx ambiguous@latest catalog tasks
   npx ambiguous@latest catalog chat
   npx ambiguous@latest calendar events edit-single --help
   npx ambiguous@latest mail send --help
   ```
2. Write the fixtures (shapes from README section 4.1):
   - `fixtures/sam/callout-handoff.json`: `{ "type":"handoff", "who":"sam", "from":"ops", "kind":"callout", "payload": { "emailId":"<fill after Person 1 sends a real email>" } }`
   - `fixtures/sam/callout-text.json`: same but `payload: { "from":"<DEMO_GMAIL>+maria@gmail.com", "subject":"Can't make it", "body":"Hi, it's Maria. I'm sick and can't do Mr. Patel's visit Tuesday 2 to 6. Sorry!" }` so you can develop before any real email exists. Sam must accept either `emailId` or inline `from/subject/body`.
   - `fixtures/sam/reply-yes.json`: `{ "type":"email", "who":"sam", "emailId":"<fill later>", "to":"sam@...", "from":"...+priya@gmail.com", "subject":"Re: Can you cover Mr. Patel — Tue Sep 15, 2–6pm? [V-PATEL-0915]" }`
   - `fixtures/sam/task-done.json`: `{ "type":"task_done", "who":"sam", "taskId":"<fill later>" }`
3. Draft the ranking prompt (section "Step 6" below) in a `.md` scratch file; you will paste it into code.

Once Person 1 posts the keys and `config/ids.json`, `AMBI_API_TOKEN=$AMBI_KEY_SAM npx ambiguous@latest whoami` should say you are Sam.

---

## Sam's state

Sam needs to remember open offers between events. Keep it simple:

```ts
type Offer = {
  code: string;                 // "V-PATEL-0915"
  masterEventId: string;        // the repeating series (or the single event id)
  occurrenceDate: string;       // "2026-09-15"
  isRecurring: boolean;
  clientId: string; clientName: string; familyContactId?: string;
  outCaregiverId: string; outCaregiverName: string;
  start: string; end: string;   // RFC3339
  candidates: { contactId: string; name: string; email: string; reason: string; emailId?: string; threadId?: string }[];
  coverTaskId: string;
  status: 'offered' | 'accepted' | 'approved' | 'covered' | 'no_takers';
  acceptedBy?: string;          // contactId
  approvalTaskId?: string;
  createdAt: string;
};
```

Store in `state/sam.json` (a Map serialized on every change; `state/` is gitignored). Look up by `code` (parsed from the email subject `[V-...]`), and by `threadId` as a fallback. That survives a server restart, which will happen at least once today.

The visit code is `V-<CLIENT LAST NAME UPPER>-<MMDD>`.

---

## Step 1 — Read the call-out (handoff `kind: 'callout'`)

- If `payload.emailId`: `mail.get('sam', emailId)` → `from`, `subject`, `body`. (Ops received it; Sam reads it by id. If reading another inbox's email by id fails with 403, Ops will pass `from/subject/body` inline in the payload. Support both from the start.)
- `people.findByEmail('sam', from)` → the caregiver. If not found: post `❓ Sam: call-out from unknown address <from> → task for the owner`, create a `Needs a human:` task, stop.
- `llm.askJSON('sam', { rulebook: false, system: "Extract the visit the caregiver cannot do.", user: <email + today's date + the caregiver's name>, schema })`:
  ```ts
  { date: string /* YYYY-MM-DD, resolve 'today'/'tomorrow'/'Tuesday' relative to today in America/Los_Angeles */,
    client_hint: string /* e.g. "Patel" or "" */,
    time_hint: string /* e.g. "2-6" or "" */,
    reason: string /* "sick" */ }
  ```
- Note on the caregiver's timeline: `Sam: called out for <date> (<reason>).`

## Step 2 — Find the visit

- `cal.onDay('sam', date)` → occurrences that day. Filter titles containing the caregiver's first name (title format `Visit — <Client last> — <Caregiver first>`). If `client_hint` is set, prefer the one whose title contains it. If more than one remains, pick the one whose start hour matches `time_hint`. If none: post `❓ Sam: couldn't find Maria's visit on <date> → task for the owner`, create the task, reply to Maria "Got it, the office will confirm which visit", stop.
- Parse `client_id` and `caregiver_id` from the description (`parseVisit`). Load the client (`people.get`) and the family contact (`family_contact_id` custom property).
- Build the `Offer` skeleton with `code`, `masterEventId`, `occurrenceDate`, `isRecurring` (from the occurrence object Person 1's `cal.onDay` returns; check its comment for which field is the master id).

## Step 3 — Flip the visit to NEEDS COVER

- `cal.editOccurrence('sam', masterEventId, occurrenceDate, { title: "NEEDS COVER — Visit — Patel — (was Maria)", description: formatVisit({client_id, caregiver_id: outCaregiverId, status:'needs_cover'}), color: <red from calendar colors; run npx ambiguous@latest calendar colors once and hardcode the red id> })`.
  For a single (non-repeating) event this wrapper calls `calendar events update` instead; you do not care.
- Post `🔴 Sam: Patel Tue Sep 15 2–6pm needs cover (Maria out sick). Finding replacements…` in #office.

## Step 4 — Reply to the caregiver who called out

- `mail.send('sam', { to: from, subject: "Re: " + subject, inReplyTo: emailId, markdown: "Hi Maria, got it — feel better. I'm finding cover for Mr. Patel now, you don't need to do anything. — Sam" })`.
  Draft this with `llm.draft` only if you have time; a template with the first name is fine.

## Step 5 — Build the candidate list (deterministic, in code)

- `people.byRole('sam','caregiver')` minus the sick caregiver, `status === 'active'` only.
- Hard filters, each recorded as a reason so the task can show "why not":
  1. `skills ⊇ client.needs`.
  2. Gender preference: if `client.preferences` contains "female caregiver" (or "male caregiver"), require it. (Simple substring; the LLM will also see preferences in ranking.)
  3. Pets: if `client.has_pets === 'yes'`, require `ok_with_pets === 'yes'`. Smoker likewise.
  4. Availability: the visit's weekday and time must fit inside the caregiver's `availability` text. Parse the format `Mon-Fri 08:00-18:00; Sat 08:00-14:00` (seed uses exactly this shape: day ranges or single days, 24h times, `;` separated). If parsing fails, keep the caregiver and let the LLM judge.
  5. No overlapping visit: from the same `cal.onDay` result, exclude anyone whose first name appears in a title overlapping the window. (Names are unique in the seed by first name; if not, match `caregiver_id` in the descriptions, which is more exact and just as easy since `cal.onDay` returns descriptions.)
  6. Optional (cut list): weekly hours — sum occurrence lengths for that week per caregiver; skip if over `max_hours_week`.
- Keep the survivors (target 3–8). If fewer than 1 survive, drop filter 4 and try again; if still 0, create a `Needs a human:` task with the top 3 near-misses and stop.

## Step 6 — Rank with the model

- For each survivor, fetch `people.timeline` (last notes). Also the client's timeline.
- `llm.askJSON('sam', { rulebook: true, system: <below>, user: <client card + timeline, the visit, the survivor cards + timelines>, schema })`:
  ```ts
  { ranked: { contact_id: string; name: string; reason: string /* ≤ 15 words, mentions the concrete fact */ }[] /* best first, max 5 */,
    note_for_owner: string /* one line, e.g. "Priya has done 4 Patel visits; Dev is a fallback." */ }
  ```
  System prompt (draft):
  ```
  You are Sam, the scheduler at Bayside Home Care. Rank the candidate caregivers for this one visit using the Rulebook's "Covering a visit" rules, the client's preferences, and each person's history notes. Prefer: has visited this client before; language match; fewest call-outs in notes; closest zip. Output the top candidates, best first, each with one concrete reason a busy owner can verify in five seconds. Never invent facts; only use what is in the cards and notes.
  ```
- Take the top 3.

## Step 7 — Create the cover task and narrate

- `tasks.create('sam', { title: "Cover: Patel — Tue Sep 15, 2–6pm", projectId, assigneeId: <sam's own user id from config>, priority:'high', contactId: clientId, description: <markdown: the visit, who is out and why, "Offered to:" the 3 names with reasons, then "Filtered out:" a few names with one-word reasons> })` → `coverTaskId`.
- Post `📋 Sam: offered Patel Tue 2–6pm to Priya, Dev, Rosa. Waiting for a YES.` in #office.

## Step 8 — Send the three offers

For each of the top 3:
- `mail.send('sam', { to: candidate.email, contactId: candidate.contactId, subject: "Can you cover Mr. Patel — Tue Sep 15, 2–6pm? [V-PATEL-0915]", markdown })` where the body is drafted by `llm.draft` from a fixed skeleton (or a template):
  ```
  Hi Priya,

  Maria is out sick. Could you take Mr. Patel on Tuesday, September 15, 2–6pm? (1420 Judah St, SF. Transfers, meals, meds. He prefers Gujarati.)

  Reply YES or NO to this email. First YES gets it, and I'll confirm right away.

  Thanks,
  Sam — Bayside Home Care
  ```
- Save `emailId` and `threadId` from the send result onto the candidate. Save the offer. Non-allowlisted addresses are skipped by the helper (they will not be in the demo's top 3 if the seed is right; if one is, tell Person 1 to fix the seed).
- Optional (cut list item 3): schedule an `offer_timeout` timer event for 3 minutes (demo) that, if `status === 'offered'`, creates a `Needs a human:` task with the next 3 names and posts in #office.

## Step 9 — Handle replies (`email` events to sam@)

- Parse the code with `/\[(V-[A-Z]+-\d{4})\]/` from the subject. Fallback: match `threadId` against saved offers. If neither matches: this is not an offer reply; create a `Needs a human:` task and stop (do not loop on your own sent mail: ignore emails whose `from` is sam@).
- `mail.get('sam', emailId, full)`; take the text before the first quoted line (`>` or `On ... wrote:`). Decide YES/NO: `/\b(yes|yep|yeah|sure|i can|i'll take it)\b/i` → yes; `/\b(no|can't|cannot|sorry)\b/i` → no; ambiguous → `llm.askJSON` `{answer:'yes'|'no'|'unclear'}`.
- If the offer's `status !== 'offered'` (someone already accepted): reply "Thanks Dev — it's already covered, I appreciate the quick answer." Note on their timeline `Sam: said yes to Patel Tue but visit already filled.` Stop.
- NO: reply "No problem, thanks for letting me know." Note on timeline. If all 3 said no → `Needs a human:` task with next candidates. Stop.
- YES: `offer.status = 'accepted'; offer.acceptedBy = contactId`. Reply "Great, thank you! Checking with the owner now — you'll have a confirmation in a few minutes." Post `🙋 Sam: Priya said YES for Patel Tue 2–6pm → asking the owner` in #office. Go to step 10.

## Step 10 — Ask the owner (one click)

- `const ok = await approvals.request('sam', { title: "APPROVE: Priya for Patel — Tue Sep 15, 2–6pm", contactId: clientId, description: <why Priya (the reason from ranking), what happens on Done: calendar updated, family emailed, the other two thanked> })`. This blocks until the owner marks the task Done (Person 1's helper handles the event or polls).
- `offer.approvalTaskId` saved before awaiting, so a restart can recover (on startup, for offers in `accepted` with an `approvalTaskId`, re-enter step 10 by polling that task).
- If `ok === false` (cancelled/timeout): post `⏸️ Sam: owner didn't approve Priya for Patel → back to the list`, mark `status = 'offered'`, and offer to the next candidate not yet asked (or create a `Needs a human:` task). This branch is not in the video; keep it minimal.

## Step 11 — Make it real (the payoff shot)

In this order, and post to #office only at the end:
1. `cal.editOccurrence('sam', masterEventId, occurrenceDate, { title: "Visit — Patel — Priya (covering)", description: formatVisit({client_id, caregiver_id: priyaId, status:'covered'}), color: <green> })`.
2. Family email (`familyContactId` → email): "Hi Neha, Maria is out sick today, so Priya Shah will be with your father on Tuesday from 2 to 6. Priya has visited him before and speaks Gujarati. Any questions, just reply. — Sam". Draft with `llm.draft` from the facts; keep under 80 words.
3. Runner-up emails (the other two, in their threads with `--in-reply-to`): "Thanks Dev — Priya got there first. I'll keep you at the top of the list next time."
4. Notes: client `Sam: Tue Sep 15 2–6pm covered by Priya after Maria called out sick; family (Neha) notified.`; Priya `Sam: covered Patel Tue Sep 15 2–6pm (approved by owner).`; Maria `Sam: visit Tue Sep 15 covered by Priya.`
5. `tasks.done('sam', coverTaskId)` with a comment (`api POST /api/tasks/<id>/comments`) "Covered by Priya. Approved by owner. Family notified."
6. `offer.status = 'covered'`.
7. Post `✅ Sam: Patel Tue 2–6pm covered by Priya. Family notified, Dev and Rosa thanked, records updated.` in #office.

## Step 12 — Make it safe to re-run

- Running `callout-text.json` twice must not create two cover tasks or four sets of offers: before step 3, if an offer with the same `code` exists and is not `covered`, post `ℹ️ Sam: already working on Patel Tue 2–6pm` and stop.
- Idempotent sends: `mail.send` uses an idempotency key from `to + subject`; a second run of the same fixture re-uses it.
- Wrap every step in try/catch that posts `⚠️ Sam: <step> failed: <error message>` to #office and rethrows. A visible failure beats a silent one in the demo.

---

## Acceptance test (run this against the live workspace before you say you are done)

1. `npm run reset` (Person 1's script).
2. `npm run co -- sam fixtures/sam/callout-text.json` → Patel's occurrence is red NEEDS COVER; a `Cover:` task exists with three names and reasons; three emails were sent (`AMBI_API_TOKEN=$AMBI_KEY_SAM npx ambiguous@latest mail sent --json`), only to plus-addresses; one #office line.
3. Reply YES from the `+priya` inbox. `npm run co -- sam fixtures/sam/reply-yes.json` (with the real `emailId` from `mail inbox --unread true --json`) → `APPROVE:` task assigned to the owner appears.
4. Owner marks Done → within 15 seconds the occurrence is green with Priya, the family and the two others received email, three CRM notes exist, the cover task is done, the ✅ line is in #office.
5. Run step 2 again → Sam says "already working on" and changes nothing.

Send Person 1 three lines about what you built for the README, plus the timing of steps 2–4 (they need it for the video cuts).

---

## Prompts and text: the bar

Every email Sam sends should pass this test: a caregiver reading it on her phone between visits understands it in five seconds and knows exactly what to do. First name, the visit in one line, the ask in one line, sign-off. No "per our records", no "please be advised". The reasons in the task should be facts the owner can check by clicking the contact: "did 4 visits with Patel", "speaks Gujarati", "free Tue afternoons". Not "great fit".
