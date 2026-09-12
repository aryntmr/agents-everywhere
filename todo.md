# TODO

## Now — access (Aryan)
- [x] Credits survey submitted
- [ ] OpenAI: sign in to chatgpt.com with your PERSONAL account, then Credits page → Reveal my code → redeem (1,250 Codex credits, by Sep 26 UTC; Codex only, not API)
- [ ] OpenRouter: code pending (email + DM) → redeem → key → `.env`
- [ ] Exa: redeem the offer code on the Credits page → key → `.env` (Exa MCP already works without a key)
- [ ] `codex login`
- [ ] `auth0 login` (only if using Auth0)
- [ ] Trigger.dev account (only if using Trigger.dev)
- [x] Ambiguous AI account (signed in)
- [ ] Ambiguous: MCP page → Claude Code → Authorize a new agent → Get the key → `.env` as `AMBI_API_TOKEN`
- [ ] `set -a; source .env; set +a && npx ambiguous@latest whoami` → confirm it's the coworker identity
- [x] Get Adamay's GitHub username (`mannadamay12`)

## Decide
- [ ] Direction: environment + user + the one workflow the demo shows
- [x] Sponsor-prize lane: Ambiguous AI (CopilotKit still possible as a second lane)

## Repo
- [x] Local workspace: `~/Personal/hackathons/agents-everywhere` (git init, `.gitignore`, `.env.example`, `.env`, docs)
- [x] Public repo: https://github.com/aryntmr/agents-everywhere
- [x] Invite Adamay as collaborator (write) — they need to accept

## Build — lane 1 (Adamay, branch `lane1/foundation`, fast-forward to main at each gate)
- [x] Skeleton: package.json, tsconfig, `src/types.ts` (frozen)
- [x] `src/ambi.ts` pushed to main → GATE 1
- [ ] Verification checks 2–6 (plan/00 section 8) → post ✅/❌ in chat
- [x] Seed containers (calendar, #office, project, pipelines, forms, rulebook) → GATE 2
- [ ] Seed 150 contacts + ~70 visit series → GATE 3
- [x] `llm.ts`, `people.ts`, `rulebook.ts`, `approvals.ts`
- [x] `server.ts` + `registry.ts` + `run.ts`, Ops coworker
- [ ] cloudflared tunnel + webhooks → GATE 4
- [ ] Cara coworker, acceptance test from fixture and live form
- [ ] `reset.ts`, full run twice from reset → GATE 5
- [ ] README + social post text (3:45)

## Submit (hard stop 4:30 PM PDT)
- [ ] Record ≤ 2-min demo (YouTube Unlisted or Loom)
- [ ] Social post tagging all sponsors + `#AgentsEverywhere` → copy URL
- [ ] Portal form: name · description (hit all 4 criteria + tech list) · tools checkboxes · team contributions (Aryan + Adamay) · social URL · video · GitHub link · prior work
- [ ] Submit Entry (team lead)
