import { expect, test } from '@playwright/test';

test('every page carries a nonce-based CSP, and the app runs without violating it', async ({ page }) => {
  test.setTimeout(150_000);
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(m.text())) violations.push(m.text());
  });

  const response = await page.goto('/login');
  const csp = response!.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  // A different nonce on every request.
  const again = (await page.request.get('/login')).headers()['content-security-policy'];
  expect(again).not.toBe(csp);

  await page.getByLabel('Email').fill('care.coordinator@demo.shc.test');
  await page.getByLabel('Password').fill('Demo-Password-1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome|Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 20_000 });
  const nav = page.getByRole('navigation', { name: 'Main' });

  await nav.getByRole('link', { name: 'Recruitment' }).click();
  await expect(page.getByRole('heading', { name: 'Job adverts' })).toBeVisible({ timeout: 30_000 });
  await nav.getByRole('link', { name: 'Staff', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Staff', exact: true })).toBeVisible({ timeout: 20_000 }); // not the previous page's table
  await expect(page.getByRole('columnheader', { name: 'Job role' })).toBeVisible();
  await page.getByRole('row').nth(1).getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Credentials' })).toBeVisible({ timeout: 20_000 });
  await nav.getByRole('link', { name: 'Messages' }).click();
  await expect(page.getByRole('heading', { name: 'Messages' }).first()).toBeVisible({ timeout: 20_000 });

  // The public careers pages may be framed by the company's own site (CAREERS_FRAME_ANCESTORS); nothing else may.
  const careers = (await page.request.get('/careers/demo-care')).headers();
  expect(careers['content-security-policy']).toMatch(/frame-ancestors 'self'/);
  expect(careers['x-frame-options']).toBeUndefined();

  expect(violations).toEqual([]);
});
