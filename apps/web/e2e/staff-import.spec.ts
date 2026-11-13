import { openTab } from './nav';
import { expect, test } from '@playwright/test';
import { answerTwoFactor } from './two-factor';

/** An administrator imports two FAKE staff from a spreadsheet: preview first (one bad row), then import. */
test('an admin previews and imports staff from a spreadsheet', async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  await page.goto('/login');
  await page.getByLabel('Email').fill('agency.admin@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await answerTwoFactor(page);
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await page.goto('/staff');
  await page.getByRole('link', { name: 'Import from spreadsheet' }).click();
  await expect(page.getByRole('heading', { name: 'Import staff' })).toBeVisible({ timeout: 20_000 });

  const csv = [
    'First name,Last name,Email,Job role,Start date,Right to Work checked on,Right to Work type,Safeguarding date,Safeguarding expires',
    `Imported,Carer,imported.carer.${stamp}@demo.shc.test,Care worker,01/02/2023,20/01/2023,No time limit,01/02/2023,01/02/2099`,
    `Imported,Senior,imported.senior.${stamp}@demo.shc.test,Senior carer,01/02/2023,,,,`,
    `Imported,Wrong,bad-email,Chef,,,,,`,
  ].join('\r\n');
  await page.getByLabel('Spreadsheet (CSV)').setInputFiles({ name: 'staff.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('to fix')).toBeVisible();
  await expect(page.getByText('Job role "Chef" isn\'t one SHC knows (see the guide)')).toBeVisible();
  await expect(page.getByText('Right to Work (no time limit) · 1 training/other check')).toBeVisible();

  await page.getByRole('button', { name: 'Import 2 people' }).click();
  await expect(page.getByRole('heading', { name: '2 people imported' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Imported Carer' }).click();
  await openTab(page, 'Checks & training');
  await expect(page.getByText('Checked before SHC (imported from spreadsheet)')).toBeVisible({ timeout: 20_000 });
});
