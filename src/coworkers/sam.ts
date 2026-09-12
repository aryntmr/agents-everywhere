// Sam, the scheduler. A caregiver can't make a visit: Sam finds cover, gets one owner click, and fixes everything.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Coworker, Event } from "../types.ts";
import {
  atLocal,
  cal,
  chat,
  COLORS,
  formatVisit,
  ids,
  localDate,
  localISO,
  localWeekday,
  mail,
  parseVisit,
  tasks,
  TZ,
  type Occurrence,
} from "../ambi.ts";
import * as people from "../people.ts";
import type { Person } from "../people.ts";
import * as llm from "../llm.ts";
import * as approvals from "../approvals.ts";

const STATE_PATH = fileURLToPath(
  new URL("../../state/sam.json", import.meta.url),
);
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Answer = "yes" | "no" | "unclear";
type Candidate = {
  id: string;
  name: string;
  email: string;
  reason: string;
  threadId?: string;
  answer?: "yes" | "no";
};
export type Offer = {
  code: string;
  masterId: string;
  date: string; // local date of the visit, used to address that one day of the series
  start: string;
  end: string;
  clientId: string;
  clientName: string;
  clientLast: string;
  familyId?: string;
  outId: string;
  outName: string;
  why: string;
  candidates: Candidate[];
  coverTaskId?: string;
  status: "offered" | "accepted" | "covered" | "no_takers";
  acceptedBy?: string;
  createdAt: string;
};

// ---------- state that survives a restart ----------
const loadOffers = (): Record<string, Offer> =>
  existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : {};
