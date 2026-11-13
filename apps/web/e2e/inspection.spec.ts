import { expect, test } from '@playwright/test';
import { goTo } from './nav';

/** A coordinator checks the team's staff files and makes a CQC inspection pack for two people (FAKE demo data). */
test('a coordinator makes a CQC inspection pack', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await goTo(page, 'CQC inspection pack');
  await expect(page.getByRole('heading', { name: 'CQC inspection pack' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Files in order')).toBeVisible({ timeout: 20_000 });

  const boxes = page.getByRole('checkbox', { name: /^Include / });
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole('link', { name: 'Make pack for 2 people' }).click();

  await expect(page.getByText('Staff files · CQC Regulation 19')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(2);
  await expect(page.getByText('Enhanced DBS check').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print / save as PDF' })).toBeEnabled();
});
