# Dependency map — what runs in parallel, what waits on what

A GATE is something one person must finish before the others can move past it. Between gates, the three lanes run side by side with no dependency on each other.

Rule for every gate: if the thing you are waiting on is late, write a ten-line stand-in in your own file and keep moving. Swap it out when the real one lands. Never sit idle.

Lanes: Adamay = foundation + Ops + Cara · Aryan = Sam · Akshat = Ravi.

```
GATE 0  ✅ DONE: 4 coworkers created, ids in config/ids.json, keys sent privately by Aryan
   │
   ├── Adamay ── ask organizers for model key ─────────────────────────────── (background, whole afternoon)
   │
   ├── Adamay ── skeleton: package.json, types.ts, ambi.ts, run.ts ──┐
   ├── Aryan  ── catalog reading, Sam fixtures, ranking prompt ───────┤  PARALLEL (no dependency)
   └── Akshat ── catalog reading, Ravi fixtures, screening prompt ────┤
                                                                       ▼
GATE 1  Adamay pushes skeleton + "types.ts frozen"                   (~2:40, blocks handler code)
   │
   ├── Adamay ── 6 verification checks → post ✅/❌ ──┐
   ├── Adamay ── seed containers: calendar, channel,  │
   │             project, pipelines, forms, rulebook ─┤  PARALLEL
   ├── Aryan  ── Sam steps 1–4 (read call-out, find visit, flip) ─┤   needs only calendar id + one caregiver
   └── Akshat ── Ravi steps 1–2 (applicant, deal, screening) ─────┤   needs pipeline ids + rulebook id
                                                                   ▼
GATE 2  Adamay pushes config/ids.json with container ids            (~2:55)
   │
   ├── Adamay ── seed 150 contacts + ~70 visit series (runs ~6 min) ────────────┐
   ├── Adamay ── people.ts, rulebook.ts, llm.ts, approvals.ts, cal.firstGap ────┤  PARALLEL
   ├── Aryan  ── Sam steps 5–6 code (filters, ranking) against fixtures ─────────┤
   └── Akshat ── Ravi steps 3–5 (interview, hold, owner review) ─────────────────┤
                                                                                  ▼
GATE 3  Adamay: "contacts + visits seeded"                           (~3:05, blocks anything that reads the roster)
   │
   ├── Adamay ── server.ts routing + Ops coworker ──────────────┐
   ├── Aryan  ── Sam steps 7–8 live (task + 3 offer emails) ────┤  PARALLEL
   └── Akshat ── Ravi step 6 (cert sweep) + email polish ───────┤
                                                                 ▼
GATE 4  Adamay: approvals.ts pushed, webhooks live                   (~3:15, blocks Sam step 10 only)
   │
   ├── Adamay ── first live email into ops@, then Cara steps 1–6 ──────────────┐
   ├── Aryan  ── Sam steps 9–12 (YES reply, approval, updates) ─────────────────┤  PARALLEL
   └── Akshat ── live test the apply form from a phone, then Cara's form ───────┤
                                                                                 ▼
GATE 5  Full run from `npm run reset` works end to end             (~3:35)
   │
   └── ALL ── fix in cut-list order only, no new features ── FREEZE 3:45
                                                                  ▼
GATE 6  Freeze
   ├── Aryan  ── record video (owner screen)         ─┐
   ├── Adamay ── README + social post, plays Priya    │  PARALLEL
   └── Akshat ── plays family + applicant on phone   ─┘
                                                      ▼
        Aryan submits as team lead                    4:25 hard stop 4:30
```

## How to announce a gate

Post one line in the team chat, exactly like this, so nobody has to ask:

- `GATE 0 open: keys sent`
- `GATE 1 open: skeleton pushed, types.ts frozen`
- `GATE 2 open: config/ids.json pushed (calendar, channel, project, pipelines, forms, rulebook)`
- `GATE 3 open: 150 contacts + visits seeded`
- `GATE 4 open: approvals.ts pushed, webhooks live`
- `GATE 5 open: full run passed`
- `GATE 6: FREEZE`

Step numbers refer to the lane docs: `lane-1-foundation-and-ops.md` and `lane-1b-cara.md` (Adamay), `lane-2-sam-scheduler.md` (Aryan), `lane-3-ravi.md` (Akshat).
