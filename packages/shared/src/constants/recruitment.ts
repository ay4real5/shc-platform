/**
 * Recruitment (S1-04/S1-05): job adverts, applications and the hiring pipeline.
 * Employment history follows CQC Regulation 19 / Schedule 3: a full history with a written explanation of any gaps.
 */

export const JOB_STATUSES = ['draft', 'open', 'closed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const PAY_PERIODS = ['hour', 'year'] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

/** Pipeline stages, in order; rejected and withdrawn end an application at any point. */
export const APPLICATION_STAGES = ['applied', 'screened', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];
export const OPEN_APPLICATION_STAGES: readonly ApplicationStage[] = ['applied', 'screened', 'interview', 'offer'];

export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: 'Applied',
  screened: 'Screened',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

/** What the applicant says about their right to work in the UK (checked properly at onboarding, S2-01). */
export const RIGHT_TO_WORK_ANSWERS = ['british_or_irish', 'settled_or_pre_settled', 'visa', 'needs_sponsorship'] as const;
export type RightToWorkAnswer = (typeof RIGHT_TO_WORK_ANSWERS)[number];
export const RIGHT_TO_WORK_LABELS: Record<RightToWorkAnswer, string> = {
  british_or_irish: 'British or Irish citizen',
  settled_or_pre_settled: 'Settled or pre-settled status (EU Settlement Scheme)',
  visa: 'A visa that lets me do this job',
  needs_sponsorship: 'I would need sponsorship',
};

/** One row of an applicant's history: a job, or an explained gap. Dates are YYYY-MM-DD; no end date = current. */
export interface HistoryEntry {
  kind: 'job' | 'gap';
  startDate: string;
  endDate: string | null;
}

export interface HistoryGap {
  from: string;
  to: string;
  days: number;
}

/** Gaps longer than this many days need an explanation. */
export const GAP_TOLERANCE_DAYS = 31;

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Periods not covered by any job or explained gap, from the earliest entry up to `today`, longer than
 * GAP_TOLERANCE_DAYS. Overlapping entries are fine (two part-time jobs). Pure, so the form and the API agree.
 */
export function findHistoryGaps(entries: HistoryEntry[], today: string): HistoryGap[] {
  const spans = entries
    .map((e) => ({ start: toTime(e.startDate), end: e.endDate ? toTime(e.endDate) : toTime(today) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start)
    .sort((a, b) => a.start - b.start);
  if (!spans.length) return [];
  const gaps: HistoryGap[] = [];
  let coveredTo = spans[0]!.end;
  for (const span of spans.slice(1)) {
    if (span.start - coveredTo > DAY) {
      const days = Math.round((span.start - coveredTo) / DAY) - 1;
      if (days > GAP_TOLERANCE_DAYS) gaps.push({ from: toDay(coveredTo + DAY), to: toDay(span.start - DAY), days });
    }
    coveredTo = Math.max(coveredTo, span.end);
  }
  const end = toTime(today);
  const tail = Math.round((end - coveredTo) / DAY);
  if (tail > GAP_TOLERANCE_DAYS) gaps.push({ from: toDay(coveredTo + DAY), to: today, days: tail });
  return gaps;
}
