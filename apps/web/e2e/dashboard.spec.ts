import { expect, test } from '@playwright/test';

/** The coordinator's home page: who can't work and why, what's expiring, what's waiting, hiring (FAKE demo data). */
test('manager dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await expect(page.getByRole('heading', { name: 'Expiring in the next 30 days' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Applicants by stage' })).toBeVisible();
  await expect(page.getByText(/expired/).first()).toBeVisible(); // the demo data has an expired DBS
  await expect(page.getByText(/overdue a supervision/)).toBeVisible();
  if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT, fullPage: true });

  // Straight from an alert to the person's record.
  await page.getByRole('heading', { name: 'Expiring in the next 30 days' }).locator('xpath=../..').getByRole('link').nth(1).click();
  await expect(page).toHaveURL(/\/staff\/[0-9a-f-]{36}$/);
});
