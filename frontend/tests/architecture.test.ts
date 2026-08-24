import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve('src');
const read = (relativePath: string) => fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');

const appFiles = ['apps/book/App.tsx', 'apps/payroll/App.tsx', 'apps/truck/App.tsx'].map(read).join('\n');
assert.doesNotMatch(appFiles, /PersistenceToast|usePersistenceStatus/);
assert.doesNotMatch(appFiles, /useCloudSnapshot/);
assert.match(read('components/AppToast.tsx'), /mathan:toast/);
assert.match(read('components/AppToast.tsx'), /lastKey/);
assert.match(read('lib/repositories/snapshotRepository.ts'), /snapshotTails/);
assert.match(read('lib/repositories/snapshotRepository.ts'), /relevant\.length > 0/);
assert.match(read('hooks/useAsyncAction.ts'), /active\.current/);
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

console.log('Architecture boundary tests passed.');
