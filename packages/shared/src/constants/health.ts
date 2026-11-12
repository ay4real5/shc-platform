/**
 * Health declaration (S2-05). Special category data (UK GDPR): answers are stored encrypted, read only by people
 * with `health:read` (managers), and asked only after an offer (Equality Act 2010 s.60). CQC Schedule 3 asks for
 * information about health conditions relevant to the job, after reasonable adjustments.
 */

/** Yes/no questions; a "yes" needs details. */
export const HEALTH_QUESTIONS = [
  { key: 'condition', text: 'Do you have a health condition or disability that might affect you doing this job, even with support?' },
  { key: 'adjustments', text: 'Would any changes (reasonable adjustments) help you do the job or settle in?' },
  { key: 'recent_absence', text: 'In the last two years, have you been off work or study through illness for more than two weeks in a row?' },
  { key: 'medication', text: 'Do you take medication that could affect your work, e.g. make you drowsy?' },
  { key: 'lifting', text: 'Is there anything that would stop you safely helping people move (moving and handling)?' },
] as const;
export type HealthQuestionKey = (typeof HEALTH_QUESTIONS)[number]['key'];

/** Optional vaccinations care providers often ask about. */
export const HEALTH_VACCINES = [
  { key: 'flu', text: 'Flu (this season)' },
  { key: 'covid', text: 'COVID-19 (latest booster)' },
  { key: 'hepatitis_b', text: 'Hepatitis B' },
] as const;

/** A manager's review. Only "fit" and "fit with adjustments" count as cleared to start. */
export const HEALTH_OUTCOMES = ['fit', 'fit_with_adjustments', 'occupational_health'] as const;
export type HealthOutcome = (typeof HEALTH_OUTCOMES)[number];
export const HEALTH_OUTCOME_LABELS: Record<HealthOutcome, string> = {
  fit: 'Fit for the role',
  fit_with_adjustments: 'Fit, with adjustments',
  occupational_health: 'Referred to occupational health',
};
export const HEALTH_CLEARED: readonly HealthOutcome[] = ['fit', 'fit_with_adjustments'];

/** none → submitted → reviewed (cleared or referred). */
export type HealthStatus = 'none' | 'submitted' | 'cleared' | 'referred';
