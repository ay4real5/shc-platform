import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, email: string) {
  if (!page.url().endsWith('/login')) await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });
}

/** Sign-out is a full page load to /login; wait for it rather than racing it. */
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
}

/** A coordinator uploads a policy and sends it to everyone; a care worker reads and signs it (FAKE data). */
test('a policy is sent to everyone, a care worker signs it from the home page, and the office sees who signed', async ({ page }) => {
  test.setTimeout(150_000);
  const title = `Safeguarding policy ${Date.now()}`;
  await signIn(page, 'care.coordinator@demo.shc.test');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Documents' }).click();
  await expect(page.getByRole('heading', { name: 'Company documents' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('File (PDF)').setInputFiles({ name: 'policy.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% FAKE policy\n%%EOF\n') });
  await page.getByRole('button', { name: 'Upload' }).click();
  const row = page.getByRole('listitem').filter({ hasText: title });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: 'Send to sign' }).click();
  await row.getByLabel(/Everyone active/).check();
  await row.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(row.getByText(/^Sent to \d+\./)).toBeVisible({ timeout: 20_000 });

  // The care worker signs.
  await signOut(page);
  await signIn(page, 'care.worker@demo.shc.test');
  const card = page.getByRole('listitem').filter({ hasText: title });
  await card.getByRole('link', { name: 'Read and sign' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(/I have read/).check();
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.getByText(/^Signed/)).toBeVisible({ timeout: 20_000 });

  // The office sees it.
  await signOut(page);
  await signIn(page, 'care.coordinator@demo.shc.test');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Documents' }).click();
  const again = page.getByRole('listitem').filter({ hasText: title });
  await again.getByRole('button', { name: 'Who has signed' }).click();
  await expect(again.getByText(/^1 of \d+ signed\./)).toBeVisible({ timeout: 20_000 });
});
