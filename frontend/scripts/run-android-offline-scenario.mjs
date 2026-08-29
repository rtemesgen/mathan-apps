import { chromium } from 'playwright';

const [stage, stamp = 'android-offline'] = process.argv.slice(2);
if (!['prepare', 'offline', 'verify'].includes(stage)) throw new Error('Usage: node scripts/run-android-offline-scenario.mjs <prepare|offline|verify> <stamp> [CDP endpoint]');
const endpoint = process.argv[4] || 'http://127.0.0.1:9222';
const names = {
  firstBook: `Dhdh ${stamp}`,
  secondBook: `RemoteSyncTest ${stamp}`,
  employee: `Android employee ${stamp}`,
  payout: `Android payout ${stamp}`,
  truck: `Android truck ${stamp}`,
  unit: `AT-${stamp}`,
  partner: `Android partner ${stamp}`,
  cashIn: `Android cash in ${stamp}`,
  cashOut: `Android cash out ${stamp}`,
  baseline: `Android baseline ${stamp}`,
  tripOne: `Android trip one ${stamp}`,
  tripTwo: `Android trip two ${stamp}`,
  repair: `Android repair ${stamp}`,
  tires: `Android tires ${stamp}`,
};

const browser = await chromium.connectOverCDP(endpoint);
const context = browser.contexts()[0];
context.setDefaultTimeout(15_000);
const page = context.pages().find((candidate) => candidate.url().startsWith('https://localhost')) ?? context.pages()[0];
const updateClose = page.getByRole('button', { name: 'Close update popup' });
if (await updateClose.count() > 0 && await updateClose.isVisible()) await updateClose.click();

