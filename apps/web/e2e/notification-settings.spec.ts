import { expect, test } from '@playwright/test';

test('a care worker mutes an alert from the bell’s settings; security alerts stay on', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('team.leader@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible();

  await page.getByRole('button', { name: /Notifications/ }).click();
  await page.getByRole('region', { name: 'Notifications' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible({ timeout: 20_000 });

  const assigned = page.getByLabel('Documents to sign: In the app');
  await expect(assigned).toBeChecked();
  await assigned.uncheck();
  await expect(assigned).not.toBeChecked();
  await expect(page.getByLabel('Security alerts: In the app')).toBeDisabled();

  await page.reload();
  await expect(page.getByLabel('Documents to sign: In the app')).not.toBeChecked({ timeout: 15_000 }); // saved
  await page.getByLabel('Documents to sign: In the app').check(); // leave the demo as it was
  await expect(page.getByLabel('Documents to sign: In the app')).toBeChecked();
});