function saveOffer(o: Offer): void {
  const all = loadOffers();
  all[o.code] = o;
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(all, null, 2)}\n`);
}

// ---------- pure helpers (exported for quick offline checks) ----------
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const lastName = (p: Person) =>
  p.lastName || p.name.trim().split(/\s+/).slice(-1)[0] || p.name;
const csv = (s?: string) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
const hhmm = (iso: string) => localISO(new Date(iso)).slice(11, 16);
const emailText = (m: any) =>
  String(
    m?.body_markdown ?? m?.body_text ?? m?.text ?? m?.body ?? m?.preview ?? "",
  );
// `tasks create` answers { task: {...} }; other endpoints answer the object itself or { data }.
const idOf = (r: any): string =>
  String(r?.task?.id ?? r?.data?.task?.id ?? r?.data?.id ?? r?.id ?? "");

/** "Tue Sep 15, 2–6pm" in agency time. */
export function when(startISO: string, endISO: string): string {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  })
    .format(s)
    .replace(",", "");
  const t = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      minute: "2-digit",
    })
      .format(d)
      .replace(":00", "")
      .replace(/\s/g, "")
      .toLowerCase();
  const a = t(s);
  const b = t(e);
  return `${day}, ${a.slice(-2) === b.slice(-2) ? a.slice(0, -2) : a}–${b}`;
}

/** The local date a message refers to: today, tomorrow, a weekday name, or m/d. Null when it names none. */
export function mentionedDate(text: string, now = new Date()): string | null {
  const t = text.toLowerCase();
  const today = localDate(now);
  const plus = (n: number) =>
    localDate(new Date(atLocal(today, "12:00").getTime() + n * 86_400_000));
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t))
    return today;
  if (/\btomorrow\b/.test(t)) return plus(1);
  const day = t.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\b/,
  );
  if (day) {
    const target = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(
      day[1].slice(0, 3),
    );
    return plus((target - WEEK.indexOf(localWeekday(now)) + 7) % 7);
  }
  const md = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  return md
    ? `${today.slice(0, 4)}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`
    : null;
}

/** true/false when "Mon-Fri 08:00-18:00; Sat 08:00-14:00" says so, null when the text can't be read. */
export function availableAt(
  text: string,
  weekday: string,
  from: string,
  to: string,
): boolean | null {
  let understood = false;
  for (const seg of (text ?? "").split(";")) {
    const m = seg
      .trim()
      .match(/^([A-Za-z ,-]+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) continue;
    understood = true;
    const days = new Set<string>();
    for (const part of m[1].split(",")) {
      const [a, b] = part
        .split("-")
        .map((x) => x.trim().slice(0, 3).toLowerCase());
      const ia = WEEK.findIndex((w) => w.toLowerCase() === a);
      const ib = b ? WEEK.findIndex((w) => w.toLowerCase() === b) : ia;
      if (ia < 0 || ib < 0) continue;
      for (let i = ia; ; i = (i + 1) % 7) {
        days.add(WEEK[i]);
        if (i === ib) break;
      }
    }
    if (
      days.has(weekday) &&
      m[2].padStart(5, "0") <= from &&
      to <= m[3].padStart(5, "0")
    )
      return true;
  }
  return understood ? false : null;
}

/** YES / NO from the part of a reply above the quoted text. */
export function readAnswer(text: string): Answer {
  const top = text.split(/\n\s*(?:>|On .+wrote:)/)[0].toLowerCase();
  const yes =
    /\b(yes|yep|yeah|yup|sure|ok|okay|count me in|i'?ll take it)\b|\bi can\b(?!['’]t)/.test(
      top,
    );
  const no = /\b(no|nope|can't|can’t|cannot|sorry|unable|not available)\b/.test(
    top,
  );
  return yes && !no ? "yes" : no && !yes ? "no" : "unclear";
}

export type Fit = {
  person: Person;
  score: number;
  why: string[];
  blocked?: string;
};

/** Rulebook filters first (skills, preferences, pets, smoking, availability, clashes), then a score with checkable reasons. */
export function fit(
  cg: Person,
  client: Person,
  visit: Occurrence,
  sameDay: Occurrence[],
  notes: string[] = [],
): Fit {
  const blocked = (why: string): Fit => ({
    person: cg,
    score: -1,
    why: [],
    blocked: why,
  });
  const skills = cg.skills.map((s) => s.toLowerCase());
  const missing = csv(client.custom.needs).filter((n) => !skills.includes(n));
  if (missing.length) return blocked(`missing ${missing.join(", ")}`);
  const prefs = (client.custom.preferences ?? "").toLowerCase();
  const gender = (cg.custom.gender ?? "").toLowerCase();
  if (/\bfemale caregiver\b/.test(prefs) && gender !== "female")
    return blocked("client prefers a female caregiver");
  if (/\bmale caregiver\b/.test(prefs) && gender !== "male")
    return blocked("client prefers a male caregiver");
  if (client.custom.has_pets === "yes" && cg.custom.ok_with_pets !== "yes")
    return blocked("not ok with pets");
  if (client.custom.smoker === "yes" && cg.custom.ok_with_smokers !== "yes")
    return blocked("not ok with smokers");
  const wd = localWeekday(new Date(visit.start));
  const from = hhmm(visit.start);
  const to = hhmm(visit.end);
  const free = availableAt(cg.custom.availability ?? "", wd, from, to);
  if (free === false) return blocked(`not available ${wd} ${from}–${to}`);
  const clash = sameDay.some(
    (o) =>
      parseVisit(o.description).caregiver_id === cg.id &&
      Date.parse(o.start) < Date.parse(visit.end) &&
      Date.parse(o.end) > Date.parse(visit.start),
  );
  if (clash) return blocked("already has a visit then");

  let score = 0;
  const why: string[] = [];
  const last = lastName(client);
  // "Ops: called out sick ..." or "Sam: Maria called out ..." is this person's call-out; "covered X after Maria called out" is not.
  const ownCallout = new RegExp(
    `^\\w+:\\s*(${firstName(cg.name).replace(/[^A-Za-z]/g, "")}\\s+)?called out`,
    "i",
  );
  const callouts = notes.filter((n) => ownCallout.test(n)).length;
  const history = notes.filter(
    (n) =>
      n.toLowerCase().includes(last.toLowerCase()) &&
      /\b(covered|visited)\b/i.test(n) &&
      !ownCallout.test(n),
  ).length;
  if (history) {
    score += 3 + Math.min(history, 3);
    why.push(
      history > 1
        ? `covered ${last} ${history} times`
        : `has covered ${last} before`,
    );
  }
  const wanted = [
    client.custom.language ?? "",
    ...[...prefs.matchAll(/([a-z]+) speaker/g)].map((m) => m[1]),
  ]
    .map((l) => l.toLowerCase())
    .filter((l) => l && l !== "english");
  const shared = cg.languages.find((l) => wanted.includes(l.toLowerCase()));
  if (shared) {
    score += 3;
    why.push(`speaks ${shared}`);
  }
  if (free) {
    score += 1;
    why.push(`free ${wd} ${from}–${to}`);
  }
  score -= callouts;
  if (!callouts) why.push("no call-outs on record");
  if (cg.custom.zip && cg.custom.zip === client.custom.zip) {
    score += 1;
    why.push("same zip");
  }
  return { person: cg, score, why };
}

/** Best first: score, then closest zip (rulebook), then name, so the order never depends on how the CRM lists people. */
const zipGap = (a?: string, b?: string) => (a && b && /^\d{5}$/.test(a) && /^\d{5}$/.test(b) ? Math.abs(Number(a) - Number(b)) : 99_999);
export const byFit = (client: Person) => (a: Fit, b: Fit) =>
  b.score - a.score || zipGap(a.person.custom.zip, client.custom.zip) - zipGap(b.person.custom.zip, client.custom.zip) || a.person.name.localeCompare(b.person.name);

// ---------- workspace actions ----------
async function tryLLM<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.log(`[sam] llm skipped: ${(e as Error).message}`);
    return fallback;
  }
}

async function needsHuman(summary: string, details = ""): Promise<void> {
  await tasks.create("sam", {
    title: `Needs a human: ${summary}`,
    description: details.slice(0, 2000),
    assigneeId: ids.owner_user_id,
    priority: "medium",
  });
  await chat.office("sam", `❓ Sam: ${summary} → task for the owner`);
}

async function callout(payload: Record<string, unknown>): Promise<void> {
  // Ops passes the email inline: Sam cannot read messages in Ops's mailbox.
  let from = String(payload.from ?? "");
  let subject = String(payload.subject ?? "");
  let body = String(payload.body ?? "");
  if (!body && payload.emailId) {
    const m = await mail.get("sam", String(payload.emailId));
    from = m.from?.email ?? from;
    subject = m.subject ?? subject;
    body = emailText(m);
  }
  const text = `${subject}\n${body}`;

  // 1. Who is out: by sender address, else the one caregiver named in the message (Gmail replies drop +tags).
  const caregivers = await people.byRole("sam", "caregiver");
  const named = caregivers.filter((p) =>
    new RegExp(
      `\\b${firstName(p.name).replace(/[^A-Za-z]/g, "")}\\b`,
      "i",
    ).test(text),
  );
  const out =
    caregivers.find(
      (p) => p.email && p.email.toLowerCase() === from.toLowerCase(),
    ) ?? (named.length === 1 ? named[0] : undefined);
  if (!out)
    return needsHuman(
      `call-out from ${from || "an unknown sender"}, couldn't tell which caregiver`,
      text,
    );

  // 2. Which visit: the day they named, else the coming week; prefer the client they named.
  const named_day = mentionedDate(text);
  const days = named_day
    ? [named_day]
    : Array.from({ length: 7 }, (_, i) =>
        localDate(new Date(Date.now() + i * 86_400_000)),
      );
  let found: Occurrence | undefined;
  let sameDay: Occurrence[] = [];
  for (const d of days) {
    const all = await cal.onDay("sam", d);
    const mine = all
      .filter(
        (o) =>
          parseVisit(o.description).caregiver_id === out.id &&
          Date.parse(o.end) > Date.now(),
      )
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    found =
      mine.find((o) =>
        text
          .toLowerCase()
          .includes((o.title.split("—")[1] ?? "").trim().toLowerCase() || " "),
      ) ?? mine[0];
    if (found) {
      sameDay = all;
      break;
    }
  }
  if (!found)
    return needsHuman(
      `couldn't find ${firstName(out.name)}'s visit${named_day ? ` on ${named_day}` : " this week"}`,
      text,
    );
  const visit = found;
  const v = parseVisit(visit.description);
  if (v.status && v.status !== "scheduled")
    return void (await chat.office(
      "sam",
      `ℹ️ Sam: already working on ${visit.title}`,
    ));
  if (!v.client_id)
    return needsHuman(
      `visit "${visit.title}" has no client_id line`,
      visit.description,
    );
  const client = await people.get("sam", v.client_id);
  const whenTxt = when(visit.start, visit.end);
  const date = localDate(new Date(visit.start));
  const code = `V-${lastName(client)
    .toUpperCase()
    .replace(/[^A-Z]/g, "")}-${date.slice(5).replace("-", "")}`;
  const existing = loadOffers()[code];
  if (existing && existing.status !== "covered")
    return void (await chat.office(
      "sam",
      `ℹ️ Sam: already working on ${lastName(client)} ${whenTxt}`,
    ));
  const why =
    text
      .match(
        /\b(sick|ill|flu|fever|covid|emergency|car trouble|hospital)\b/i,
      )?.[1]
      ?.toLowerCase() ?? "can't make it";

  // 3. Flip that one day red and tell the office.
  await people.note(
    "sam",
    out.id,
    `Sam: ${firstName(out.name)} called out for ${lastName(client)} ${whenTxt} (${why}).`,
  );
  await cal.editOccurrence("sam", visit.masterId, date, {
    title: `NEEDS COVER — Visit — ${lastName(client)} — (was ${firstName(out.name)})`,
    description: formatVisit({
      client_id: client.id,
      caregiver_id: out.id,
      status: "needs_cover",
    }),
    color: COLORS.red,
  });
  await chat.office(
    "sam",
    `🔴 Sam: ${lastName(client)} ${whenTxt} needs cover (${firstName(out.name)}, ${why}). Finding replacements…`,
  );

  // 4. Reassure the caregiver who is out.
  if (out.email || from) {
    await mail.send("sam", {
      to: out.email || from,
      subject: /^re:/i.test(subject)
        ? subject
        : `Re: ${subject || "your visit"}`,
      contactId: out.id,
      markdown: `Hi ${firstName(out.name)},\n\nGot it, feel better. I'm finding cover for ${client.name} now. You don't need to do anything.\n\nSam`,
    });
  }

  // 5–6. Filter by the rulebook, then rank the survivors with their history notes.
  const checked = caregivers
    .filter(
      (p) => p.id !== out.id && (p.custom.status ?? "active") === "active",
    )
    .map((p) => fit(p, client, visit, sameDay));
  const survivors = checked.filter((f) => !f.blocked).slice(0, 12);
  const ranked = (
    await Promise.all(
      survivors.map(async (f) =>
        fit(
          f.person,
          client,
          visit,
          sameDay,
          await people.timeline("sam", f.person.id),
        ),
      ),
    )
  )
    .sort(byFit(client))
    .slice(0, 3);
  const filteredOut = checked
    .filter((f) => f.blocked)
    .slice(0, 6)
    .map((f) => `- ${f.person.name}: ${f.blocked}`);

  const offer: Offer = {
    code,
    masterId: visit.masterId,
    date,
    start: visit.start,
    end: visit.end,
    clientId: client.id,
    clientName: client.name,
    clientLast: lastName(client),
    familyId: client.custom.family_contact_id,
    outId: out.id,
    outName: out.name,
    why,
    candidates: [],
    status: "offered",
    createdAt: new Date().toISOString(),
  };
  if (!ranked.length) {
    offer.status = "no_takers";
    saveOffer(offer);
    return needsHuman(
      `nobody can cover ${lastName(client)} ${whenTxt}`,
      filteredOut.join("\n"),
    );
  }

  // 7. The working task, with reasons the owner can check in five seconds.
  offer.coverTaskId = idOf(
    await tasks.create("sam", {
      title: `Cover: ${lastName(client)} — ${whenTxt}`,
      assigneeId: ids.agents?.sam?.user_id,
      priority: "high",
      contactId: client.id,
      description: [
        `${out.name} is out (${why}).`,
        "",
        "Offered to:",
        ...ranked.map(
          (f, i) =>
            `${i + 1}. ${f.person.name}: ${f.why.slice(0, 3).join(" · ")}`,
        ),
        "",
        "Filtered out:",
        ...(filteredOut.length ? filteredOut : ["- nobody"]),
      ].join("\n"),
    }),
  );

  // 8. Three offers, each its own email thread, so a reply tells Sam who answered.
  const prefs = client.custom.preferences
    ? ` Note: ${client.custom.preferences}.`
    : "";
  for (const f of ranked) {
    const c: Candidate = {
      id: f.person.id,
      name: f.person.name,
      email: f.person.email,
      reason: f.why.slice(0, 3).join(" · "),
    };
    const sent = await mail.send("sam", {
      to: c.email,
      contactId: c.id,
      subject: `Can you cover ${client.name} — ${whenTxt}? [${code}]`,
      markdown: `Hi ${firstName(c.name)},\n\n${firstName(out.name)} is out. Could you take ${client.name} on ${whenTxt}? The visit covers ${csv(client.custom.needs).join(", ") || "the usual care"}.${prefs}\n\nReply YES or NO to this email. First YES gets it, and I'll confirm right away.\n\nThanks,\nSam, Bayside Home Care`,
    });
    c.threadId = sent?.thread_id ?? sent?.message_id;
    offer.candidates.push(c);
    saveOffer(offer);
  }
  await chat.office(
    "sam",
    `📋 Sam: offered ${lastName(client)} ${whenTxt} to ${offer.candidates.map((c) => firstName(c.name)).join(", ")}. Waiting for a YES.`,
  );
}

