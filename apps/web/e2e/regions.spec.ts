import { expect, test } from '@playwright/test';

/** S5-02 (S-028): the demo company works in three FAKE regions; choosing one narrows the staff lists. */
test('a coordinator narrows the staff list and onboarding to one region', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await page.goto('/staff');
  await expect(page.getByRole('link', { name: 'Hartley, Ben' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Region').selectOption('Bristol');
  await expect(page.getByRole('link', { name: 'Okafor, Ada' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: 'Hartley, Ben' })).toHaveCount(0); // Teesside

  // The choice carries over to the other staff lists.
  await page.goto('/staff/onboarding');
  await expect(page.getByLabel('Region')).toHaveValue('Bristol', { timeout: 20_000 });
  await expect(page.getByText('Ben Hartley')).toHaveCount(0);
  await page.getByLabel('Region').selectOption('');
  await expect(page.getByText('Ben Hartley').first()).toBeVisible({ timeout: 20_000 });
});
