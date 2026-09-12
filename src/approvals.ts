import type { Who } from './types.ts';
import { ambi, chat, ids, list, one, sleep, tasks } from './ambi.ts';

const POLL_MS = 10_000;
const TIMEOUT_MS = 20 * 60_000;
const OPEN_STATUSES = 'todo,in_progress,blocked';

const waiters = new Map<string, (ok: boolean) => void>();

function firstName(as: Who): string {
  const display: string = ids.agents?.[as]?.display_name ?? as;
  return display.split(' ')[0];
}

// Unconfirmed: task objects expose `id`, `title`, and system `status` (todo|in_progress|done|cancelled|blocked).
function taskStatus(task: any): string {
  return String(task?.status ?? '');
}

async function findOpen(as: Who, title: string): Promise<any | null> {
  const args = ['tasks', 'list', '--q', title, '--status', OPEN_STATUSES, '--limit', '20'];
  if (ids.office_project_id) args.push('--project-id', ids.office_project_id);
  if (ids.owner_user_id) args.push('--assignee-id', ids.owner_user_id);
  const res = await ambi(as, args);
  return list(res).find((t: any) => t?.title === title) ?? null;
}

export async function request(
  as: Who,
  opts: { title: string; description: string; contactId?: string },
): Promise<boolean> {
  let task = await findOpen(as, opts.title);
  if (!task) {
    task = one(
      await tasks.create(as, {
        title: opts.title,
        description: opts.description,
        assigneeId: ids.owner_user_id,
        priority: 'high',
        projectId: ids.office_project_id,
        contactId: opts.contactId,
      }),
    );
    await chat.office(as, `🙋 ${firstName(as)}: needs your OK → ${opts.title}`);
  }
  const taskId: string = task.id;
  console.log(`[${as}] approval waiting on task ${taskId}`);

  return new Promise<boolean>((done) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      waiters.delete(taskId);
      console.log(`[${as}] approval ${taskId} → ${ok ? 'approved' : 'not approved'}`);
      done(ok);
    };
    waiters.set(taskId, finish);

    void (async () => {
      const deadline = Date.now() + TIMEOUT_MS;
      while (!settled && Date.now() < deadline) {
        await sleep(POLL_MS);
        if (settled) return;
        try {
          const status = taskStatus(one(await tasks.get(as, taskId)));
          if (status === 'done') finish(true);
          else if (status === 'cancelled') finish(false);
        } catch (err: any) {
          console.log(`[${as}] approval poll ${taskId} failed: ${err?.message ?? err}`);
        }
      }
      finish(false);
    })();
  });
}

// Called by server.ts on task.completed; returns whether anyone was waiting on this task.
export function resolve(taskId: string, ok: boolean): boolean {
  const waiter = waiters.get(taskId);
  if (!waiter) return false;
  waiter(ok);
  return true;
}
