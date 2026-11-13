import { expect, test, type Page } from '@playwright/test';
import { goTo } from './nav';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });
}

/** A care worker reads and signs their supervision record; a coordinator books one for someone overdue (FAKE data). */
test('supervisions: sign a record, then book one', async ({ page }) => {
  test.setTimeout(150_000);
  await signIn(page, 'care.worker@demo.shc.test');
  await expect(page.getByText(/supervision record from .* is ready to read and sign/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: 'Read it' }).click();
  const panel = page.getByRole('region', { name: 'Supervisions and appraisals' });
  await panel.getByRole('button', { name: 'Read and sign' }).click();
  await expect(panel.getByText(/FAKE supervision notes/)).toBeVisible({ timeout: 20_000 });
  await panel.getByLabel('Your comment (optional)').fill('FAKE: happy with this');
  await panel.getByRole('button', { name: 'I have read this record' }).click();
  await expect(panel.getByRole('button', { name: 'Read and sign' })).toHaveCount(0, { timeout: 20_000 });

  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await reloaded;
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });

  await signIn(page, 'care.coordinator@demo.shc.test');
  await goTo(page, 'Supervisions');
  await expect(page.getByRole('heading', { name: 'Supervisions' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Only show people who are overdue').check();
  await expect(page.getByText(/Overdue since/).first()).toBeVisible();
  await page.getByRole('row').nth(1).getByRole('link').click();
  const theirs = page.getByRole('region', { name: 'Supervisions and appraisals' });
  await theirs.getByRole('button', { name: 'Book one' }).click();
  const date = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  await theirs.getByLabel('Type').selectOption('appraisal');
  await theirs.getByLabel('Date', { exact: true }).fill(date);
  await theirs.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(theirs.getByText(/Booked for/).first()).toBeVisible({ timeout: 20_000 });
});
