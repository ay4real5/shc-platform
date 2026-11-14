import { openTab } from './nav';
import { expect, test } from '@playwright/test';

/** S5-01 (S-027): a coordinator checks a FAKE mental health nurse on the NMC register and records it. */
test('a coordinator records an NMC register check for a nurse', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await page.goto('/staff');
  await page.getByRole('link', { name: 'Hartley, Ben' }).click();
  await expect(page.getByText('Mental health nurse (RMN)').first()).toBeVisible({ timeout: 20_000 });
  await openTab(page, 'Checks & training');
  const panel = page.getByRole('heading', { name: 'Professional registration (NMC)' }).locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
  await expect(panel.getByText(/Not checked on the NMC register yet/)).toBeVisible({ timeout: 20_000 });

  await panel.getByRole('button', { name: 'Record a new check' }).click();
  await expect(panel.getByRole('link', { name: /Nursing and Midwifery Council register/ })).toHaveAttribute('href', /nmc\.org\.uk/);
  await panel.getByLabel('NMC PIN').fill('123');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByText(/NMC PIN should look like 12A3456E/)).toBeVisible();

  await panel.getByLabel('NMC PIN').fill('00z 0002e');
  const nextYear = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 31)).toISOString().slice(0, 10);
  await panel.getByLabel('Renewal date').fill(nextYear);
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByText(/Checked on the NMC register/)).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText('00Z0002E')).toBeVisible();
});
