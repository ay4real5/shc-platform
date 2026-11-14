import { expect, test } from '@playwright/test';
import { answerTwoFactor } from './two-factor';

// A 1×1 PNG (FAKE logo).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** S5-05 (S-032): an admin adds the company logo; it shows on the careers page; the "Apply online" code is ready to copy. */
test('an admin adds a logo for the careers page and gets the Apply online button', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill('agency.admin@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await answerTwoFactor(page);
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await page.goto('/settings/agency');
  await expect(page.getByRole('heading', { name: 'Careers page' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Upload your logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Save logo' }).click();
  await expect(page.getByRole('img', { name: /logo$/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('code')).toContainText('Apply online');
  const careers = (await page.locator('code').textContent())!.match(/href="([^"]+)"/)![1]!;

  await page.goto(careers);
  await expect(page.locator('header img')).toHaveAttribute('src', /^data:image\/png;base64,/, { timeout: 20_000 });
});
