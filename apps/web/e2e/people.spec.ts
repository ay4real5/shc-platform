import { expect, test, type Page } from '@playwright/test';
import { answerTwoFactor } from './two-factor';

const PASSWORD = 'Demo-Password-1!';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (email.startsWith('agency.admin@')) await answerTwoFactor(page); // admins must use 2FA (D-045)
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible();
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test('an admin adds a user, turns them into staff, and manages credentials, availability and time off', async ({ page }) => {
  await signIn(page, 'agency.admin@demo.shc.test');
  const stamp = Date.now();

  // 1. Create the login.
  await nav(page).getByRole('link', { name: 'Users' }).click();
  await page.getByRole('link', { name: 'Add user' }).click();
  await page.getByLabel('First name').fill('Robin');
  await page.getByLabel('Last name').fill(`Newhire${stamp}`);
  await page.getByLabel('Email').fill(`robin.${stamp}@demo.shc.test`);
  await page.getByLabel('Starting password').fill('Starting-Pass-1!');
  await page.getByLabel(/^Care worker/).check();
  await page.getByRole('button', { name: 'Add user' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Robin Newhire${stamp}`) })).toBeVisible();

  // 2. Give them a staff profile.
  await nav(page).getByRole('link', { name: 'Staff' }).click();
  await page.getByRole('link', { name: 'Add staff profile' }).click();
  const person = page.getByLabel('Person');
  const value = await person.locator('option', { hasText: `Newhire${stamp}` }).getAttribute('value');
  await person.selectOption(value!);
  await page.getByLabel('Job role').selectOption('care_worker');
  await page.getByLabel('Hourly rate (£)').fill('12.60');
  await page.getByRole('button', { name: 'Create staff profile' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Robin Newhire${stamp}`) })).toBeVisible();
  await expect(page.getByText('£12.60')).toBeVisible(); // admins hold pay:read

  // 3. Credentials with computed state.
  await page.getByLabel('Credential type').fill('first_aid');
  await page.getByLabel('Credential name').fill('First aid');
  await page.getByLabel('Expiry date').fill('2020-01-01');
  await page.getByRole('button', { name: 'Add credential' }).click();
  await expect(page.getByText('expired', { exact: true })).toBeVisible();

  // 4. Availability: add a Monday slot and save; it is still there after reloading.
  await expect(page.getByText('No availability set')).toBeVisible();
  await page.getByRole('button', { name: 'Add time slot' }).click();
  await page.getByRole('button', { name: 'Save availability' }).click();
  await page.reload();
  await expect(page.getByText('No availability set')).toHaveCount(0);
  await expect(page.getByLabel('Day', { exact: true })).toHaveValue('1');

  // 5. Time off: the admin records it for them, approved at once (S3-03), and it comes off their holiday balance.
  await expect(page.getByText(/days? holiday left/)).toBeVisible();
  await page.getByLabel('From', { exact: true }).last().fill('2027-03-01');
  await page.getByLabel('To', { exact: true }).last().fill('2027-03-03');
  await page.getByRole('button', { name: 'Record time off (approved)' }).click();
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  await expect(page.getByText(/working days?$/).first()).toBeVisible(); // counted on their availability pattern
});

test('team leaders see their people but never pay, and cannot open Users', async ({ page }) => {
  await signIn(page, 'team.leader@demo.shc.test');
  await expect(nav(page).getByRole('link', { name: 'Users' })).toHaveCount(0);
  await nav(page).getByRole('link', { name: 'Staff' }).click();
  await page.getByRole('row').nth(1).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Credentials' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pay' })).toHaveCount(0);
});

test('the checks page lists the expired DBS check from the demo data', async ({ page }) => {
  await signIn(page, 'care.coordinator@demo.shc.test');
  await page.getByRole('link', { name: /Checks expired or expiring/ }).click();
  await expect(page.getByRole('heading', { name: 'Credentials needing attention' })).toBeVisible();
  await expect(page.getByText('expired', { exact: true }).first()).toBeVisible();
});
