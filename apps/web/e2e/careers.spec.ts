import { expect, test } from '@playwright/test';

/** The public careers page of the demo company (FAKE data, seeded by global-setup) and the application form. */
test('someone finds a job on the careers page, explains a gap and applies; the recruiter sees it', async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  await page.goto('/careers/demo-care');
  await expect(page.getByRole('heading', { name: 'Work with us' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Demo Care Services (FAKE DATA)')).toBeVisible();
  await expect(page.getByText('Team Leader')).toHaveCount(0); // a draft advert never shows
  await page.getByRole('link', { name: 'Care Worker', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Apply for this job' })).toBeVisible({ timeout: 30_000 });

  await page.getByLabel('First name').fill('Robin');
  await page.getByLabel('Last name').fill(`Browser${stamp}`);
  await page.getByLabel('Email', { exact: true }).first().fill(`robin.${stamp}@example.test`);
  await page.getByLabel('Mobile number').fill('07700 900123');
  await page.getByLabel('Postcode').fill('M14 6EF');
  await page.getByLabel('Your right to work in the UK').selectOption('british_or_irish');

  // Current job since 2024, previous job ended in 2022: an 18-month gap to explain.
  await page.getByLabel('Employer').first().fill('Fake Care Ltd');
  await page.getByLabel('Job title').first().fill('Care assistant');
  await page.getByLabel('Started').first().fill('2024-01-08');
  await page.getByRole('button', { name: 'Add a job' }).click();
  await page.getByLabel('Employer').nth(1).fill('Fake Shop');
  await page.getByLabel('Job title').nth(1).fill('Sales assistant');
  await page.getByLabel('Started').nth(1).fill('2019-03-01');
  await page.getByLabel('Left').fill('2022-06-30');
  await expect(page.getByText('Please explain this gap')).toBeVisible();
  await page.getByRole('button', { name: 'Explain this gap' }).click();
  await page.getByLabel('What were you doing?').fill('Caring for a family member');
  await expect(page.getByText('Please explain this gap')).toHaveCount(0);

  for (const [i, name] of ['Ref One', 'Ref Two'].entries()) {
    const referee = page.getByRole('group', { name: `Referee ${i + 1}` });
    await referee.getByLabel('Name').fill(name);
    await referee.getByLabel('How do they know you?').fill('My manager');
    await referee.getByLabel('Email').fill(`ref${i}.${stamp}@example.test`);
  }
  await page.getByLabel(/The information I have given is true/).check();
  await page.getByRole('button', { name: 'Send application' }).click();
  await expect(page.getByText('Thank you, your application has been sent')).toBeVisible({ timeout: 20_000 });

  // The recruiter finds it.
  await page.goto('/login');
  await page.getByLabel('Email').fill('recruiter@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Recruitment' }).click();
  await page.getByLabel('Search').fill(`Browser${stamp}`);
  await page.getByRole('link', { name: `Robin Browser${stamp}` }).click();
  await expect(page.getByText('Caring for a family member')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Sales assistant at Fake Shop')).toBeVisible();
});
