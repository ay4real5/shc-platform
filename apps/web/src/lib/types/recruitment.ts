/** Recruitment shapes as returned by the API (apps/api/src/modules/recruitment). Kept in sync by hand (D-035). */

export interface Job {
  id: string;
  title: string;
  discipline: string;
  employmentType: string;
  location: string;
  /** Money as decimal strings, e.g. "12.60". */
  payFrom: string | null;
  payTo: string | null;
  payPeriod: 'hour' | 'year' | string;
  hours: string | null;
  summary: string | null;
  description: string;
  status: 'draft' | 'open' | 'closed' | string;
  closesOn: string | null;
  publishedAt: string | null;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PublicJob = Omit<Job, 'status' | 'publishedAt' | 'applicationCount' | 'createdAt' | 'updatedAt'>;

export interface CareersPage {
  company: { name: string; town: string | null };
  jobs: PublicJob[];
}

export interface ApplicationSummary {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  postcode: string;
  stage: string;
  stageChangedAt: string;
  job: { id: string; title: string } | null;
  createdAt: string;
}

export interface ApplicationDetail extends ApplicationSummary {
  addressLine1: string | null;
  town: string | null;
  rightToWork: string;
  canDrive: boolean;
  earliestStart: string | null;
  availability: string | null;
  coverNote: string | null;
  source: string | null;
  declarationAcceptedAt: string;
  history: {
    kind: 'job' | 'gap' | string;
    employer: string | null;
    jobTitle: string | null;
    startDate: string;
    endDate: string | null;
    reasonForLeaving: string | null;
    wasCareRole: boolean;
    explanation: string | null;
  }[];
  referees: {
    name: string;
    organisation: string | null;
    relationship: string;
    email: string;
    phone: string | null;
    contactBeforeOffer: boolean;
  }[];
}

/** "£12.60 to £13.50 an hour", "£28,000 a year", or null. */
export function formatPay(job: Pick<PublicJob, 'payFrom' | 'payTo' | 'payPeriod'>): string | null {
  const money = (v: string) => {
    const n = Number(v);
    return `£${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  };
  const per = job.payPeriod === 'year' ? 'a year' : 'an hour';
  if (job.payFrom && job.payTo && job.payFrom !== job.payTo) return `${money(job.payFrom)} to ${money(job.payTo)} ${per}`;
  const one = job.payFrom ?? job.payTo;
  return one ? `${money(one)} ${per}` : null;
}
