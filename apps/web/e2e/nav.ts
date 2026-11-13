import type { Page } from '@playwright/test';

/** Which top-bar drop-down holds each link (S-018); links not listed sit straight in the bar. */
const MENU_OF: Record<string, string> = {
  Onboarding: 'People',
  'Checks & expiries': 'People',
  Supervisions: 'People',
  'Holiday & absence': 'People',
  'Training matrix': 'People',
  Academy: 'People',
  Documents: 'Compliance',
  Compliance: 'Compliance',
  'CQC inspection pack': 'Compliance',
  'Audit log': 'Compliance',
  Users: 'Admin',
  Roles: 'Admin',
  'Company settings': 'Admin',
};

export const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

/** Clicks a link in the main navigation, opening its drop-down first when it lives in one. */
export async function goTo(page: Page, name: string): Promise<void> {
  const nav = mainNav(page);
  const menu = MENU_OF[name];
  if (menu) await nav.getByRole('button', { name: menu }).click();
  await nav.getByRole('link', { name, exact: true }).click();
}

/** Opens a tab on a staff member's record (S4-03: the record is split into tabs). */
export async function openTab(page: Page, name: 'Overview' | 'Checks & training' | 'Supervision' | 'Documents' | 'Holiday & availability'): Promise<void> {
  await page.getByRole('tab', { name }).click();
}
