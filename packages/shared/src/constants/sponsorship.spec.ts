import { addWorkingDays, sponsorReportDueBy, visaState } from './sponsorship.js';

describe('sponsored workers (S-031)', () => {
  it('counts working days, skipping weekends', () => {
    expect(addWorkingDays('2026-11-13', 1)).toBe('2026-11-16'); // Friday → Monday
    expect(sponsorReportDueBy('2026-11-16')).toBe('2026-11-30'); // Monday + 10 working days
    expect(sponsorReportDueBy('2026-11-14')).toBe('2026-11-27'); // Saturday
  });

  it('flags visas ending within 90 days', () => {
    expect(visaState('2026-11-01', '2026-11-14')).toBe('expired');
    expect(visaState('2027-01-20', '2026-11-14')).toBe('expiring_soon');
    expect(visaState('2027-06-01', '2026-11-14')).toBe('valid');
  });
});
