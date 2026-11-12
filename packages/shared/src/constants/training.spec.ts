import { describe, expect, it } from 'vitest';
import { CARE_CERTIFICATE_STANDARDS, TRAINING_MATRIX, needsCareCertificate } from './training.js';

describe('Care Certificate', () => {
  it('has 16 numbered standards', () => {
    expect(CARE_CERTIFICATE_STANDARDS.map((s) => s.number)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it('is for care roles, not the office', () => {
    expect(needsCareCertificate('care_worker')).toBe(true);
    expect(needsCareCertificate('support_worker')).toBe(true);
    expect(needsCareCertificate('office')).toBe(false);
    expect(needsCareCertificate('unknown')).toBe(false);
  });

  it('matrix rows match the roles that need the Care Certificate', () => {
    const cc = TRAINING_MATRIX.find((t) => t.type === 'care_certificate')!;
    for (const d of cc.neededBy) expect(needsCareCertificate(d)).toBe(true);
  });
});
