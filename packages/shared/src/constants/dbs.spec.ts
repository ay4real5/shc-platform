import { DBS_CERTIFICATE_NUMBER, dbsNextDue } from './dbs.js';

describe('DBS rules', () => {
  it('Update Service: a status check a year after the latest certificate or status check', () => {
    expect(dbsNextDue({ issueDate: '2026-03-01', updateService: true })).toBe('2027-03-01');
    expect(dbsNextDue({ issueDate: '2026-03-01', updateService: true, lastStatusCheckOn: '2027-02-20' })).toBe('2028-02-20');
    expect(dbsNextDue({ issueDate: '2026-03-01', updateService: true, lastStatusCheckOn: '2025-01-01' })).toBe('2027-03-01');
  });

  it('not on the Update Service: a new check three years after issue', () => {
    expect(dbsNextDue({ issueDate: '2026-03-01', updateService: false })).toBe('2029-03-01');
  });

  it('certificate numbers are 12 digits', () => {
    expect(DBS_CERTIFICATE_NUMBER.test('001234567890')).toBe(true);
    expect(DBS_CERTIFICATE_NUMBER.test('12345')).toBe(false);
  });
});
