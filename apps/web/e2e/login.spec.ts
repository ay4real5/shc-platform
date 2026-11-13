import { expect, test, type Page } from '@playwright/test';
import { answerTwoFactor } from './two-factor';

const PASSWORD = 'Demo-Password-1!';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (email.startsWith('agency.admin@')) await answerTwoFactor(page); // admins must use 2FA (D-045)
}

test('an admin signs in, sees live numbers, navigates and signs out', async ({ page }) => {
  await signIn(page, 'agency.admin@demo.shc.test');
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible();

  const activeStaff = page.getByRole('link', { name: /Active staff/ });
  await expect(activeStaff).toContainText(/\D(1[2-9]|[2-9]\d)$/); // 12 seeded care staff, plus anyone other tests hired

  const nav = page.getByRole('navigation', { name: 'Main' });
  // Straight in the top bar, and the drop-downs an admin gets (S-018).
  for (const item of ['Dashboard', 'Recruitment', 'Staff', 'Messages']) {
    await expect(nav.getByRole('link', { name: item, exact: true })).toBeVisible();
  }
  for (const menu of ['People', 'Compliance', 'Admin']) await expect(nav.getByRole('button', { name: menu })).toBeVisible();
  await nav.getByRole('button', { name: 'Admin' }).click();
  await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();
  await nav.getByRole('button', { name: 'Admin' }).click();
  await nav.getByRole('link', { name: 'Staff', exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);

  const reloaded = page.waitForEvent('load'); // sign-out is a full page load; don't race it
  await page.getByRole('button', { name: 'Sign out' }).click();
  await reloaded;
  await expect(page).toHaveURL(/\/login$/);
  // Signed out means signed out: going back to the app lands on the login page again.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('the session survives a page reload (refresh cookie), without storing tokens in the page', async ({ page }) => {
  await signIn(page, 'care.coordinator@demo.shc.test');
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible();

  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  expect(stored).not.toMatch(/eyJ/); // no JWT anywhere scripts can reach
  expect(stored).not.toContain('alora_rt'); // the refresh cookie is httpOnly
});

test('a care worker only sees what their role allows', async ({ page }) => {
  await signIn(page, 'care.worker@demo.shc.test');
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Messages' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Staff' })).toHaveCount(0);
});

test('a wrong password shows the generic error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('agency.admin@demo.shc.test');
  await page.getByLabel('Password').fill('Wrong-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible();
});
