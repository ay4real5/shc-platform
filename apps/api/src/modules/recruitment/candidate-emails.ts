/**
 * Emails to applicants and new hires (S1-05). Pure, so they're unit-tested. Plain text; EmailSender adds the HTML
 * version. Applicants aren't users: these go to the address on the application, from the company's name.
 */

export interface InterviewFacts {
  firstName: string;
  company: string;
  jobTitle: string | null;
  /** e.g. "Thursday 20 November 2026 at 10:00" in the company's time zone. */
  when: string;
  durationMinutes: number;
  /** in_person | video | phone */
  mode: string;
  location: string | null;
}

const role = (jobTitle: string | null) => (jobTitle ? `the ${jobTitle} role` : 'a role with us');

export function interviewInviteEmail(f: InterviewFacts): { subject: string; text: string } {
  const how =
    f.mode === 'video'
      ? `It's a video call${f.location ? `: ${f.location}` : '; we will send you the link'}.`
      : f.mode === 'phone'
        ? `We will phone you${f.location ? ` on ${f.location}` : ''}.`
        : `It's in person${f.location ? ` at ${f.location}` : ''}. Please bring photo ID.`;
  return {
    subject: `Interview with ${f.company}`,
    text: [
      `Hello ${f.firstName},`,
      '',
      `Thank you for applying for ${role(f.jobTitle)} at ${f.company}. We would like to invite you to an interview.`,
      '',
      `When: ${f.when} (about ${f.durationMinutes} minutes)`,
      how,
      '',
      'If this time does not suit you, please reply to let us know.',
      '',
      `${f.company}`,
    ].join('\n'),
  };
}

export function rejectionEmail(firstName: string, company: string, jobTitle: string | null): { subject: string; text: string } {
  return {
    subject: `Your application to ${company}`,
    text: [
      `Hello ${firstName},`,
      '',
      `Thank you for your interest in ${role(jobTitle)} at ${company}, and for the time you put into your application.`,
      '',
      'We have decided not to take your application further this time. We will keep your details on file for six months in case a suitable role comes up, unless you ask us not to.',
      '',
      'We wish you all the best.',
      '',
      `${company}`,
    ].join('\n'),
  };
}

export function welcomeEmail(firstName: string, company: string, product: string, link: string, hours: number): { subject: string; text: string } {
  return {
    subject: `Welcome to ${company}: set up your account`,
    text: [
      `Hello ${firstName},`,
      '',
      `Welcome to ${company}! We use ${product} for your onboarding, training, documents and holiday requests.`,
      '',
      `Choose your password here (the link works once, for ${hours} hours):`,
      link,
      '',
      'Then sign in to see what you need to do before your first shift.',
      '',
      `${company}`,
    ].join('\n'),
  };
}

/** "Thursday 20 November 2026 at 10:00" in a time zone. */
export function formatInterviewTime(at: Date, timeZone: string): string {
  const date = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
  return `${date.replace(',', '')} at ${time}`;
}
