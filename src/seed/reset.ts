// Resets the workspace to the pre-demo state. Leaves seed contacts and visit series alone.
import 'dotenv/config';
import { ambi, cal, crm, formatVisit, ids, list, localDate, localISO, localWeekday, sleep } from '../ambi.ts';
import type { Who } from '../types.ts';
import { VISIT_COLOR } from './data.ts';

const WHOS: Who[] = ['ops', 'sam', 'cara', 'ravi'];
const GAP_MS = 1100;

// Response-shape assumption: the creator's user id field name.
const creatorOf = (x: any): string => x?.creator_id ?? x?.created_by ?? x?.owner_id ?? x?.user_id ?? '';

// Deletes are creator/owner scoped, so try the creator's key first, then every coworker.
async function deleteAsAnyone(args: string[], resource: any): Promise<boolean> {
  const creator = WHOS.find((w) => ids.agents?.[w]?.user_id === creatorOf(resource));
  for (const w of creator ? [creator, ...WHOS.filter((x) => x !== creator)] : WHOS) {
    try {
      await ambi(w, [...args, '--yes']);
      await sleep(GAP_MS);
      return true;
    } catch (e) {
      if (!/forbidden|permission|not found|owner|creator|403|404/i.test((e as Error).message)) console.log(`  ${w}: ${(e as Error).message}`);
    }
  }
  console.log(`∆ could not delete ${args.slice(0, 3).join(' ')} ${args[3] ?? ''}`);
  return false;
}

async function resetTasks() {
  if (!ids.office_project_id) return 0;
  const rows = list(await ambi('ops', ['tasks', 'list', '--project-id', ids.office_project_id, '--limit', '200']));
  let n = 0;
  for (const t of rows) n += Number(await deleteAsAnyone(['tasks', 'delete', t.id], t));
  return n;
}

async function resetDeals() {
  let n = 0;
  for (const p of Object.values<any>(ids.pipelines ?? {})) {
    if (!p?.id) continue;
    const rows = list(await ambi('ops', ['crm', 'deals', 'list', '--pipeline-id', p.id, '--limit', '200']));
    for (const d of rows) n += Number(await deleteAsAnyone(['crm', 'deals', 'delete', d.id], d));
  }
  return n;
}

async function resetEvents() {
  if (!ids.visits_calendar_id) return 0;
  const now = Date.now();
  const rows = list(await ambi('ops', [
    'calendar', 'events', 'list', '--calendar-id', ids.visits_calendar_id,
    '--start', localISO(new Date(now - 30 * 86_400_000)), '--end', localISO(new Date(now + 60 * 86_400_000)), '--limit', '500',
  ]));
  const doomed = rows.filter((e) => /^(TEST |Assessment —|Interview —)/.test(String(e.title ?? '')));
  let n = 0;
  for (const e of doomed) n += Number(await deleteAsAnyone(['calendar', 'events', 'delete', e.id], e));
  return n;
}

async function resetIntakeContacts() {
  const doomed = (await crm.all('ops')).filter((c) => /\+(lena|carlos|jordan)@/i.test(String(c.email ?? '')));
  let n = 0;
  for (const c of doomed) n += Number(await deleteAsAnyone(['crm', 'contacts', 'delete', c.id], c));
  return n;
}

function nextTuesday(): string {
  let t = Date.now();
  while (localWeekday(new Date(t)) !== 'Tue') t += 86_400_000;
  return localDate(new Date(t));
}

async function resetPatel() {
  const { patel_series_event_id: masterId, patel_contact_id: clientId, maria_contact_id: caregiverId } = ids.demo ?? {};
  if (!masterId || !clientId || !caregiverId) {
    console.log('∆ demo ids missing; skipping Patel reset');
    return '';
  }
  const date = nextTuesday();
  await cal.editOccurrence('ops', masterId, date, {
    title: 'Visit — Patel — Maria',
    description: formatVisit({ client_id: clientId, caregiver_id: caregiverId, status: 'scheduled' }),
    color: VISIT_COLOR,
  });
  return date;
}

async function main() {
  const tasks = await resetTasks();
  const deals = await resetDeals();
  const events = await resetEvents();
  const contacts = await resetIntakeContacts();
  const patelDate = await resetPatel();
  console.log(`✔︎ reset: ${tasks} tasks, ${deals} deals, ${events} events, ${contacts} intake contacts deleted; Patel ${patelDate || 'not'} reset to Maria`);
}

main().catch((e) => {
  console.error(`‼︎ reset failed: ${(e as Error).message}`);
  process.exit(1);
});
