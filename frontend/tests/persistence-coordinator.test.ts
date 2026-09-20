import assert from 'node:assert/strict';
import { createPersistenceCoordinator } from '../src/lib/persistenceCoordinator';

const coordinator = createPersistenceCoordinator();
const events: string[] = [];
let releaseFirst!: () => void;
const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });

const first = coordinator.run(async () => {
  events.push('first-start');
  await firstBlocked;
  events.push('first-end');
});

const second = coordinator.run(async () => {
  events.push('second-start');
});

await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(events, ['first-start'], 'a second native operation must wait for the first operation to finish');

releaseFirst();
await Promise.all([first, second]);
assert.deepEqual(events, ['first-start', 'first-end', 'second-start']);

console.log('Persistence coordinator tests passed.');
