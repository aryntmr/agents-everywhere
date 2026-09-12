import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { coworker } from './registry.ts';
import type { Who } from './types.ts';

const [who, fixture] = process.argv.slice(2);
if (!who || !fixture) {
  console.error('usage: tsx src/run.ts <ops|sam|cara|ravi> <fixture.json>');
  process.exit(1);
}

try {
  const event = JSON.parse(readFileSync(fixture, 'utf8'));
  const cw = await coworker(who as Who);
  await cw.handle(event);
  console.log(`done: ${who} handled ${fixture}`);
  process.exit(0);
} catch (err) {
  console.error(`failed: ${who} ${fixture}:`, err);
  process.exit(1);
}
