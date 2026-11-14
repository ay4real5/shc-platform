import { normaliseRegistrationNumber, registerFor, registrationNumberProblem } from './registration.js';

describe('professional registration (S-027)', () => {
  it('knows which register each role needs', () => {
    expect(registerFor('nurse')?.body).toBe('NMC');
    expect(registerFor('nurse_rmn')?.body).toBe('NMC');
    expect(registerFor('nurse_rnld')?.body).toBe('NMC');
    expect(registerFor('ahp')?.body).toBe('HCPC');
    expect(registerFor('doctor')?.body).toBe('GMC');
    expect(registerFor('care_worker')).toBeNull();
  });

  it('checks number formats (FAKE numbers), tolerating spaces and lower case', () => {
    expect(normaliseRegistrationNumber(' 12a 3456e ')).toBe('12A3456E');
    expect(registrationNumberProblem('nmc_registration', '12a3456e')).toBeNull();
    expect(registrationNumberProblem('nmc_registration', '123456')).toMatch(/NMC PIN should look like 12A3456E/);
    expect(registrationNumberProblem('hcpc_registration', 'OT12345')).toBeNull();
    expect(registrationNumberProblem('gmc_registration', '1234567')).toBeNull();
    expect(registrationNumberProblem('gmc_registration', '12345')).not.toBeNull();
    expect(registrationNumberProblem('first_aid', 'anything')).toBeNull();
    expect(registrationNumberProblem('nmc_registration', null)).toBeNull();
  });
});
