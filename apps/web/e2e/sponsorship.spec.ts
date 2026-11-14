import { openTab } from './nav';
import { expect, test } from '@playwright/test';

/** S5-04 (S-031): the FAKE sponsored nurse's visa is ending and a change is late to report; the coordinator reports it. */
test('a coordinator sees sponsored workers and marks a change reported', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: /sponsored-worker change to report to the Home Office/ })).toBeVisible({ timeout: 20_000 });

  await page.goto('/compliance/sponsorship');
  const row = page.getByRole('row').filter({ hasText: 'Ben Hartley' });
  await expect(row).toContainText('Health and Care Worker visa', { timeout: 20_000 });
  await expect(row).toContainText('C0FAKE0001');
  await expect(row).toContainText(/Working hours changed: late, was due/);

  await row.getByRole('link', { name: 'Ben Hartley' }).click();
  await openTab(page, 'Checks & training');
  const box = page.getByRole('heading', { name: 'Visa & sponsorship' }).locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
  await expect(box.getByText('We sponsor them')).toBeVisible({ timeout: 20_000 });
  await expect(box.getByText(/Ends within 90 days/)).toBeVisible();
  await expect(box.getByText(/Past the deadline/)).toBeVisible();
  await box.getByRole('button', { name: 'Reported today' }).click();
  await expect(box.getByText(/^Reported /)).toBeVisible({ timeout: 20_000 });
});
