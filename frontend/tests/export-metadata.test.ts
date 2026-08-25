import assert from 'node:assert/strict';
import { buildExportMetadataRows } from '../src/lib/exports/exportMetadata';
import { formatExportDate } from '../src/lib/exports/dateFormatting';

const rows = buildExportMetadataRows({
  companyName: 'Guest Company',
  entityName: 'Truck A',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
});
assert.deepEqual(rows.map((row) => row[0]), ['Company', 'Entity', 'From', 'To']);
assert.equal(rows[0][1], 'Guest Company');
assert.equal(rows[2][1], '01/08/26');
assert.equal(formatExportDate('2026-08-25T16:34'), '25/08/26');
assert.equal(formatExportDate('2026-08-25'), '25/08/26');
console.log('Export metadata ordering tests passed.');
