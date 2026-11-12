import { describe, expect, it } from 'vitest';
import { expiryAlertText, expiryStage } from './credential-expiry.job.js';

describe('expiryStage', () => {
  const today = '2026-09-28';
  it('alerts inside the credential’s own warning window, then in the last week, then when expired', () => {
    expect(expiryStage('2026-12-31', today, 30)).toBeNull();
    expect(expiryStage('2026-10-28', today, 30)).toBe('due'); // exactly 30 days
    expect(expiryStage('2026-10-29', today, 30)).toBeNull();
    expect(expiryStage('2026-11-27', today, 60)).toBe('due'); // a longer window
    expect(expiryStage('2026-10-05', today, 30)).toBe('week');
    expect(expiryStage(today, today, 30)).toBe('week'); // expires today = still valid today
    expect(expiryStage('2026-09-27', today, 30)).toBe('expired');
  });

  it('never alerts later than a week out, even with a tiny window', () => {
    expect(expiryStage('2026-10-04', today, 0)).toBe('week');
    expect(expiryStage('2026-10-06', today, 0)).toBeNull();
  });
});

describe('expiryAlertText', () => {
  it('reads Right to Work as a follow-up check, told to the person and the office', () => {
    expect(expiryAlertText('right_to_work', 'Right to Work check', 'due', 28, 'FAKE Person')).toMatchObject({
      title: 'Right to Work follow-up check due in 28 days',
      toStaff: true,
    });
    expect(expiryAlertText('right_to_work', 'x', 'expired', -1, 'FAKE Person').title).toBe('Right to Work follow-up check overdue');
  });

  it('keeps DBS neutral and office-only', () => {
    const a = expiryAlertText('dbs_enhanced', 'Enhanced DBS', 'expired', -2, 'FAKE Person');
    expect(a).toMatchObject({ title: 'DBS check needs attention', toStaff: false });
    expect(expiryAlertText('dbs_enhanced', 'Enhanced DBS', 'week', 1, 'FAKE Person').title).toBe('DBS status check due in 1 day');
  });

  it('names training and documents like a driving licence', () => {
    expect(expiryAlertText('moving_handling', 'Moving & handling', 'week', 0, 'FAKE Person').title).toBe('Expires today: Moving & handling');
    expect(expiryAlertText('driving_licence', 'Driving licence', 'expired', -3, 'FAKE Person')).toMatchObject({ title: 'Expired: Driving licence', toStaff: true });
  });
});
