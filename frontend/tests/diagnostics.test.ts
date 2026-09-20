import assert from 'node:assert/strict';
import { clearDiagnosticEvents, diagnostic, getDiagnosticEvents } from '../src/lib/diagnostics';

clearDiagnosticEvents();
diagnostic('save-committed', {
  adapter: 'sqlite',
  mutationId: 'mutation-1',
  userId: 'user-secret',
  workspaceId: 'workspace-secret',
  amount: 999,
  name: 'Private customer',
  token: 'bearer-secret',
  error: 'database password=secret',
});

const first = getDiagnosticEvents();
assert.equal(first.length, 1);
assert.equal(first[0].event, 'save-committed');
assert.equal(first[0].details.adapter, 'sqlite');
assert.equal(first[0].details.mutationId, 'mutation-1');
assert.equal('userId' in first[0].details, false, 'user identity must not be persisted');
assert.equal('workspaceId' in first[0].details, false, 'workspace identity must not be persisted');
assert.equal('amount' in first[0].details, false, 'financial values must not be persisted');
assert.equal('name' in first[0].details, false, 'business names must not be persisted');
assert.equal('token' in first[0].details, false, 'credentials must not be persisted');
assert.equal('error' in first[0].details, false, 'raw errors must not be persisted');

for (let index = 0; index < 510; index += 1) diagnostic('queue-claimed', { mutationId: `mutation-${index}`, count: index });
const bounded = getDiagnosticEvents();
assert.equal(bounded.length, 500, 'diagnostic history must be bounded');
assert.equal(bounded[0].details.mutationId, 'mutation-10');

clearDiagnosticEvents();
assert.deepEqual(getDiagnosticEvents(), []);
console.log('Diagnostic redaction, bounded retention, and clearing tests passed.');
