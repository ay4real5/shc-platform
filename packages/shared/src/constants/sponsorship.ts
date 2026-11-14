/**
 * Sponsored workers (S5-04, S-031). Support Health Care Ltd recruits from abroad, so it holds a sponsor licence and has
 * Home Office duties for each worker it sponsors: keep their visa and Certificate of Sponsorship details, check their
 * right to work again before their visa ends, and report certain changes through the Sponsor Management System within
 * 10 working days. SHC stores the facts and reminds; it never gives immigration advice. The rules change often (2025
 * closed the overseas care worker route to new applicants): the company confirms them with its immigration adviser.
 */
export const VISA_ROUTES = ['health_and_care', 'skilled_worker', 'graduate', 'student', 'dependant', 'other'] as const;
export type VisaRoute = (typeof VISA_ROUTES)[number];

export const VISA_ROUTE_LABELS: Record<VisaRoute, string> = {
  health_and_care: 'Health and Care Worker visa',
  skilled_worker: 'Skilled Worker visa',
  graduate: 'Graduate visa',
  student: 'Student visa (limited hours)',
  dependant: 'Dependant of a visa holder',
  other: 'Other permission',
};

/** Routes where the company is the sponsor (so sponsor duties apply). */
export const SPONSORED_ROUTES: readonly VisaRoute[] = ['health_and_care', 'skilled_worker'];

/** Changes a sponsor must report to the Home Office (Sponsor Management System), within 10 working days. */
export const SPONSOR_EVENTS = ['did_not_start', 'absent_10_days', 'left', 'job_change', 'salary_change', 'hours_change', 'location_change', 'other'] as const;
export type SponsorEvent = (typeof SPONSOR_EVENTS)[number];

export const SPONSOR_EVENT_LABELS: Record<SponsorEvent, string> = {
  did_not_start: 'Did not start work',
  absent_10_days: 'Absent without permission for 10 working days in a row',
  left: 'Stopped working for us (left, dismissed, contract ended)',
  job_change: 'Job title, duties or job code changed',
  salary_change: 'Salary changed',
  hours_change: 'Working hours changed',
  location_change: 'Main place of work changed',
  other: 'Other change to report',
};

export const SPONSOR_REPORT_WORKING_DAYS = 10;
/** Remind the office this many days before a sponsored worker's visa ends. */
export const VISA_ALERT_DAYS = 90;

/**
 * `days` working days after an ISO date (weekends skipped). Bank holidays are not skipped, so the deadline shown is
 * never later than the real one.
 */
export function addWorkingDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** The date a change must be reported by. */
export function sponsorReportDueBy(happenedOn: string): string {
  return addWorkingDays(happenedOn, SPONSOR_REPORT_WORKING_DAYS);
}

export type VisaState = 'valid' | 'expiring_soon' | 'expired';
export function visaState(expiresOn: string, today: string): VisaState {
  if (expiresOn < today) return 'expired';
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + VISA_ALERT_DAYS);
  return expiresOn <= soon.toISOString().slice(0, 10) ? 'expiring_soon' : 'valid';
}

/** Certificate of Sponsorship reference: 10 letters and digits, e.g. "C2G7A12345" (FAKE). */
export const COS_REFERENCE = /^[A-Z0-9]{10}$/;
