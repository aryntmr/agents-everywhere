# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Hackathon Summary

**AI Tinkerers — Agents, Everywhere** (global, 48 cities) — submission deadline **Sat Sep 12, 2026 at 4:30 PM PDT** (aim for 4:00).

- **Team**: freddie — Aryan Tomar (lead), Adamay Mann
- **Theme**: an agent that lives where people already work/talk/live, and is more useful *because of* that context
- **Judging**: 4 criteria, 1–5 each — Functionality · Innovation/Theme · Technical Execution · Usefulness/Agentic UX
- **Sponsor prizes**: Best Use of CopilotKit (AirPods Max per member) · Best Use of Ambiguous AI (NVIDIA DGX Spark)

Details: `hackathon_information.md` · links, keys, CLIs: `resources.md` · progress: `todo.md`

---

## Project

_Idea TBD._ **Prize lane: Best Use of Ambiguous AI (NVIDIA DGX Spark)** — the agent lives in an Ambiguous workspace as a coworker with its own identity and is woken by workspace events (mentions, DMs, task assignments). Setup: `resources.md` → "Ambiguous AI track". Load keys into the shell before starting Claude Code: `set -a; source .env; set +a`.

---

## Rules that constrain the code

- **Net-new only.** Libraries, templates, and starter code are fine; the core must be written today. Never copy code from other repos (especially Vali work repos).
- **Public repo.** Never commit `.env` or keys. `.env.example` lists every sponsor variable.
- **Real integrations, not mocks.** A mocked integration scores 1 on Technical Execution.
- **The environment must be load-bearing.** A generic chatbot dropped into Slack scores 1–2 on Innovation.
- **Demo-first scope.** One flawless end-to-end flow in a 2-minute video beats three half-working features.
- **Keep gcloud off work.** The default gcloud config is the Vali work account; use the `hackathon` configuration in `resources.md`.

## Time budget (PDT)

| By | Milestone |
|---|---|
| 12:00 | Direction locked, repo created, keys in `.env` |
| 3:00 | Core loop working end to end in the real environment |
| 3:45 | Demo path hardened, ≤ 2-min video recorded |
| 4:15 | Social post live, form filled, entry submitted (hard stop 4:30) |
