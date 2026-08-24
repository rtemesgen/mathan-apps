import assert from 'node:assert/strict';
import { mergeQueuedMutation, type QueuePolicyEntry } from '../src/lib/queuePolicy';

const entry = (mutationId: string, entityId: string, syncStatus: QueuePolicyEntry['syncStatus'] = 'pending'): QueuePolicyEntry => ({ mutationId, table: 'truck_transactions', companyId: 'workspace-a', entityId, syncStatus });

const first = entry('one', 'transaction-a');
const replacement = entry('two', 'transaction-a');
const second = entry('three', 'transaction-b');
assert.deepEqual(mergeQueuedMutation([first], replacement), [replacement], 'unresolved edits for one entity should coalesce');
assert.deepEqual(mergeQueuedMutation([first], second), [first, second], 'different entities must remain separate');
assert.deepEqual(mergeQueuedMutation([entry('conflict', 'transaction-a', 'conflicted')], replacement), [entry('conflict', 'transaction-a', 'conflicted'), replacement], 'conflicts must remain visible');
assert.deepEqual(mergeQueuedMutation([first], entry('one', 'transaction-a', 'pending')), [entry('one', 'transaction-a', 'pending')], 'the same mutation id replaces its existing queue row');

console.log('Queue policy tests passed.');
