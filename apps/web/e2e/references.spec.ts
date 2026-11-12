import { expect, test } from '@playwright/test';

/** A recruiter asks for a reference; the referee answers through the one-time link; the recruiter verifies it (FAKE data). */
test('reference requested, answered by the referee without signing in, and verified', async ({ page, context }) => {
  test.setTimeout(150_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill('recruiter@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Recruitment' }).click();
  await page.getByRole('link', { name: 'Morgan Fake (FAKE)' }).click(); // at offer stage: every referee may be contacted
  await expect(page.getByRole('heading', { name: 'References' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Send request' }).first().click();
  const link = page.locator('li', { hasText: '/reference#token=' }).first();
  await expect(link).toBeVisible({ timeout: 20_000 }); // no email locally: the office gets the link
  const url = /(http\S+\/reference#token=\S+)/.exec(await link.innerText())![1]!;

  // The referee, in their own browser.
  const referee = await context.browser()!.newPage();
  await referee.goto(url);
  await expect(referee.getByRole('heading', { name: 'Reference request' })).toBeVisible({ timeout: 30_000 });
  await expect(referee.getByText(/Morgan Fake \(FAKE\)/).first()).toBeVisible();
  await referee.getByLabel('Your job title').fill('Care manager');
  await referee.getByLabel('Organisation').fill('Fake Care Ltd');
  await referee.getByLabel('They worked with you from').fill('2022-01-10');
  await referee.getByLabel('Their job title').fill('Care assistant');
  await referee.getByLabel('Reliability and timekeeping').selectOption('5');
  await referee.getByLabel('Attitude and teamwork').selectOption('4');
  await referee.getByLabel('Were they ever subject to disciplinary action?').selectOption('no');
  await referee.getByLabel('Do you know of any safeguarding concerns about them?').selectOption('no');
  await referee.getByLabel('Would you employ them again?').selectOption('yes');
  await referee.getByLabel('Are they suitable to work with vulnerable adults?').selectOption('yes');
  await referee.getByLabel(/The information I have given is true/).check();
  await referee.getByRole('button', { name: 'Send reference' }).click();
  await expect(referee.getByRole('heading', { name: 'Thank you' })).toBeVisible({ timeout: 20_000 });
  await referee.close();

  // Back at the office.
  await page.reload();
  await expect(page.getByText('Reliability / attitude')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('How did you verify it?').fill('Phoned Fake Care Ltd main number');
  await page.getByRole('button', { name: 'Mark verified' }).click();
  await expect(page.getByText(/Verified .*: Phoned Fake Care Ltd main number/)).toBeVisible({ timeout: 20_000 });
});
