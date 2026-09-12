#!/usr/bin/env node
// Gate 0: create the four AI coworker accounts (Ops, Sam, Cara, Ravi) in the Ambiguous workspace,
// save each coworker's API key into .env, and write their ids into config/ids.json.
//
// Run by the workspace OWNER from the repo root (creating accounts is an owner/admin action):
//   node scripts/provision-coworkers.mjs --dry-run   # read-only preview
//   node scripts/provision-coworkers.mjs             # do it
//
// It finds an owner key in .env (AMBI_OWNER_KEY, or any AMBI_KEY_* line that still logs in as a human).
// Each key is written to .env the moment it is returned (keys are shown only once) and is never printed.
// Safe to re-run: a coworker whose .env key already works is skipped; an existing coworker without a
// working key gets a fresh key instead of a second account.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');
const COWORKERS = [
  { who: 'ops', env: 'AMBI_KEY_OPS', name: 'Ops (front desk)', role: 'admin' },
  { who: 'sam', env: 'AMBI_KEY_SAM', name: 'Sam (scheduling)', role: 'member' },
  { who: 'cara', env: 'AMBI_KEY_CARA', name: 'Cara (care coordination)', role: 'member' },
  { who: 'ravi', env: 'AMBI_KEY_RAVI', name: 'Ravi (people)', role: 'member' },
];
const ENV_PATH = '.env';
const IDS_PATH = 'config/ids.json';
const redact = (s) => String(s).replace(/ak_[A-Za-z0-9_-]+/g, 'ak_***');

let envText = readFileSync(ENV_PATH, 'utf8');
const lineRe = (k) => new RegExp(`^${k}=.*$`, 'm');
const envGet = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim();
function envSave(k, v) {
  const line = `${k}=${v}`;
  envText = lineRe(k).test(envText) ? envText.replace(lineRe(k), () => line) : `${envText.replace(/\n*$/, '\n')}${line}\n`;
  writeFileSync(ENV_PATH, envText);
}

