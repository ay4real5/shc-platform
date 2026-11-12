import { onboardingChecklist, type OnboardingFacts } from './onboarding.js';

const all: OnboardingFacts = {
  signedIn: true,
  hasPhone: true,
  hasAddress: true,
  hasHireDate: true,
  hasPayRate: true,
  hasAvailability: true,
  hasEmergencyContact: false,
  validCredentialTypes: ['right_to_work', 'care_certificate'],
  expiredCredentialTypes: [],
};

describe('onboardingChecklist', () => {
  it('is ready when every required item is done; optional items do not count', () => {
    const c = onboardingChecklist(all, ['right_to_work', 'care_certificate']);
    expect(c).toMatchObject({ percent: 100, ready: true });
    expect(c.items.find((i) => i.key === 'emergency_contact')).toMatchObject({ done: false, required: false });
  });

  it('counts missing and expired credentials and explains them', () => {
    const c = onboardingChecklist({ ...all, hasAvailability: false, expiredCredentialTypes: ['dbs_enhanced'] }, ['right_to_work', 'care_certificate', 'dbs_enhanced']);
    // 9 required items (6 profile + 3 checks), 7 done.
    expect(c).toMatchObject({ percent: 78, ready: false });
    expect(c.items.find((i) => i.key === 'credential:dbs_enhanced')).toMatchObject({ label: 'Enhanced DBS (adult barred list)', done: false, detail: expect.stringContaining('expired') });
    expect(c.items.find((i) => i.key === 'availability')?.detail).toContain('rotas');
  });

  it('adds a signing item once documents are sent, done when all are signed', () => {
    expect(onboardingChecklist(all, []).items.some((i) => i.key === 'documents_signed')).toBe(false);
    const c = onboardingChecklist({ ...all, documentsToSign: 3, documentsSigned: 1 }, []);
    expect(c.items.find((i) => i.key === 'documents_signed')).toMatchObject({ done: false, required: true, detail: '2 of 3 still to sign.' });
    expect(c.ready).toBe(false);
    expect(onboardingChecklist({ ...all, documentsToSign: 3, documentsSigned: 3 }, []).ready).toBe(true);
  });
});