async function reply(ev: Extract<Event, { type: "email" }>): Promise<void> {
  const m = await mail.get("sam", ev.emailId);
  const from = String(m.from?.email ?? ev.from ?? "").toLowerCase();
  if (from === String(ids.agents?.sam?.email ?? "").toLowerCase()) return;
  const offers = loadOffers();
  const code = String(m.subject ?? ev.subject ?? "").match(
    /\[(V-[A-Z]+-\d{4})\]/,
  )?.[1];
  // The received reply carries the thread id of Sam's sent offer; the subject code and sender are fallbacks.
  const offer =
    Object.values(offers).find((o) =>
      o.candidates.some((c) => c.threadId && c.threadId === m.thread_id),
    ) ?? (code ? offers[code] : undefined);
  const cand =
    offer?.candidates.find((c) => c.threadId === m.thread_id) ??
    offer?.candidates.find((c) => c.email.toLowerCase() === from);
  if (!offer || !cand)
    return needsHuman(
      `email to Sam that isn't an offer reply: ${m.subject ?? ev.subject}`,
      emailText(m),
    );
  await mail.mark("sam", ev.emailId, true).catch(() => undefined);

  const whenTxt = when(offer.start, offer.end);
  const first = firstName(cand.name);
  let answer: Answer = readAnswer(emailText(m));
  if (answer === "unclear") {
    answer = await tryLLM<Answer>(
      async () =>
        (
          await llm.askJSON<{ answer: Answer }>("sam", {
            label: "reply",
            system:
              "A caregiver replied to a shift offer. Decide whether they accepted the shift. Answer unclear if they did not clearly say yes or no.",
            user: emailText(m).slice(0, 2000),
            schema: {
              type: "object",
              properties: {
                answer: { type: "string", enum: ["yes", "no", "unclear"] },
              },
            },
          })
        ).answer,
      "unclear",
    );
  }
  const respond = (subject: string, markdown: string) =>
    mail.send("sam", {
      to: cand.email,
      contactId: cand.id,
      inReplyTo: m.message_id,
      subject,
      markdown,
    });

  if (offer.status !== "offered") {
    if (answer === "yes")
      await respond(
        `Already covered: ${offer.clientName} — ${whenTxt} [${offer.code}]`,
        `Thanks ${first}, it's already covered. I appreciate the quick answer.\n\nSam`,
      );
    return people.note(
      "sam",
      cand.id,
      `Sam: said ${answer} for ${offer.clientLast} ${whenTxt} after it was filled.`,
    );
  }
  if (answer === "unclear")
    return needsHuman(
      `unclear reply from ${cand.name} about ${offer.clientLast} ${whenTxt}`,
      emailText(m),
    );
  cand.answer = answer;
  saveOffer(offer);
  if (answer === "no") {
    await respond(
      `Re: Can you cover ${offer.clientName} — ${whenTxt}? [${offer.code}]`,
      `No problem, thanks for letting me know.\n\nSam`,
    );
    await people.note(
      "sam",
      cand.id,
      `Sam: declined ${offer.clientLast} ${whenTxt}.`,
    );
    if (offer.candidates.every((c) => c.answer === "no")) {
      offer.status = "no_takers";
      saveOffer(offer);
      await needsHuman(`all three said no for ${offer.clientLast} ${whenTxt}`);
    }
    return;
  }

  offer.status = "accepted";
  offer.acceptedBy = cand.id;
  saveOffer(offer);
  await respond(
    `Re: Can you cover ${offer.clientName} — ${whenTxt}? [${offer.code}]`,
    `Great, thank you! Checking with the office now. You'll get a confirmation in a few minutes.\n\nSam`,
  );
  await chat.office(
    "sam",
    `🙋 Sam: ${first} said YES for ${offer.clientLast} ${whenTxt} → asking the owner`,
  );
  await approveAndFinish(offer, cand);
}

