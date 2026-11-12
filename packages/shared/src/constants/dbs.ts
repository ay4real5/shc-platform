/**
 * DBS checks (S2-02). Care work needs an Enhanced DBS check with the adults' barred list (and children's too if the
 * role involves children). Following the DBS code of practice, we keep the certificate number, date, level and
 * result only — never a copy of the certificate, and never what it says.
 */

export const DBS_LEVELS = ['enhanced_barred_adults', 'enhanced_barred_both', 'enhanced', 'standard', 'basic'] as const;
export type DbsLevel = (typeof DBS_LEVELS)[number];
export const DBS_LEVEL_LABELS: Record<DbsLevel, string> = {
  enhanced_barred_adults: 'Enhanced, with adults’ barred list',
  enhanced_barred_both: 'Enhanced, with adults’ and children’s barred lists',
  enhanced: 'Enhanced (no barred list check)',
  standard: 'Standard',
  basic: 'Basic',
};
/** Levels good enough for regulated activity with adults (care work). */
export const DBS_LEVELS_FOR_CARE: readonly DbsLevel[] = ['enhanced_barred_adults', 'enhanced_barred_both'];

/** clear = nothing on it; information = it shows something (a manager must risk-assess before they start). */
export const DBS_RESULTS = ['clear', 'information'] as const;
export type DbsResult = (typeof DBS_RESULTS)[number];

/** After a certificate that shows information: did the manager decide they may work? */
export const DBS_DECISIONS = ['approved', 'not_approved'] as const;

/** An Update Service status check: no change since the certificate, or new information (get a new check). */
export const DBS_STATUS_RESULTS = ['no_change', 'new_information'] as const;

/** A DBS certificate number: 12 digits. */
export const DBS_CERTIFICATE_NUMBER = /^\d{12}$/;

/** Company policy defaults: status check yearly on the Update Service, otherwise a new check every 3 years. */
export const DBS_STATUS_CHECK_MONTHS = 12;
export const DBS_RECHECK_MONTHS = 36;
export const DBS_ALERT_DAYS = 30;

const addMonths = (date: string, months: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

/**
 * When the next check is due: a status check a year after the latest certificate or status check for Update Service
 * subscribers, otherwise a fresh certificate three years after the issue date.
 */
export function dbsNextDue(input: { issueDate: string; updateService: boolean; lastStatusCheckOn?: string | null }): string {
  if (input.updateService) return addMonths(input.lastStatusCheckOn && input.lastStatusCheckOn > input.issueDate ? input.lastStatusCheckOn : input.issueDate, DBS_STATUS_CHECK_MONTHS);
  return addMonths(input.issueDate, DBS_RECHECK_MONTHS);
}
