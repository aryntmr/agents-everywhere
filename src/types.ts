// FROZEN at Gate 1. Adapt handlers to these types; do not change them without team chat.
export type Who = 'ops' | 'sam' | 'cara' | 'ravi';

// Every event that reaches a coworker is normalized to this shape by server.ts.
// Handlers must NOT depend on the raw webhook payload. Fetch the resource by id.
export type Event =
  | { type: 'email'; who: Who; emailId: string; to: string; from: string; subject: string; raw?: unknown }
  | { type: 'form'; who: Who; formId: string; responseId?: string; answers: Record<string, unknown>; raw?: unknown }
  | { type: 'task_done'; who: Who; taskId: string; raw?: unknown }
  | { type: 'handoff'; who: Who; from: Who; kind: string; payload: Record<string, unknown> } // coworker to coworker
  | { type: 'timer'; who: Who; kind: 'morning_brief' | 'cert_sweep' | 'offer_timeout'; payload?: Record<string, unknown> };

export interface Coworker {
  who: Who;
  handle(event: Event): Promise<void>;
}
