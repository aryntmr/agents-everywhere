import OpenAI from 'openai';
import type { Who } from './types.ts';
import * as rulebook from './rulebook.ts';

type Schema = Record<string, unknown>;

let client: OpenAI | null = null;
let usingOpenRouter = false;

function getClient(): OpenAI {
  if (client) return client;
  if (process.env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } else if (process.env.OPENROUTER_API_KEY) {
    usingOpenRouter = true;
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    });
  } else {
    throw new Error('llm: set OPENAI_API_KEY or OPENROUTER_API_KEY');
  }
  return client;
}

function model(): string {
  const m = process.env.OPENAI_MODEL;
  if (!m) throw new Error('llm: set OPENAI_MODEL');
  return m;
}

// Strict json_schema requires every object to list all properties as required and forbid extras.
export function strictify(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictify);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'properties' && v && typeof v === 'object') {
      out[k] = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, strictify(pv)]));
    } else {
      out[k] = strictify(v);
    }
  }
  const props = out.properties as Record<string, unknown> | undefined;
  if (out.type === 'object' || props) {
    out.additionalProperties = false;
    out.required = props ? Object.keys(props) : [];
    if (!props) out.properties = {};
  }
  return out;
}

async function complete(
  as: Who,
  label: string,
  params: Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, 'model'>,
): Promise<string> {
  const c = getClient();
  const started = Date.now();
  const req = { model: model(), ...params } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
  let res: OpenAI.Chat.ChatCompletion;
  try {
    res = await c.chat.completions.create(req);
  } catch (err: any) {
    // Some reasoning models reject a non-default temperature; retry once without it.
    if (req.temperature !== undefined && /temperature/i.test(String(err?.message))) {
      delete req.temperature;
      res = await c.chat.completions.create(req);
    } else {
      throw err;
    }
  }
  console.log(`[${as}] llm ${label} → ${((Date.now() - started) / 1000).toFixed(1)}s`);
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error(`llm ${label}: empty response (finish_reason=${res.choices[0]?.finish_reason})`);
  return content;
}

export async function askJSON<T = any>(
  as: Who,
  opts: { system: string; user: string; schema: Schema; rulebook?: boolean; label?: string },
): Promise<T> {
  let system = opts.system;
  if (opts.rulebook) {
    const rules = await rulebook.text(as);
    if (rules) system = `Rulebook:\n${rules}\n\n${system}`;
  }
  const label = opts.label ?? 'ask';
  const content = await complete(as, label, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: opts.user },
    ],
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'result', strict: true, schema: strictify(opts.schema) as Schema },
    },
  });
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error(`llm ${label}: response was not JSON: ${content.slice(0, 200)}`);
  }
}

export async function draft(as: Who, opts: { system: string; user: string; label?: string }): Promise<string> {
  getClient();
  const tokens = usingOpenRouter ? { max_tokens: 300 } : { max_completion_tokens: 300 };
  const content = await complete(as, opts.label ?? 'draft', {
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    temperature: 0.7,
    ...tokens,
  });
  return content.trim();
}
