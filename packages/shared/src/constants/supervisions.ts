/**
 * Supervisions, appraisals and spot checks (S3-04). CQC expects staff to be supported through regular supervision and
 * appraisal (Regulation 18), and home care providers to check competence by observing staff at work (spot checks).
 * The intervals are defaults; each company can change them.
 */
export const SUPERVISION_TYPES = ['supervision', 'appraisal', 'spot_check'] as const;
export type SupervisionType = (typeof SUPERVISION_TYPES)[number];

export const SUPERVISION_TYPE_LABELS: Record<SupervisionType, string> = {
  supervision: 'Supervision',
  appraisal: 'Appraisal',
  spot_check: 'Spot check (observed practice)',
};

/** Months between sessions, and months after starting for the first one. */
export const DEFAULT_SUPERVISION_INTERVALS: Record<SupervisionType, { everyMonths: number; firstAfterMonths: number }> = {
  supervision: { everyMonths: 3, firstAfterMonths: 1 },
  appraisal: { everyMonths: 12, firstAfterMonths: 12 },
  spot_check: { everyMonths: 6, firstAfterMonths: 3 },
};

export const SUPERVISION_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type SupervisionStatus = (typeof SUPERVISION_STATUSES)[number];

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * When the next one is due: an interval after the last one held, else the first-session gap after their start date,
 * else today (no start date recorded).
 */
export function supervisionDueOn(lastHeld: string | null, startedOn: string | null, today: string, interval: { everyMonths: number; firstAfterMonths: number }): string {
  if (lastHeld) return addMonths(lastHeld, interval.everyMonths);
  if (startedOn) return addMonths(startedOn, interval.firstAfterMonths);
  return today;
}
