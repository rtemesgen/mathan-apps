import assert from 'node:assert/strict';
import { createCsv, csvEscape } from '../src/lib/fileExport';

assert.equal(csvEscape('Fuel, "Diesel"'), '"Fuel, ""Diesel"""');
assert.equal(createCsv(['Name', 'Note'], [['Truck 1', 'line one\nline two']]), '"Name","Note"\n"Truck 1","line one\nline two"');
console.log('File export tests passed.');
