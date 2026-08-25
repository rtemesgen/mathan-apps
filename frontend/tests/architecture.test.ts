import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createActionGate } from '../src/hooks/useAsyncAction';

const sourceRoot = path.resolve('src');
const read = (relativePath: string) => fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');

const appFiles = ['apps/book/App.tsx', 'apps/payroll/App.tsx', 'apps/truck/App.tsx'].map(read).join('\n');
assert.doesNotMatch(appFiles, /PersistenceToast|usePersistenceStatus|useCloudSnapshot/);
assert.doesNotMatch(appFiles, /supabase|localStore|offlineStore|app_state_snapshots|syncQueue/);
assert.match(read('lib/repositories/useSnapshotRepository.ts'), /persistSnapshot/);
assert.match(read('lib/repositories/mutationLifecycle.ts'), /persistBeforeQueue/);
assert.match(read('components/AppToast.tsx'), /mathan:toast/);
assert.match(read('components/AppToast.tsx'), /lastKey/);
assert.match(read('components/AppToast.tsx'), /mathan:sync-status/);
assert.match(read('components/AppToast.tsx'), /mathan:sync-conflict/);
assert.doesNotMatch(read('components/AppNotificationCenter.tsx'), /mathan:sync-status|mathan:sync-conflict/);
assert.doesNotMatch(read('lib/offlineSync.ts'), /mathan:truck-storage-status/);
assert.doesNotMatch(read('apps/truck/truckRepository.ts'), /mathan:truck-storage-status/);
assert.match(read('components/AppToast.tsx'), /toast\.tone/);
assert.match(read('lib/mobile.ts'), /ToastTone/);
assert.match(read('components/DeleteConfirmModal.tsx'), /successMessage/);
assert.match(read('components/DeleteConfirmModal.tsx'), /tone: 'error'/);
assert.match(read('hooks/useDeleteConfirmation.ts'), /close only after the operation succeeds/);
assert.match(read('hooks/useDeleteConfirmation.ts'), /await request\.onConfirm/);
assert.match(read('apps/truck/useTruckMutations.ts'), /DeleteConfirmationRequest/);
assert.match(read('apps/book/components/DeleteBookModal.tsx'), /successMessage/);
assert.match(read('apps/truck/App.tsx'), /useDeleteConfirmation/);
assert.match(read('components/AppConnectivityBanner.tsx'), /useOnlineStatus/);
assert.match(read('components/AppConnectivityBanner.tsx'), /Offline/);
assert.match(read('index.css'), /admin-sidebar \{ width: 240px !important/);
assert.match(read('lib/fileExport.ts'), /createCsv/);
assert.match(read('apps/truck/components/Modals/ExportModal.tsx'), /downloadCsvFile/);
assert.match(read('apps/payroll/views/ReportsView.tsx'), /downloadCsvFile/);
assert.match(read('apps/truck/components/Pages/ExportPage.tsx'), /exportPdfFile/);
assert.match(read('apps/truck/components/Pages/ExportPage.tsx'), /downloadCsvFile/);
assert.match(read('components/CompanySelector.tsx'), /useAsyncAction/);
assert.match(read('lib/repositories/snapshotRepository.ts'), /snapshotTails/);
assert.match(read('lib/repositories/snapshotRepository.ts'), /relevant\.length > 0/);
assert.match(read('hooks/useAsyncAction.ts'), /gate\.current/);
assert.match(read('hooks/useAsyncAction.ts'), /runAction/);
assert.match(read('hooks/useAsyncAction.ts'), /tone: 'success'/);
assert.match(read('hooks/useAsyncAction.ts'), /tone: 'error'/);
assert.match(read('lib/sqliteJson.ts'), /CryptoKey/);
assert.match(read('lib/sqliteStore.ts'), /verifyMigratedEntries/);
assert.match(read('lib/localStore.ts'), /export interface OfflineStore/);
assert.doesNotMatch(read('auth/guestWorkspaces.ts'), /\b(readOffline|writeOffline|deleteOffline)\b/);
assert.doesNotMatch(read('admin/adminBackup.ts'), /\b(readOffline|writeOffline|deleteOffline)\b/);
assert.match(read('auth/AuthProvider.tsx'), /offlineStore\.read/);
assert.match(read('auth/AuthProvider.tsx'), /offlineStore\.write/);
assert.match(read('lib/repositories/snapshotRepository.ts'), /offlineStore/);
assert.match(read('lib/syncQueue.ts'), /offlineStore/);
assert.match(read('lib/syncQueue.ts'), /mergeQueuedMutation/);
assert.match(read('lib/offlineSync.ts'), /replaceQueue\(remaining, ordered\.map/);
assert.match(read('apps/truck/App.tsx'), /from ['"]\.\.\/\.\.\/components\/DeleteConfirmModal/);
assert.doesNotMatch(read('apps/truck/App.tsx'), /components\/ConfirmDeleteModal/);
assert.match(read('apps/book/cashBookRepository.ts'), /export function createBook/);
assert.match(read('apps/book/cashBookRepository.ts'), /export async function saveNewBook/);
assert.match(read('apps/payroll/payrollRepository.ts'), /export function addEmployee/);
assert.match(read('apps/payroll/payrollRepository.ts'), /export async function saveEmployee/);
assert.match(read('apps/truck/truckRepository.ts'), /withCacheLock/);
assert.match(read('apps/truck/truckRepository.ts'), /persistBeforeQueue/);
assert.match(read('apps/truck/truckRepository.ts'), /updateCache\(workspaceId/);
assert.match(read('apps/truck/truckRepository.ts'), /queueRow\(/);
assert.match(read('apps/truck/truckRepository.ts'), /synchronizeTruckData/);
assert.doesNotMatch(read('apps/truck/useTruckData.ts'), /syncQueue|refreshTruckDataFromCloud/);
assert.doesNotMatch(read('apps/truck/truckRepository.ts'), /supabase\.from\('(trucks|truck_owners|truck_transactions)'\)\.(insert|update)/);
assert.doesNotMatch(read('apps/truck/truckRepository.ts'), /supabase\.from\('truck_transactions'\)\.insert/);
assert.match(read('apps/truck/useTruckData.ts'), /synchronizeTruckData/);
assert.doesNotMatch(read('apps/truck/App.tsx'), /from ['"]\.\/truckRepository/);
assert.match(read('apps/truck/useTruckMutations.ts'), /createTruckTransactionBatch/);
assert.doesNotMatch(read('apps/truck/useTruckMutations.ts'), /supabase|localStore|offlineStore/);
assert.doesNotMatch(read('apps/book/App.tsx'), /setBooks/);
assert.doesNotMatch(read('apps/book/App.tsx'), /showAppToast/);
assert.doesNotMatch(read('apps/payroll/App.tsx'), /setEmployees/);
assert.match(read('apps/book/App.tsx'), /cashBookRepository/);
assert.match(read('apps/payroll/App.tsx'), /payrollRepository/);
assert.match(read('apps/book/cashBookRepository.ts'), /useSnapshotRepository/);
assert.match(read('apps/payroll/payrollRepository.ts'), /useSnapshotRepository/);
assert.match(read('apps/book/cashBookStore.ts'), /Compatibility entry point/);
assert.match(read('apps/payroll/payrollStore.ts'), /Compatibility entry point/);
assert.match(read('apps/truck/components/Pages/CashReportView.tsx'), /DeleteConfirmModal/);
assert.match(read('apps/payroll/components/EmployeeDetailModal.tsx'), /useAsyncAction/);
assert.match(read('apps/payroll/components/EmployeeDetailModal.tsx'), /submitting/);
assert.match(read('apps/book/components/BookDetailView.tsx'), /await onDeleteTransaction/);
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
assert.ok(snapshotSource.indexOf('await offlineStore.write(context.storageKey, value)') < snapshotSource.indexOf('await enqueueMutation('), 'snapshot data must be durable before queueing');
assert.ok(snapshotSource.indexOf('relevant.length > 0') < snapshotSource.indexOf('await offlineStore.write(context.storageKey, remote.payload)'), 'pending local snapshots must be protected from cloud hydration');
const snapshotHookSource = read('lib/repositories/useSnapshotRepository.ts');
assert.ok(snapshotHookSource.indexOf('await persistSnapshot(context, nextValue') < snapshotHookSource.indexOf('setValue(nextValue)'), 'snapshot state must update after durable persistence');
assert.match(read('apps/book/components/AddBookModal.tsx'), /useAsyncAction/);
assert.match(read('apps/book/components/AddBookModal.tsx'), /runAction/);
assert.match(read('apps/book/components/ImportBookModal.tsx'), /useAsyncAction/);
assert.match(read('apps/book/components/ImportBookModal.tsx'), /runAction/);
assert.match(read('apps/book/components/RenameBookModal.tsx'), /runAction/);
assert.match(read('apps/book/components/AddMembersModal.tsx'), /useAsyncAction/);
assert.match(read('apps/payroll/views/PaySalaryView.tsx'), /useAsyncAction/);
assert.match(read('apps/payroll/views/PaySalaryView.tsx'), /runAction/);
assert.match(read('apps/payroll/views/AddEmployeeView.tsx'), /runAction/);
assert.match(read('apps/payroll/views/ManageEmployeesView.tsx'), /runAction/);
assert.match(read('apps/payroll/components/EmployeeDetailModal.tsx'), /runAction/);
assert.match(read('apps/truck/components/AddPartnerModal.tsx'), /useAsyncAction/);
assert.match(read('apps/truck/components/AddPartnerModal.tsx'), /runAction/);
assert.match(read('apps/truck/components/Modals/AddOwnerModal.tsx'), /runAction/);
assert.match(read('apps/truck/components/Modals/AddTruckModal.tsx'), /runAction/);
assert.match(read('apps/truck/components/Pages/AddOwnerPage.tsx'), /runAction/);
assert.match(read('apps/truck/components/Pages/ExpensesPage.tsx'), /runAction/);
assert.match(read('apps/truck/components/Pages/IncomePage.tsx'), /runAction/);
assert.match(read('apps/truck/components/Pages/ManageTrucksPage.tsx'), /runAction/);
assert.match(read('apps/truck/components/Pages/RecordTransactionPage.tsx'), /useTruckTransactionForm/);
assert.match(read('apps/truck/components/Modals/RecordTransactionModal.tsx'), /useTruckTransactionForm/);
assert.match(read('apps/truck/components/useTruckTransactionForm.ts'), /runAction/);
for (const obsolete of [
  'apps/payroll/components/AddEmployeeModal.tsx',
  'apps/payroll/components/AddRaiseModal.tsx',
  'apps/payroll/components/RecordWithdrawalModal.tsx',
  'apps/truck/components/Modals/DistributeProfitModal.tsx',
  'apps/truck/components/Modals/PayOwnerModal.tsx',
  'apps/truck/components/Pages/PayOwnerPage.tsx',
  'apps/truck/components/Pages/DistributeProfitPage.tsx',
]) assert.equal(fs.existsSync(path.join(sourceRoot, obsolete)), false, `${obsolete} must not return as an unguarded duplicate form`);

console.log('Architecture boundary tests passed.');
