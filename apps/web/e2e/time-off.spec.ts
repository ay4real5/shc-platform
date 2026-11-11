import { expect, request, test } from '@playwright/test';

const API = (process.env.API_URL ?? 'http://localhost:3001/api/v1') + '/'; // trailing slash so relative paths keep the prefix
const PASSWORD = 'Demo-Password-1!';

/** Log in over the API and return a bearer token (test data setup only — the UI does the real flow). */
async function apiToken(email: string): Promise<string> {
  const api = await request.newContext({ baseURL: API });
  const res = await api.post('auth/login', { data: { email, password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data: { accessToken: string } };
  await api.dispose();
  return body.data.accessToken;
}

/** A weekday range far enough ahead to never collide with demo data or other runs. */
function futureRange(weeksAhead: number): { startDate: string; endDate: string } {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + weeksAhead * 7);
  start.setUTCDate(start.getUTCDate() + ((3 - start.getUTCDay() + 7) % 7)); // Wednesday
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

test('a coordinator sees a care worker’s pending holiday and approves it', async ({ page }) => {
  // A demo care worker asks for a holiday (created over the API; the staff app is the real client for this).
  const { startDate, endDate } = futureRange(12 + Math.floor(Math.random() * 4)); // fresh dates each run — leftovers block overlaps
  const notes = `E2E ${Date.now()}`;
  const token = await apiToken('care.worker@demo.shc.test');
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  const post = await api.post('time-off', { data: { startDate, endDate, type: 'annual_leave', notes } });
  expect(post.status()).toBe(201);
  const requestId = ((await post.json()) as { data: { id: string } }).data.id;

  const me = await api.get('staff/me');
  const staffId = ((await me.json()) as { data: { id: string } }).data.id;

  try {
    // The coordinator opens the care worker's page and approves the pending holiday.
    await page.goto('/login');
    await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible();
    await page.goto(`/staff/${staffId}`);

    const row = page.getByRole('listitem').filter({ hasText: 'Annual leave' }).filter({ has: page.getByRole('button', { name: 'Approve' }) });
    await expect(row.first()).toBeVisible();
    await row.first().getByRole('button', { name: 'Approve' }).click();
    const statusOf = async () => ((await (await api.get('time-off?limit=50')).json()) as { data: { id: string; status: string }[] }).data.find((t) => t.id === requestId)?.status;
    await expect.poll(statusOf).toBe('approved');
  } finally {
    // Leave nothing behind: an approved request the dates haven't reached yet can still be cancelled.
    await api.post(`time-off/${requestId}/cancel`).catch(() => undefined);
    await api.dispose();
  }
});
