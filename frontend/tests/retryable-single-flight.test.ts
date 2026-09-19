import assert from 'node:assert/strict';
import { createRetryableSingleFlight } from '../src/lib/retryableSingleFlight';

let attempts = 0;
let releaseFirst: (() => void) | null = null;
const firstAttempt = new Promise<boolean>((resolve) => { releaseFirst = () => resolve(false); });
const run = createRetryableSingleFlight(async () => {
  attempts += 1;
  if (attempts === 1) return firstAttempt;
  return true;
}, (value) => value === true);

const first = run();
const concurrent = run();
assert.equal(attempts, 1);
releaseFirst?.();
assert.equal(await first, false);
assert.equal(await concurrent, false);
assert.equal(await run(), true);
assert.equal(attempts, 2);

console.log('Retryable single-flight tests passed.');
