import { HEALTH_QUESTIONS } from '@alora/shared';
import { describe, expect, it } from 'vitest';
import { careCertificateText, daysText, healthBody, healthFormError, staffTasks, type CareCertificate, type HealthAnswer, type SignatureRequest } from './self-service';

const allNo = () => Object.fromEntries(HEALTH_QUESTIONS.map((q) => [q.key, { answer: 'no' } as HealthAnswer]));
const sig = (id: string, title: string, status = 'pending'): SignatureRequest => ({
  id,
  document: { id: `d${id}`, title, documentType: 'policy', personal: false },
  status,
  dueOn: null,
  requestedAt: '2026-11-01T09:00:00Z',
  signedAt: null,
  signedName: null,
});

describe('daysText', () => {
  it('handles one, half and many', () => {
    expect(daysText(1)).toBe('1 day');
    expect(daysText(2.5)).toBe('2.5 days');
    expect(daysText(0)).toBe('0 days');
    expect(daysText(28)).toBe('28 days');
  });
});

describe('health form', () => {
  it('needs every answer, details for yes, and the declaration', () => {
    expect(healthFormError({}, true)).toMatch(/every question/);
    const answers = allNo();
    expect(healthFormError(answers, false)).toMatch(/declaration/);
    expect(healthFormError(answers, true)).toBeNull();
    answers[HEALTH_QUESTIONS[0].key] = { answer: 'yes', details: '  ' };
    expect(healthFormError(answers, true)).toMatch(/few words/);
    answers[HEALTH_QUESTIONS[0].key] = { answer: 'yes', details: ' Asthma, well controlled ' };
    expect(healthFormError(answers, true)).toBeNull();
    const body = healthBody(answers, { flu: true });
    expect(body.answers[HEALTH_QUESTIONS[0].key]).toEqual({ answer: 'yes', details: 'Asthma, well controlled' });
    expect(body.answers[HEALTH_QUESTIONS[1].key]).toEqual({ answer: 'no' });
    expect(body.declaration).toBe(true);
  });
});

describe('staffTasks', () => {
  it('nothing to do', () => {
    expect(staffTasks({ toSign: [sig('1', 'Policy', 'signed')], health: null, supervisionsToSign: [] })).toEqual([]);
  });
  it('one document links straight to it; several link to the list', () => {
    expect(staffTasks({ toSign: [sig('1', 'Contract')], health: null, supervisionsToSign: [] })[0]).toMatchObject({ text: 'Sign "Contract"', route: '/documents/1' });
    expect(staffTasks({ toSign: [sig('1', 'A'), sig('2', 'B')], health: null, supervisionsToSign: [] })[0]).toMatchObject({ text: 'Sign 2 documents', route: '/documents' });
  });
  it('health questionnaire and supervision records', () => {
    const tasks = staffTasks({
      toSign: [],
      health: { status: 'none', submittedAt: null, reviewedAt: null, note: null, answers: null },
      supervisionsToSign: [{ id: 's', typeLabel: 'Appraisal' }],
    });
    expect(tasks.map((t) => t.text)).toEqual(['Fill in your health questionnaire', 'Read and sign your appraisal record']);
  });
});

describe('careCertificateText', () => {
  const base: CareCertificate = { needed: true, startedOn: '2026-10-01', dueBy: '2026-12-24', overdue: false, completed: 5, total: 16, awarded: null, standards: [] };
  it('progress, overdue, awarded, not needed', () => {
    expect(careCertificateText(base)).toBe('5 of 16 standards signed off');
    expect(careCertificateText({ ...base, overdue: true })).toBe('5 of 16 standards signed off (past the 12 weeks)');
    expect(careCertificateText({ ...base, awarded: { credentialId: 'c', issueDate: '2026-12-01' } })).toBe('Care Certificate complete');
    expect(careCertificateText({ ...base, needed: false, completed: 0 })).toBeNull();
    expect(careCertificateText(null)).toBeNull();
  });
});
