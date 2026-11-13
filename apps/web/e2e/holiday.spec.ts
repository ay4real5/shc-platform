import { expect, test } from '@playwright/test';
import { goTo, openTab } from './nav';

/** The coordinator checks holiday balances and sickness for the whole company (FAKE demo data). */
test('holiday & absence report', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await goTo(page, 'Holiday & absence');
  await expect(page.getByRole('heading', { name: 'Holiday & absence' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Sort by').selectOption('bradford');
  // The demo data has one person with four sickness spells: top of the list, flagged.
  const first = page.getByRole('row').nth(1);
  await expect(first.getByText(/Worth a review|High/)).toBeVisible();
  await first.getByRole('link').click();
  await openTab(page, 'Holiday & availability');
  await expect(page.getByText(/holiday left/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Sickness, last 52 weeks: 4 spells/)).toBeVisible();
});
