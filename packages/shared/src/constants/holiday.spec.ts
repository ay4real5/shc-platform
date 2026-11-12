import { describe, expect, it } from 'vitest';
import { bradfordBand, bradfordFactor, leaveYear, proRataHolidayDays, statutoryHolidayDays, workingDaysBetween } from './holiday.js';

describe('holiday', () => {
  it('is 5.6 weeks, capped at 28 days', () => {
    expect(statutoryHolidayDays(5)).toBe(28);
    expect(statutoryHolidayDays(6)).toBe(28);
    expect(statutoryHolidayDays(3)).toBe(16.8);
    expect(statutoryHolidayDays(2.5)).toBe(14);
  });

  it('finds the leave year', () => {
    expect(leaveYear('2026-11-12', 4)).toEqual({ start: '2026-04-01', end: '2027-03-31' });
    expect(leaveYear('2027-02-01', 4)).toEqual({ start: '2026-04-01', end: '2027-03-31' });
    expect(leaveYear('2026-11-12', 1)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(leaveYear('2028-02-29', 3)).toEqual({ start: '2027-03-01', end: '2028-02-29' });
  });

  it('pro-rates joiners, rounding up to a half day', () => {
    const year = { start: '2026-04-01', end: '2027-03-31' };
    expect(proRataHolidayDays(28, year, null)).toBe(28);
    expect(proRataHolidayDays(28, year, '2025-06-01')).toBe(28);
    expect(proRataHolidayDays(28, year, '2026-10-01')).toBe(14); // 182 of 365 days = 13.96 → 14
    expect(proRataHolidayDays(28, year, '2027-03-31')).toBe(0.5);
    expect(proRataHolidayDays(28, year, '2027-05-01')).toBe(0);
  });

  it('counts working days on their pattern', () => {
    expect(workingDaysBetween('2026-11-09', '2026-11-15')).toBe(5); // Mon–Sun
    expect(workingDaysBetween('2026-11-09', '2026-11-15', [0, 6])).toBe(2); // weekends only
    expect(workingDaysBetween('2026-11-14', '2026-11-14')).toBe(0); // a Saturday
  });

  it('scores absence with the Bradford factor', () => {
    expect(bradfordFactor(1, 10)).toBe(10);
    expect(bradfordFactor(5, 5)).toBe(125);
    expect(bradfordBand(0)).toBe('none');
    expect(bradfordBand(125)).toBe('review');
    expect(bradfordBand(400)).toBe('high');
  });
});
