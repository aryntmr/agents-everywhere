# Resources — Agents, Everywhere (AI Tinkerers SF · Sat Sep 12, 2026)

## Hackathon portal (you're logged in via Chrome)
- Portal: https://sf.aitinkerers.org/hackathons/h_XWWQL5eKfJM
- Handbook: https://sf.aitinkerers.org/hackathons/h_XWWQL5eKfJM/handbook
- Credits & Offers (survey-gated): https://sf.aitinkerers.org/hackathon-rewards/hrc_4720e4ed2ba8082ed3ca077732195d41
- Submit entry (team lead = you): https://sf.aitinkerers.org/hackathons/h_XWWQL5eKfJM/entries
- Event chat: https://sf.aitinkerers.org/message_center?board=meetup_mu_TjLaGdOuI4E
- Public event page: https://sf.aitinkerers.org/p/agents-everywhere-bots-channels-more-global-hackathon
- Global page (48 cities, one shared prize pool): https://aitinkerers.org/hackathons/global/agents-everywhere
- Organizer (Jake Laes, HQ) in chat: "No tools are explicitly required" — any stack is fine.

## Sponsors — what each is for
| Sponsor | What it gives you | Start here | Local status |
|---|---|---|---|
| **OpenAI** (marquee) | Models, Agents SDK (Py/JS), Realtime voice agents, Codex | Agents SDK Py: https://openai.github.io/openai-agents-python/ · JS: https://github.com/openai/openai-agents-js · Voice agents: https://developers.openai.com/api/docs/guides/voice-agents · Realtime: https://developers.openai.com/api/docs/guides/realtime | `codex` 0.147.0 installed → run `codex login` |
| **CopilotKit** (prize: AirPods Max per member) | Frontend stack for agents, AG-UI protocol, generative UI (React/Angular/Slack/mobile) | https://docs.copilotkit.ai/quickstart · `npx copilotkit@latest create` (scaffolds a NEW dir) · https://github.com/copilotkit/copilotkit · https://www.copilotkit.ai/ag-ui | nothing global to install |
| **Ambiguous AI** (prize: NVIDIA DGX Spark) | Workspace where agents are coworkers with their own identity — email, chat, tasks, docs, CRM; driven by MCP tool calls; works with Claude Code + Codex | https://www.ambiguous.ai/agents · sign up: https://app.ambiguous.ai/register · free: 5 members, 1,000 AI actions/mo | account needed (you) |
| **OpenRouter** | One OpenAI-compatible API over many models | https://openrouter.ai/docs/quickstart · base URL `https://openrouter.ai/api/v1` | credit code via survey |
| **Exa** | Web search/crawl API built for agents, MCP server | https://docs.exa.ai/reference/exa-mcp · npm `exa-mcp-server` · https://github.com/exa-labs/exa-mcp-server | key via https://dashboard.exa.ai |
| **Auth0** | Auth0 for AI Agents — Token Vault lets the agent get short-lived tokens for GitHub/Slack/Google (30+ apps) | https://auth0.com/docs/get-started/auth0-for-ai-agents · https://auth0.com/ai/docs/intro/token-vault | `auth0` CLI 1.35.0 installed → run `auth0 login` |
| **Trigger.dev** | Durable long-running agent tasks in TypeScript (retries, queues, observability) | https://trigger.dev/docs/quick-start · `npx trigger.dev@latest init` → `npx trigger.dev@latest dev` · import from `@trigger.dev/sdk` (NOT `/v3`) | account at https://cloud.trigger.dev |
| **Mozilla.ai** | Open-source agent tooling | any-llm https://github.com/mozilla-ai/any-llm · any-agent https://github.com/mozilla-ai/any-agent · mcpd https://github.com/mozilla-ai/mcpd · cq https://github.com/mozilla-ai/cq · llamafile https://github.com/mozilla-ai/llamafile | — |
| **Google Cloud Run** | Deploy a container with a public URL | https://cloud.google.com/run/docs/quickstarts | `gcloud` installed — see warning below |

## Local tooling (checked 2026-09-12)
node 26.0 · npm 11.12 · pnpm 10.19 · python 3.14 · uv 0.8.15 · docker 29.1 · gh (logged in as `aryntmr`) · gcloud 562 · codex 0.147 · claude 2.1.226
**Installed today:** `auth0` 1.35.0, `cloudflared` 2026.9.1
- Public HTTPS URL for a local server, no account needed (Slack/Twilio/webhook agents): `cloudflared tunnel --url http://localhost:3000`

## ⚠️ gcloud is pointed at WORK
The default gcloud config on this machine is a work account/project. Don't deploy the hackathon there.
Isolated config that doesn't touch your work shell:
```bash
gcloud config configurations create hackathon --no-activate
gcloud config set account <personal-google-account> --configuration=hackathon
gcloud config set project <personal-project-id> --configuration=hackathon
export CLOUDSDK_ACTIVE_CONFIG_NAME=hackathon   # only in the hackathon terminal
```

## Social post (required for submission)
Hashtag: **#AgentsEverywhere**
X: `@AITinkerers @OpenAI @CopilotKit @openrouter @exaailabs @auth0 @ambiguousio @mozillaAI @googlecloud`
LinkedIn (type @ and select): AI Tinkerers, OpenAI, CopilotKit, OpenRouter, Exa, Auth0, Ambiguous AI, Trigger.dev, Mozilla.ai, Google Cloud

## MCP servers wired into this workspace
- **Exa** (`.mcp.json`) — hosted `https://mcp.exa.ai/mcp`. Works with **no API key** on a rate-limited free tier (429 when exceeded). Claude Code asks you to approve it the first time you open this folder. To lift limits, add an `x-api-key` header — but keep the key out of `.mcp.json`, since the repo will be public.
