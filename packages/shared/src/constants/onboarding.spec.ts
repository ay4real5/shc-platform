import { onboardingChecklist, type OnboardingFacts } from './onboarding.js';

const all: OnboardingFacts = {
  signedIn: true,
  hasPhone: true,
  hasAddress: true,
  hasHireDate: true,
  hasPayRate: true,
  hasAvailability: true,
  hasServiceArea: true,
  hasPhoneCheckInCode: false,
  validCredentialTypes: ['right_to_work', 'care_certificate'],
  expiredCredentialTypes: [],
};

describe('onboardingChecklist', () => {
  it('is ready when every required item is done; optional items do not count', () => {
    const c = onboardingChecklist(all, ['right_to_work', 'care_certificate']);
    expect(c).toMatchObject({ percent: 100, ready: true });
    expect(c.items.find((i) => i.key === 'phone_check_in')).toMatchObject({ done: false, required: false });
  });

  it('counts missing and expired credentials and explains them', () => {
    const c = onboardingChecklist({ ...all, hasAvailability: false, expiredCredentialTypes: ['dbs_enhanced'] }, ['right_to_work', 'care_certificate', 'dbs_enhanced']);
    // 10 required items, 8 done.
    expect(c).toMatchObject({ percent: 80, ready: false });
    expect(c.items.find((i) => i.key === 'credential:dbs_enhanced')).toMatchObject({ label: 'Enhanced DBS (adult barred list)', done: false, detail: expect.stringContaining('expired') });
    expect(c.items.find((i) => i.key === 'availability')?.detail).toContain('scheduling');
  });
});