async function route(path) {
  await page.evaluate((nextPath) => { history.pushState({}, '', nextPath); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
}

async function truckSection(name) {
  await page.getByRole('button', { name: /TRUCK EQUITY/ }).click();
  await page.getByRole('button', { name }).click();
}

async function payrollSection(name) {
  const direct = page.getByRole('button', { name }).first();
  if (await direct.count() > 0 && await direct.isVisible()) return direct.click();
  await page.getByTitle('Open Navigation Menu').click();
  await page.getByRole('button', { name }).first().click();
}

async function snapshot() {
  return page.evaluate(() => window.__mathanOfflineDiagnostics.snapshot());
}

try {
  if (stage === 'prepare') {
    await route('/book');
    for (const [index, bookName] of [names.firstBook, names.secondBook].entries()) {
      await page.getByRole('button', { name: /Create Book|New Book/ }).first().click();
      await page.getByPlaceholder(/Retail Shop Cashbook/).fill(bookName);
      await page.getByRole('button', { name: 'Save Book' }).click();
      await page.getByRole('heading', { name: bookName }).waitFor();
      if (index === 0) await page.getByRole('button', { name: 'Dashboard' }).click();
    }
    await route('/truck');
    await page.getByText('Loading Truck data…').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Manage Fleet' }).click();
    await page.getByRole('button', { name: '+ Add Truck' }).click();
    await page.getByPlaceholder('e.g. Big Red').fill(names.truck);
    await page.getByPlaceholder('e.g. Unit 101').fill(names.unit);
    await page.getByPlaceholder('e.g. 2024 Kenworth T680').fill('Android physical offline fixture');
    await page.getByRole('button', { name: 'Save Truck' }).click();
    await page.getByText(names.truck, { exact: true }).first().waitFor();
    await truckSection('Income (Trips)');
    await page.locator('input[type=number]').first().fill('20499');
    await page.getByPlaceholder('e.g. Trip from Dallas TX to Atlanta GA').fill(names.baseline);
    await page.getByRole('button', { name: 'Save Income' }).click();
    await page.getByRole('status').filter({ hasText: /Saved|successfully/ }).first().waitFor();
  }

  if (stage === 'offline') {
    await route('/book');
    await page.getByRole('heading', { name: names.firstBook }).click();
    if (await page.getByText(names.cashIn, { exact: true }).count() === 0) {
      await page.getByRole('button', { name: 'Cash In', exact: true }).last().click();
      await page.locator('input[type=number]').fill('111');
      await page.getByPlaceholder('e.g. Counter sale, Payment received').fill(names.cashIn);
      await page.getByRole('button', { name: 'Save Entry', exact: true }).click();
    }
    await page.getByText(names.cashIn, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await page.getByRole('heading', { name: names.secondBook }).click();
    if (await page.getByText(names.cashOut, { exact: true }).count() === 0) {
      await page.getByRole('button', { name: 'Cash Out', exact: true }).last().click();
      await page.locator('input[type=number]').fill('111');
      await page.getByPlaceholder('e.g. Rent, Restock, Vendor payout').fill(names.cashOut);
      await page.getByRole('button', { name: 'Save Entry', exact: true }).click();
    }
    await page.getByText(names.cashOut, { exact: true }).waitFor();

    await route('/payroll');
    await page.getByText('Payroll Tracker').first().waitFor();
    const payrollAlreadySaved = await page.getByText(names.employee, { exact: true }).count() > 0;
    const payoutAlreadySaved = await page.getByText(names.payout, { exact: true }).count() > 0;
    if (payrollAlreadySaved && await page.getByPlaceholder('e.g. Sarah Jenkins').count() > 0) {
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    if (!payrollAlreadySaved) {
      await payrollSection(/ADD NEW EMPLOYEE|Add Employee/i);
      await page.getByPlaceholder('e.g. Sarah Jenkins').fill(names.employee);
      await page.getByPlaceholder('Enter amount').fill('5000');
      await page.getByRole('button', { name: 'Save Employee' }).click();
      await page.getByRole('button', { name: /Pay Salary/i }).click();
    } else if (!payoutAlreadySaved) {
      await page.getByRole('button', { name: 'Pay', exact: true }).first().click();
    }
    if (!payoutAlreadySaved) {
      await page.getByRole('button', { name: /Choose employee|Android employee/ }).first().click();
      await page.getByRole('button', { name: new RegExp(names.employee) }).last().click();
      await page.locator('input[type=number]').first().fill('111');
      await page.getByPlaceholder('e.g. Mid-month salary withdrawal').fill(names.payout);
      await page.getByRole('button', { name: 'Save Payout' }).click();
      await page.getByText('Payout Recorded Successfully!').waitFor();
    }

    await route('/truck');
    await truckSection(/Partners & Loans/);
    if (await page.getByText(names.partner, { exact: true }).count() === 0) {
      await page.getByRole('button', { name: /Add Partner/ }).first().click();
      await page.getByPlaceholder('e.g., Marcus Vance').fill(names.partner);
      await page.getByPlaceholder('20').fill('25');
      await page.getByPlaceholder('5000').fill('0');
      await page.getByRole('button', { name: 'Save Partner' }).click();
    }
    await page.getByText(names.partner, { exact: true }).waitFor();
    for (const description of [names.tripOne, names.tripTwo]) {
      await truckSection('Activity History');
      if (await page.getByText(description, { exact: true }).count() > 0) continue;
      await truckSection('Income (Trips)');
      await page.locator('input[type=number]').first().fill('111');
      await page.getByPlaceholder('e.g. Trip from Dallas TX to Atlanta GA').fill(description);
      await page.getByRole('button', { name: 'Save Income' }).click();
      await truckSection('Activity History');
      await page.getByText(description, { exact: true }).waitFor();
    }
    for (const [amount, category, description] of [['1111', 'Mechanical Repair', names.repair], ['111', 'Tires & Brakes', names.tires]]) {
      await truckSection('Activity History');
      if (await page.getByText(description, { exact: true }).count() > 0) continue;
      await truckSection('Expenses & Payouts');
      await page.locator('input[type=number]').first().fill(amount);
      await page.getByPlaceholder('Select or type category...').fill(category);
      await page.getByPlaceholder('e.g. Oil change and new air filter').fill(description);
      await page.getByRole('button', { name: 'Save Expense' }).click();
      await truckSection('Activity History');
      await page.getByText(description, { exact: true }).waitFor();
    }
  }

  if (stage === 'verify') {
    await route('/book');
    await page.getByRole('heading', { name: names.firstBook }).click();
    await page.getByText(names.cashIn, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await page.getByRole('heading', { name: names.secondBook }).click();
    await page.getByText(names.cashOut, { exact: true }).waitFor();
    await route('/payroll');
    if (await page.getByPlaceholder('e.g. Sarah Jenkins').count() > 0) await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    if (await page.getByText(names.employee, { exact: true }).count() === 0 && await page.getByRole('button', { name: 'Manage Employees', exact: true }).count() > 0) {
      await page.getByRole('button', { name: 'Manage Employees', exact: true }).first().click();
    }
    await page.getByText(names.employee, { exact: true }).first().waitFor();
    await route('/truck');
    await truckSection('Activity History');
    for (const description of [names.baseline, names.tripOne, names.tripTwo, names.repair, names.tires]) await page.getByText(description, { exact: true }).waitFor();
    await truckSection(/Partners & Loans/);
    await page.getByText(names.partner, { exact: true }).waitFor();
    await truckSection(/Dashboard/);
    for (const total of ['$20,721', '$1,222', '$19,499']) await page.getByText(total, { exact: true }).first().waitFor();
  }

  process.stdout.write(`${JSON.stringify({ stage, stamp, diagnostics: await snapshot() }, null, 2)}\n`);
} finally {
  await browser.close();
}
