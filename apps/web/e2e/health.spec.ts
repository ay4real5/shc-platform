import { expect, request, test, type Page } from '@playwright/test';
import { answerTwoFactor } from './two-factor';

const API = (process.env.API_URL ?? 'http://localhost:3001/api/v1') + '/';

/** The demo care worker's staff profile id (test setup over the API). */
async function careWorkerStaffId(): Promise<string> {
  const api = await request.newContext({ baseURL: API });
  const login = await api.post('auth/login', { data: { email: 'care.worker@demo.shc.test', password: 'Demo-Password-1!' } });
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const me = await api.get('staff/me', { headers: { Authorization: `Bearer ${token}` } });
  const id = ((await me.json()) as { data: { id: string } }).data.id;
  await api.dispose();
  return id;
}

/** Sign-out is a full page load to /login; wait for it to finish rather than racing it. */
async function signOut(page: Page) {
  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await reloaded;
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
}

async function signIn(page: Page, email: string) {
  if (!page.url().endsWith('/login')) await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (email.startsWith('agency.admin@')) await answerTwoFactor(page);
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });
}

/** A care worker fills in the health questionnaire; a manager reads and reviews it; the office only sees the status (FAKE data). */
test('health questionnaire: filled in by the care worker, reviewed by a manager, private from the office', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, 'care.worker@demo.shc.test');
  await page.getByRole('link', { name: 'Fill it in' }).click();
  await expect(page.getByRole('heading', { name: 'Health questionnaire' })).toBeVisible({ timeout: 20_000 });
  const groups = page.getByRole('group');
  for (let i = 0; i < 5; i++) await groups.nth(i).getByLabel(i === 1 ? 'Yes' : 'No', { exact: true }).check();
  await page.getByLabel('Please tell us a little more').fill('FAKE: a later start on Mondays');
  await page.getByLabel(/My answers are true/).check();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(/waiting for a manager’s review/)).toBeVisible({ timeout: 20_000 });
  await signOut(page);

  // The coordinator sees the status but has no way to read the answers.
  await signIn(page, 'care.coordinator@demo.shc.test');
  const href = `/staff/${await careWorkerStaffId()}#checks`;
  await page.goto(href);
  await expect(page.getByText(/Filled in, waiting for a manager’s review/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'View answers' })).toHaveCount(0);
  await signOut(page);

  // The company admin (health:read) reads and reviews it.
  await signIn(page, 'agency.admin@demo.shc.test');
  await page.goto(href);
  await page.getByRole('button', { name: 'View answers' }).click();
  await expect(page.getByText('FAKE: a later start on Mondays')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Your review').selectOption('fit_with_adjustments');
  await page.getByLabel(/Adjustments agreed/).fill('FAKE: no Monday early shifts');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText(/Reviewed: fit for the role/)).toBeVisible({ timeout: 20_000 });
});
