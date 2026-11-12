import { normaliseShareCode, rtwFollowUpDate, SHARE_CODE } from './right-to-work.js';

describe('Right to Work rules', () => {
  it('needs no follow-up for unlimited permission', () => {
    expect(rtwFollowUpDate({ method: 'manual_document', documentType: 'british_irish_passport', permission: 'unlimited', checkedOn: '2026-11-12' })).toBeNull();
    expect(rtwFollowUpDate({ method: 'share_code', permission: 'unlimited', checkedOn: '2026-11-12' })).toBeNull();
  });

  it('follows up when time-limited permission ends', () => {
    expect(rtwFollowUpDate({ method: 'share_code', permission: 'time_limited', permissionExpiresOn: '2028-03-31', checkedOn: '2026-11-12' })).toBe('2028-03-31');
  });

  it('follows up six months after a Positive Verification Notice', () => {
    expect(rtwFollowUpDate({ method: 'manual_document', documentType: 'positive_verification_notice', permission: 'time_limited', checkedOn: '2026-11-12' })).toBe('2027-05-12');
  });

  it('accepts share codes written with spaces', () => {
    expect(SHARE_CODE.test(normaliseShareCode('w2x 4yz 7ab'))).toBe(true);
    expect(SHARE_CODE.test(normaliseShareCode('W2X-4YZ'))).toBe(false);
  });
});
