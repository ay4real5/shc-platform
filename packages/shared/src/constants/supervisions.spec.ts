import { describe, expect, it } from 'vitest';
import { DEFAULT_SUPERVISION_INTERVALS, supervisionDueOn } from './supervisions.js';

describe('supervisionDueOn', () => {
  const s = DEFAULT_SUPERVISION_INTERVALS.supervision;
  it('is an interval after the last one', () => {
    expect(supervisionDueOn('2026-08-10', '2020-01-01', '2026-11-12', s)).toBe('2026-11-10');
    expect(supervisionDueOn('2026-11-30', null, '2026-11-12', s)).toBe('2027-02-28'); // end of a short month
  });
  it('is soon after starting for new staff, else now', () => {
    expect(supervisionDueOn(null, '2026-11-01', '2026-11-12', s)).toBe('2026-12-01');
    expect(supervisionDueOn(null, '2026-11-01', '2026-11-12', DEFAULT_SUPERVISION_INTERVALS.appraisal)).toBe('2027-11-01');
    expect(supervisionDueOn(null, null, '2026-11-12', s)).toBe('2026-11-12');
  });
});
