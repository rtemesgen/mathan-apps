import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createActionGate } from '../src/hooks/useAsyncAction';

const sourceRoot = path.resolve('src');
const read = (relativePath: string) => fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');

const appFiles = ['apps/book/App.tsx', 'apps/payroll/App.tsx', 'apps/truck/App.tsx'].map(read).join('\n');
assert.doesNotMatch(appFiles, /PersistenceToast|usePersistenceStatus/);
assert.doesNotMatch(appFiles, /useCloudSnapshot/);
assert.match(read('components/AppToast.tsx'), /mathan:toast/);
assert.match(read('components/AppToast.tsx'), /lastKey/);
assert.match(read('lib/repositories/snapshotRepository.ts'), /snapshotTails/);
assert.match(read('lib/repositories/snapshotRepository.ts'), /relevant\.length > 0/);
assert.match(read('hooks/useAsyncAction.ts'), /gate\.current/);
assert.match(read('hooks/useAsyncAction.ts'), /runAction/);
assert.match(read('lib/sqliteJson.ts'), /CryptoKey/);
assert.match(read('lib/syncQueue.ts'), /mergeQueuedMutation/);
assert.match(read('lib/offlineSync.ts'), /replaceQueue\(remaining, ordered\.map/);
assert.match(read('apps/truck/App.tsx'), /from ['"]\.\.\/\.\.\/components\/DeleteConfirmModal/);
assert.doesNotMatch(read('apps/truck/App.tsx'), /components\/ConfirmDeleteModal/);
assert.match(read('apps/book/cashBookRepository.ts'), /export function createBook/);
assert.match(read('apps/payroll/payrollRepository.ts'), /export function addEmployee/);
assert.match(read('apps/truck/truckRepository.ts'), /withCacheLock/);
assert.match(read('apps/truck/useTruckData.ts'), /refreshTruckDataFromCloud/);
assert.doesNotMatch(read('apps/truck/App.tsx'), /from ['"]\.\/truckRepository/);
assert.match(read('apps/truck/useTruckMutations.ts'), /createTruckTransactionBatch/);
assert.match(read('apps/truck/useTruckFinancials.ts'), /calculateTruckFinancials/);
assert.match(read('apps/truck/useTruckPreferences.ts'), /mathan_truck_preferences_/);

const gate = createActionGate();
let releaseFirst: (() => void) | undefined;
const first = gate.run(() => new Promise<string>((resolve) => { releaseFirst = () => resolve('first'); }));
const duplicate = await gate.run(async () => 'duplicate');
assert.equal(duplicate, undefined, 'rapid duplicate actions must be ignored while the first action is active');
releaseFirst?.();
assert.equal(await first, 'first');
assert.equal(gate.isActive(), false, 'action gate must release after completion');

const snapshotSource = read('lib/repositories/snapshotRepository.ts');
assert.ok(snapshotSource.indexOf('await writeOffline(context.storageKey, value)') < snapshotSource.indexOf('await enqueueMutation('), 'snapshot data must be durable before queueing');
assert.ok(snapshotSource.indexOf('relevant.length > 0') < snapshotSource.indexOf('await writeOffline(context.storageKey, remote.payload)'), 'pending local snapshots must be protected from cloud hydration');
const snapshotHookSource = read('hooks/useCloudSnapshot.ts');
assert.ok(snapshotHookSource.indexOf('await persistSnapshot(context, nextValue') < snapshotHookSource.indexOf('setValue(nextValue)'), 'snapshot state must update after durable persistence');
assert.match(read('apps/book/components/AddBookModal.tsx'), /useSubmitGuard/);
assert.match(read('apps/payroll/views/PaySalaryView.tsx'), /useSubmitGuard/);
assert.match(read('apps/truck/components/AddPartnerModal.tsx'), /useSubmitGuard/);

console.log('Architecture boundary tests passed.');
