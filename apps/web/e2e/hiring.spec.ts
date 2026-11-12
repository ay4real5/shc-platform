import { expect, test } from '@playwright/test';

/** A coordinator takes a demo applicant (FAKE data) from applied to hired: interview, score, offer, hire. */
test('a coordinator interviews, offers and hires an applicant, who then has a staff record', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Recruitment' }).click();
  await page.getByRole('link', { name: 'Alex Example (FAKE)' }).click();
  await expect(page.getByRole('heading', { name: 'Next step' })).toBeVisible({ timeout: 20_000 });

  // Book an interview (no email provider locally: it's recorded as not sent).
  await page.getByRole('button', { name: 'Book an interview' }).click();
  await page.getByLabel('Date').fill('2030-01-15');
  await page.getByLabel('Time').fill('10:00');
  await page.getByLabel('Where / link / number').fill('1 Demo Street');
  await page.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page.getByText(/Interview booked for Tuesday 15 January 2030 at 10:00/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Moved to Interview')).toBeVisible();

  // Record how it went.
  await page.getByRole('button', { name: 'Record how it went' }).click();
  await page.getByLabel('Score').selectOption('4');
  await page.getByLabel('Outcome').selectOption('pass');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/Score 4\/5 · Passed/)).toBeVisible({ timeout: 20_000 });

  // Offer, with a note on the timeline.
  await page.getByLabel('Move to').selectOption('offer');
  await page.getByLabel('Note (optional)').fill('Offered 20 hours a week');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText('Moved to Offer: Offered 20 hours a week')).toBeVisible({ timeout: 20_000 });

  // Hire.
  await page.getByRole('button', { name: 'Hire', exact: true }).click();
  await page.getByLabel('Start date').fill('2030-02-01');
  await page.getByRole('button', { name: 'Hire Alex' }).click();
  await expect(page.getByText(/Hired\. Their login and staff record are ready/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: 'Open their staff record' }).click();
  await expect(page.getByRole('heading', { name: /Alex Example \(FAKE\)/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Credentials' })).toBeVisible();
});