async function approveAndFinish(offer: Offer, cand: Candidate): Promise<void> {
  const whenTxt = when(offer.start, offer.end);
  const first = firstName(cand.name);
  const ok = await approvals.request("sam", {
    title: `APPROVE: ${first} for ${offer.clientLast} — ${whenTxt}`,
    contactId: offer.clientId,
    description: `${offer.outName} is out (${offer.why}). ${cand.name} said YES.\n\nWhy ${first}: ${cand.reason}\n\nMark this task Done to approve. Sam will update the calendar, email the family, and thank the others.`,
  });
  if (!ok) {
    offer.status = "offered";
    offer.acceptedBy = undefined;
    saveOffer(offer);
    return void (await chat.office(
      "sam",
      `⏸️ Sam: no approval for ${first} on ${offer.clientLast} ${whenTxt}. Back to the list.`,
    ));
  }

  // 11. Make it real: calendar, caregiver, family, runners-up, records, task.
  await cal.editOccurrence("sam", offer.masterId, offer.date, {
    title: `Visit — ${offer.clientLast} — ${first} (covering)`,
    description: formatVisit({
      client_id: offer.clientId,
      caregiver_id: cand.id,
      status: "covered",
    }),
    color: COLORS.green,
  });
  await mail.send("sam", {
    to: cand.email,
    contactId: cand.id,
    subject: `Confirmed: ${offer.clientName} — ${whenTxt} [${offer.code}]`,
    markdown: `Hi ${first},\n\nYou're confirmed for ${offer.clientName} on ${whenTxt}. It's on the calendar. Thank you for stepping in.\n\nSam`,
  });
  const family = offer.familyId
    ? await people.get("sam", offer.familyId).catch(() => null)
    : null;
  if (family?.email) {
    const facts = cand.reason.split(" · ").slice(0, 2).join(" and ");
    const fallback = `Hi ${firstName(family.name)},\n\n${firstName(offer.outName)} can't make it on ${whenTxt}, so ${cand.name} will be with ${offer.clientName} instead. ${first} ${facts}.\n\nAny questions, just reply to this email.\n\nSam, Bayside Home Care`;
    const markdown = await tryLLM(
      () =>
        llm.draft("sam", {
          label: "family",
          system:
            "You are Sam, the scheduler at a small home care agency. Write a short, warm email body to a family member. Plain words, first names, under 80 words, no subject line, sign off as Sam.",
          user: `Family member: ${family.name}. Client: ${offer.clientName}. Usual caregiver ${offer.outName} is out (${offer.why}). ${cand.name} will cover ${whenTxt}. Facts about ${first}: ${cand.reason}.`,
        }),
      fallback,
    );
    await mail.send("sam", {
      to: family.email,
      contactId: family.id,
      subject: `${first} is covering ${offer.clientName} — ${whenTxt}`,
      markdown,
    });
  }
  for (const c of offer.candidates.filter(
    (c) => c.id !== cand.id && c.answer !== "no",
  )) {
    await mail.send("sam", {
      to: c.email,
      contactId: c.id,
      subject: `Filled: ${offer.clientName} — ${whenTxt} [${offer.code}]`,
      markdown: `Thanks ${firstName(c.name)}, ${first} got there first. I'll keep you at the top of the list next time.\n\nSam`,
    });
  }
  await people.note(
    "sam",
    offer.clientId,
    `Sam: ${whenTxt} covered by ${cand.name} after ${offer.outName} called out (${offer.why}); family notified.`,
  );
  await people.note(
    "sam",
    cand.id,
    `Sam: covered ${offer.clientLast} ${whenTxt} (approved by owner).`,
  );
  await people.note(
    "sam",
    offer.outId,
    `Sam: ${offer.clientLast} ${whenTxt} covered by ${cand.name}.`,
  );
  if (offer.coverTaskId) {
    await tasks.done("sam", offer.coverTaskId);
    await tasks
      .comment(
        "sam",
        offer.coverTaskId,
        `Covered by ${cand.name}. Approved by the owner. Family notified.`,
      )
      .catch((e) => console.log(`[sam] task comment failed: ${e.message}`));
  }
  offer.status = "covered";
  saveOffer(offer);
  const others = offer.candidates
    .filter((c) => c.id !== cand.id)
    .map((c) => firstName(c.name));
  await chat.office(
    "sam",
    `✅ Sam: ${offer.clientLast} ${whenTxt} covered by ${first}. Family notified${others.length ? `, ${others.join(" and ")} thanked` : ""}, records updated.`,
  );
}

async function handle(ev: Event): Promise<void> {
  try {
    if (ev.type === "handoff" && ev.kind === "callout")
      return await callout(ev.payload);
    if (ev.type === "email") return await reply(ev);
    if (ev.type === "task_done") return; // approvals.ts resolves the waiting approval
    console.log(`[sam] ignoring ${ev.type}`);
  } catch (e) {
    await chat.office("sam", `⚠️ Sam: ${(e as Error).message.slice(0, 200)}`);
    throw e;
  }
}

const sam: Coworker = { who: "sam", handle };
export default sam;
