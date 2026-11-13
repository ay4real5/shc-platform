import { openTab } from './nav';
import { expect, test } from '@playwright/test';

const ukDate = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'UTC', dateStyle: 'medium' });
const now = new Date();
const today = now.toISOString().slice(0, 10);
const inAYear = ukDate(new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate())));

/** A coordinator records a clear DBS certificate on the Update Service, then a status check (FAKE data). */
test('a coordinator records a DBS certificate and an Update Service status check', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Staff', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Job role' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('row').nth(2).getByRole('link').first().click();
  await openTab(page, 'Checks & training');
  await expect(page.getByRole('heading', { name: 'DBS', exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Add a certificate' }).click();
  await page.getByLabel('Certificate number').fill('0011 2233 4455');
  await page.getByLabel('Issue date').first().fill(today); // the DBS form sits above the credentials form
  await page.getByLabel(/on the DBS Update Service/).check();
  await page.getByRole('button', { name: 'Save certificate' }).click();
  await expect(page.getByText(`Update Service status check due ${inAYear}.`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('001122334455')).toBeVisible();

  await page.getByRole('button', { name: 'Record a status check' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(`Last status check ${ukDate(now)}: no change.`)).toBeVisible({ timeout: 20_000 });
});
