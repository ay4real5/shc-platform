import { expect, test, type Page } from '@playwright/test';
import { goTo, mainNav } from './nav';
import { answerTwoFactor } from './two-factor';

/**
 * AI help (S-022) is for admins and managers only. These checks don't call the AI (no cost): they check who sees it and
 * that the demo company's FAKE policies are there to answer from.
 */
async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (email.startsWith('agency.admin@')) await answerTwoFactor(page);
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });
}

test('an admin has "Ask our policies" and AI drafting; a coordinator has neither', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, 'agency.admin@demo.shc.test');
  await goTo(page, 'Ask our policies');
  await expect(page.getByRole('heading', { name: 'Ask our policies' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Your question')).toBeVisible();

  await page.goto('/documents');
  await expect(page.getByText('Lone working policy (FAKE)')).toBeVisible({ timeout: 20_000 });

  await page.goto('/recruitment/jobs/new');
  await expect(page.getByRole('button', { name: /Write the advert with AI/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Write the advert with AI/ }).click();
  await expect(page.getByText('Type a few rough notes in the box first')).toBeVisible(); // nothing sent with an empty box

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  await signIn(page, 'care.coordinator@demo.shc.test');
  await mainNav(page).getByRole('button', { name: 'Compliance' }).click();
  await expect(mainNav(page).getByRole('link', { name: 'Ask our policies' })).toHaveCount(0);
  await page.goto('/recruitment/jobs/new');
  await expect(page.getByLabel('Full description')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /with AI/ })).toHaveCount(0);
});
