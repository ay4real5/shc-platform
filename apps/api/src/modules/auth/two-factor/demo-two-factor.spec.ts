import { skipsTwoFactor } from './demo-two-factor.js';

describe('skipsTwoFactor (S-024)', () => {
  it('skips only for demo accounts, and only when switched on', () => {
    expect(skipsTwoFactor(true, 'agency.admin@demo.shc.test')).toBe(true);
    expect(skipsTwoFactor(true, 'Agency.Admin@DEMO.SHC.TEST')).toBe(true);
    expect(skipsTwoFactor(false, 'agency.admin@demo.shc.test')).toBe(false);
    expect(skipsTwoFactor(true, 'manager@realcare.co.uk')).toBe(false);
    expect(skipsTwoFactor(true, 'someone@demo.shc.test.evil.com')).toBe(false);
    expect(skipsTwoFactor(true, 'someone@notdemo.shc.test')).toBe(false);
  });
});
