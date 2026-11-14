/**
 * Demo sign-in without the authenticator code (S-024). Only when DEMO_SKIP_TWO_FACTOR=true (refused in production) AND
 * only for the FAKE demo accounts (`@demo.shc.test`; `.test` is a reserved domain no real person can have). Every
 * real account keeps mandatory 2FA (D-045).
 */
export const DEMO_LOGIN_DOMAIN = 'demo.shc.test';

export function skipsTwoFactor(flag: boolean, email: string): boolean {
  return flag && email.trim().toLowerCase().endsWith(`@${DEMO_LOGIN_DOMAIN}`);
}