function ambi(token, args) {
  try {
    const out = execFileSync('npx', ['-y', 'ambiguous@latest', ...args, '--json'], {
      env: { ...process.env, AMBI_API_TOKEN: token },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (e) {
    try {
      return JSON.parse(e.stdout);
    } catch {
      return { ok: false, error: redact(`${e.stdout ?? ''}${e.stderr ?? ''}`).trim() || e.message };
    }
  }
}

// The provisioning response is `{user, api_key}`; agent key minting returns `raw_key`. Accept either shape.
function keyFrom(r) {
  const direct =
    r?.raw_key ?? r?.data?.raw_key ?? r?.api_key?.raw_key ?? r?.data?.api_key?.raw_key ??
    (typeof r?.api_key === 'string' ? r.api_key : null) ?? (typeof r?.data?.api_key === 'string' ? r.data.api_key : null);
  return direct ?? JSON.stringify(r ?? {}).match(/"(ak_[A-Za-z0-9_-]{24,})"/)?.[1] ?? null;
}

const tokens = [
  ...new Set([process.env.AMBI_OWNER_KEY, envGet('AMBI_OWNER_KEY'), ...COWORKERS.map((c) => envGet(c.env))].filter(Boolean)),
];
let owner = null;
let ownerToken = null;
for (const t of tokens) {
  const me = ambi(t, ['whoami']);
  if (me.authenticated && me.type === 'human') {
    owner = me;
    ownerToken = t;
    break;
  }
}
if (!ownerToken) {
  console.error('No owner key found in .env. Create an API key for your own account (Admin > People & access > API keys),');
  console.error('put it in .env as AMBI_OWNER_KEY=..., and re-run.');
  process.exit(1);
}
console.log(`${DRY ? '[dry-run] ' : ''}Acting as ${owner.user} (${owner.userId}), workspace ${owner.workspaceId}`);

const ids = existsSync(IDS_PATH) ? JSON.parse(readFileSync(IDS_PATH, 'utf8')) : {};
ids.workspace_id = owner.workspaceId;
ids.owner_user_id = owner.userId;
const domains = ambi(ownerToken, ['admin', 'domains', 'list']);
ids.workspace_domain = (domains.data ?? []).find((d) => d.isDefault)?.domain ?? ids.workspace_domain ?? '';
ids.agents ??= {};
const saveIds = () => {
  if (DRY) return;
  mkdirSync('config', { recursive: true });
  writeFileSync(IDS_PATH, `${JSON.stringify(ids, null, 2)}\n`);
};

const users = ambi(ownerToken, ['admin', 'users', 'list', '--limit', '100']);
if (users.ok === false) {
  console.error(`Could not list workspace users: ${users.error}`);
  process.exit(1);
}
const agents = (users.data ?? []).filter((u) => u.type !== 'human');
console.log(`${DRY ? '[dry-run] ' : ''}Workspace domain ${ids.workspace_domain || '(unknown)'}; ${agents.length} coworker account(s) exist now`);

let failures = 0;
for (const c of COWORKERS) {
  const existing = agents.find((u) => u.username === c.who || u.display_name === c.name);

  if (existing && envGet(c.env)) {
    const me = ambi(envGet(c.env), ['whoami']);
    if (me.authenticated && me.userId === existing.id) {
      ids.agents[c.who] = { user_id: existing.id, email: me.email, display_name: c.name };
      saveIds();
      console.log(`✓ ${c.name}: already set up (${me.email})`);
      continue;
    }
  }
  if (DRY) {
    console.log(`[dry-run] ${c.name}: ${existing ? `account exists (${existing.id}), would mint a fresh key` : `would create it as ${c.role}, username ${c.who}`}`);
    continue;
  }

  let user = existing;
  let key = null;
  if (!user) {
    const base = ['admin', 'users', 'provision-agent', '--display-name', c.name, '--username', c.who, '--role', c.role];
    let r = ambi(ownerToken, base);
    if (r.ok === false && /reserved/i.test(r.error ?? '')) r = ambi(ownerToken, [...base, '--allow-reserved-local-part', 'true']);
    user = r.user ?? r.data?.user;
    key = keyFrom(r);
    if (key) envSave(c.env, key); // save before anything else: the key is shown only once
    if (!user) {
      failures++;
      console.error(`✗ ${c.name}: ${redact(r.error ?? JSON.stringify(r)).slice(0, 400)}`);
      continue;
    }
  }
  if (!key) {
    const r = ambi(ownerToken, ['agents', 'api-keys', 'create', user.id, '--name', `${c.name} key`]);
    key = keyFrom(r);
    if (key) envSave(c.env, key);
    if (!key) {
      failures++;
      console.error(`✗ ${c.name}: account ${user.id} exists but no key came back: ${redact(r.error ?? JSON.stringify(r)).slice(0, 400)}`);
      continue;
    }
  }
  const me = ambi(key, ['whoami']);
  if (!me.authenticated || me.userId !== user.id) {
    failures++;
    console.error(`✗ ${c.name}: key saved to ${c.env} but it does not log in as the coworker: ${redact(me.error ?? JSON.stringify(me)).slice(0, 200)}`);
    continue;
  }
  ids.agents[c.who] = { user_id: user.id, email: me.email ?? user.workspace_email ?? user.email, display_name: c.name };
  saveIds();
  console.log(`✓ ${c.name}: created, ${me.email}, key saved to ${c.env}`);
}

if (DRY) {
  console.log(`[dry-run] would write ${IDS_PATH} with owner_user_id=${ids.owner_user_id} workspace_domain=${ids.workspace_domain}`);
  process.exit(0);
}
saveIds();
if (failures) {
  console.log(`\n${failures} coworker(s) failed. Fix the error above and re-run; finished coworkers are skipped.`);
  process.exit(1);
}
console.log('\nAll four coworkers are ready. Revoke the owner-level keys you no longer need in Admin > People & access > API keys.');
