import { describe, expect, it } from 'vitest';
import { formatInterviewTime, interviewInviteEmail, rejectionEmail, welcomeEmail } from './candidate-emails.js';

describe('candidate emails', () => {
  it('formats interview times in the company time zone (UK summer and winter time)', () => {
    expect(formatInterviewTime(new Date('2026-11-20T10:00:00Z'), 'Europe/London')).toBe('Friday 20 November 2026 at 10:00');
    expect(formatInterviewTime(new Date('2026-07-01T09:30:00Z'), 'Europe/London')).toBe('Wednesday 1 July 2026 at 10:30');
  });

  it('invites to an interview with the right instructions for each kind', () => {
    const base = { firstName: 'Robin', company: 'Demo Care', jobTitle: 'Care Worker', when: 'Friday 20 November 2026 at 10:00', durationMinutes: 30 };
    const inPerson = interviewInviteEmail({ ...base, mode: 'in_person', location: '1 Demo Street, M1 1AA' });
    expect(inPerson.subject).toBe('Interview with Demo Care');
    expect(inPerson.text).toContain('the Care Worker role at Demo Care');
    expect(inPerson.text).toContain('at 1 Demo Street, M1 1AA. Please bring photo ID.');
    expect(interviewInviteEmail({ ...base, mode: 'video', location: null }).text).toContain('we will send you the link');
    expect(interviewInviteEmail({ ...base, mode: 'phone', location: '07700 900123' }).text).toContain('We will phone you on 07700 900123.');
  });

  it('rejects politely and welcomes with a one-time link', () => {
    expect(rejectionEmail('Robin', 'Demo Care', null).text).toContain('a role with us at Demo Care');
    const welcome = welcomeEmail('Robin', 'Demo Care', 'SHC', 'https://app.example.test/reset-password#token=x', 72);
    expect(welcome.subject).toBe('Welcome to Demo Care: set up your account');
    expect(welcome.text).toContain('https://app.example.test/reset-password#token=x');
    expect(welcome.text).toContain('for 72 hours');
  });
});
