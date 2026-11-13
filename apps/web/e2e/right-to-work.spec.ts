import { openTab } from './nav';
import { expect, test } from '@playwright/test';

/** A coordinator records a share code Right to Work check, with evidence, on a demo care worker (FAKE data). */
test('a coordinator records a time-limited Right to Work check with evidence; the follow-up date shows', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Staff', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Job role' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('row').nth(1).getByRole('link').first().click();
  await openTab(page, 'Checks & training');
  await expect(page.getByRole('heading', { name: 'Right to Work' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Record a check' }).click();
  await page.getByLabel('Share code').fill('W2X 4YZ 7AB');
  await page.getByLabel('Permission shown').selectOption('time_limited');
  await page.getByLabel('Permission ends on').fill('2029-03-31');
  await page.getByLabel('Work restrictions (if any)').fill('20 hours a week in term time');
  await page.getByLabel(/Evidence/).setInputFiles({ name: 'rtw-check.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% FAKE right to work check\n%%EOF\n') });
  await page.getByRole('button', { name: 'Save check' }).click();

  await expect(page.getByText('Follow-up check due 31 Mar 2029.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('(share code …7AB)')).toBeVisible();
  await expect(page.getByText('Restrictions: 20 hours a week in term time')).toBeVisible();
});
