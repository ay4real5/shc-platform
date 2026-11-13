import { expect, request, test } from '@playwright/test';
import { goTo } from './nav';

const API = (process.env.API_URL ?? 'http://localhost:3001/api/v1') + '/';

/** The demo team leader's staff profile id: a new starter part-way through the Care Certificate (test setup over the API). */
async function teamLeaderStaffId(): Promise<string> {
  const api = await request.newContext({ baseURL: API });
  const login = await api.post('auth/login', { data: { email: 'team.leader@demo.shc.test', password: 'Demo-Password-1!' } });
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const me = await api.get('staff/me', { headers: { Authorization: `Bearer ${token}` } });
  const id = ((await me.json()) as { data: { id: string } }).data.id;
  await api.dispose();
  return id;
}

/** The coordinator checks the training matrix, then signs off a Care Certificate standard (FAKE data). */
test('training matrix and Care Certificate sign-off', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });

  await goTo(page, 'Training matrix');
  await expect(page.getByRole('heading', { name: 'Training matrix' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('columnheader', { name: /Care Certificate/ })).toBeVisible();
  await expect(page.getByText(/^\d+\/16$/).first()).toBeVisible(); // someone part-way through

  await page.goto(`/staff/${await teamLeaderStaffId()}`);
  const panel = page.getByRole('region', { name: 'Care Certificate' });
  const progress = panel.getByText(/(\d+) of 16 standards signed off/);
  await expect(progress).toBeVisible({ timeout: 20_000 });
  const before = Number((await progress.textContent())!.match(/(\d+) of 16/)![1]);
  await panel.getByRole('button', { name: /^Sign off standard/ }).first().click();
  await panel.getByLabel(/How it was assessed/).fill('FAKE: observed on shift');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByText(`${before + 1} of 16 standards signed off`)).toBeVisible({ timeout: 20_000 });
});
