import assert from 'node:assert/strict';
import { parseBookImport, rowsToBooks } from '../src/apps/book/utils/importers';
import { saveImportedBooks } from '../src/apps/book/cashBookRepository';

const ownTransactions = rowsToBooks([
  { Date: '25/08/26', Book: 'Shop', Type: 'Cash In', Amount: '100.00', Category: 'Sales', Remark: 'Sale', 'Payment Mode': 'Cash' },
  { Date: '26/08/26', Book: 'Shop', Type: 'Cash Out', Amount: '25.00', Category: 'Fuel', Remark: 'Fuel', 'Payment Mode': 'Cash' },
], 'import.csv');
assert.equal(ownTransactions.length, 1);
assert.equal(ownTransactions[0].book.name, 'Shop');
assert.equal(ownTransactions[0].transactions.length, 2);
assert.equal(ownTransactions[0].transactions[1].type, 'out');

const ownStatement = rowsToBooks([
  { Date: 'Opening balance', Remark: '', Category: '', Mode: '', 'Cash in': '', 'Cash out': '', Balance: '500.00' },
  { Date: '25/08/26', Remark: 'Sale', Category: 'Sales', Mode: 'Cash', 'Cash in': '100.00', 'Cash out': '', Balance: '600.00' },
], 'Shop Statement');
assert.equal(ownStatement[0].book.openingBalance, 500);
assert.equal(ownStatement[0].transactions[0].type, 'in');

const payroll = rowsToBooks([{ Date: '25/08/26', Name: 'Amina', Entry: 'Paid', Ref: 'PAY-1', Notes: 'Salary', Amount: '200.00' }], 'Payroll Export');
assert.equal(payroll[0].book.name, 'Payroll Export');
assert.equal(payroll[0].transactions[0].type, 'out');
assert.match(payroll[0].transactions[0].remark, /Amina/);

const truck = rowsToBooks([{ Date: '25/08/26', Truck: 'Truck A', Owner: 'John', Type: 'INCOME', Category: 'Trip', Description: 'Haul', Ref: 'TRIP-1', Amount: '500.00' }], 'Truck Export');
assert.equal(truck[0].book.name, 'Truck A');
assert.equal(truck[0].transactions[0].type, 'in');
assert.match(truck[0].transactions[0].remark, /John/);

const summary = rowsToBooks([{ Book: 'Shop', Entries: 2, 'Cash in': '100.00', 'Cash out': '25.00', Balance: '175.00' }], 'Summary');
assert.equal(summary[0].book.openingBalance, 100);
assert.equal(summary[0].transactions.length, 0);

const ownExportWithMetadata = rowsToBooks([
  { Book: 'Shop', 'Opening Balance': '500.00' },
  { Date: '25/08/26', Book: 'Shop', Type: 'Cash In', Amount: '100.00', Remark: 'Sale' },
], 'cash-book.csv');
assert.equal(ownExportWithMetadata[0].book.openingBalance, 500);
assert.equal(ownExportWithMetadata[0].transactions.length, 1);

const parsedCsv = await parseBookImport(new File([
  '"Field","Value"\n"Company","Demo Co"\n"Entity","Shop"\n"From","01/01/26"\n"To","31/01/26"\n"Opening balance","500.00"\n\n"Date","Remark","Category","Mode","Cash in","Cash out","Balance"\n"Opening balance","","","","","","500.00"\n"25/08/26","Sale","Sales","Cash","100.00","","600.00"',
], 'cash-book.csv', { type: 'text/csv' }));
assert.equal(parsedCsv[0].book.name, 'Shop');
assert.equal(parsedCsv[0].book.openingBalance, 500);
assert.equal(parsedCsv[0].transactions.length, 1);

const parsedLegacyCsv = await parseBookImport(new File([
  '"Field","Value"\n"Opening balance","900.00"\n\n"Date","Remark","Category","Mode","Cash in","Cash out","Balance"\n"25/08/26","Sale","Sales","Cash","100.00","","1000.00"',
], 'legacy-statement.csv', { type: 'text/csv' }));
assert.equal(parsedLegacyCsv[0].book.openingBalance, 900);
assert.equal(parsedLegacyCsv[0].transactions.length, 1);

const pdfShapedOpening = rowsToBooks([
  { Book: 'Cash Book PDF', Date: 'Opening balance', Balance: '750.00' },
  { Book: 'Cash Book PDF', Date: 'Aug 24, 2026 @ 09:00 PM', Type: 'Cash In', Amount: '+76,686', Remark: 'Sale' },
  { Book: 'Cash Book PDF', Date: 'Aug 25, 2026 @ 09:00 PM', Type: 'Cash Out', Amount: '-123', Remark: 'Fuel' },
], 'Cash Book PDF');
assert.equal(pdfShapedOpening[0].book.openingBalance, 750);
assert.equal(pdfShapedOpening[0].transactions.length, 2);

const legacyCashBookCsv = rowsToBooks([
  { Date: '25 August 2026', Time: '4:11 pm', Remark: 'Ffff', 'Entry by': 'Dream', Category: 'Sale', Mode: 'Cash', 'Cash In': '76686', 'Cash Out': '', Balance: '95805.9' },
  { Date: '25 August 2026', Time: '4:14 pm', Remark: 'Shsg', 'Entry by': 'Dream', Category: 'Sale', Mode: 'Cash', 'Cash In': '', 'Cash Out': '123', Balance: '95682.9' },
], 'Business Book');
assert.ok(Math.abs((legacyCashBookCsv[0].book.openingBalance ?? 0) - 19119.9) < 0.001);
assert.equal(legacyCashBookCsv[0].transactions.length, 2);
assert.equal(legacyCashBookCsv[0].transactions[0].type, 'in');
assert.equal(legacyCashBookCsv[0].transactions[1].type, 'out');

let persistedBooks: Array<{ openingBalance?: number }> = [];
await saveImportedBooks(parsedCsv, [], [], async (next) => { persistedBooks = next; return 'saved locally'; }, async () => 'saved locally');
assert.equal(persistedBooks[0].openingBalance, 500);

console.log('Cash Book import compatibility tests passed.');
