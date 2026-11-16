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
  // The floating "Ask Tee" button opens a chat over the current page (no page change), labelled as AI (S-034).
  const url = page.url();
  await page.getByRole('button', { name: 'Ask Tee' }).click();
  const chat = page.getByRole('dialog', { name: 'Ask Tee' });
  await expect(chat.getByText(/AI assistant/).first()).toBeVisible();
  // CI switches AI on with placeholder settings; a laptop without AI settings shows "isn't switched on" instead.
  const question = chat.getByLabel('Your question');
  await expect(question.or(chat.getByText(/isn.t switched on yet/))).toBeVisible({ timeout: 20_000 });
  const aiOn = await question.isVisible();
  expect(page.url()).toBe(url);
  await page.keyboard.press('Escape');
  await expect(chat).toHaveCount(0);
  await goTo(page, 'Ask our policies');
  await expect(page.getByRole('heading', { name: 'Ask our policies' })).toBeVisible({ timeout: 20_000 });
  if (aiOn) await expect(page.getByLabel('Your question')).toBeVisible();

  await page.goto('/documents');
  await expect(page.getByText('Lone working policy (FAKE)')).toBeVisible({ timeout: 20_000 });

  if (aiOn) {
    await page.goto('/recruitment/jobs/new');
    await expect(page.getByRole('button', { name: /Write the advert with Tee/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Write the advert with Tee/ }).click();
    await expect(page.getByText('Type a few rough notes in the box first')).toBeVisible(); // nothing sent with an empty box
  }

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  await signIn(page, 'care.coordinator@demo.shc.test');
  await mainNav(page).getByRole('button', { name: 'Compliance' }).click();
  await expect(mainNav(page).getByRole('link', { name: 'Ask our policies' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ask Tee' })).toHaveCount(0);
  await page.goto('/recruitment/jobs/new');
  await expect(page.getByLabel('Full description')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /with Tee/ })).toHaveCount(0);
});
