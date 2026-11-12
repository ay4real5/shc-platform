/**
 * UK holiday and absence rules (S3-03). Statutory holiday is 5.6 weeks a year, capped at 28 days; bank holidays count
 * towards it. Someone who starts part-way through the leave year gets a pro-rata share, rounded up to the next half day.
 * Staff with irregular hours (zero-hours, bank) need their entitlement set by the office (12.07% of hours worked).
 */
export const STATUTORY_HOLIDAY_WEEKS = 5.6;
export const STATUTORY_HOLIDAY_CAP_DAYS = 28;
/** Default first month of the leave year (April), changeable per company. */
export const DEFAULT_LEAVE_YEAR_START_MONTH = 4;

const DAY = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Statutory days for someone working `daysPerWeek` days a week. */
export function statutoryHolidayDays(daysPerWeek: number): number {
  return Math.min(Math.round(STATUTORY_HOLIDAY_WEEKS * daysPerWeek * 10) / 10, STATUTORY_HOLIDAY_CAP_DAYS);
}

/** The leave year containing `today`, as inclusive dates. */
export function leaveYear(today: string, startMonth: number): { start: string; end: string } {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const startYear = m >= startMonth ? y : y - 1;
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const nextStart = `${startYear + 1}-${String(startMonth).padStart(2, '0')}-01`;
  return { start, end: iso(parse(nextStart) - DAY) };
}

/** A full year's entitlement scaled to the part of the leave year after `startedOn`, rounded up to a half day. */
export function proRataHolidayDays(fullYearDays: number, year: { start: string; end: string }, startedOn: string | null): number {
  if (!startedOn || startedOn <= year.start) return fullYearDays;
  if (startedOn > year.end) return 0;
  const total = (parse(year.end) - parse(year.start)) / DAY + 1;
  const remaining = (parse(year.end) - parse(startedOn)) / DAY + 1;
  return Math.min(fullYearDays, Math.ceil(((fullYearDays * remaining) / total) * 2) / 2);
}

/** Days from `start` to `end` (inclusive) falling on the given weekdays (0 = Sunday). Default Monday to Friday. */
export function workingDaysBetween(start: string, end: string, weekdays: readonly number[] = [1, 2, 3, 4, 5]): number {
  const set = new Set(weekdays.length ? weekdays : [1, 2, 3, 4, 5]);
  let n = 0;
  for (let t = parse(start); t <= parse(end); t += DAY) if (set.has(new Date(t).getUTCDay())) n++;
  return n;
}

/** Bradford factor: spells² × days, over the last 52 weeks. Highlights frequent short absences. */
export function bradfordFactor(spells: number, days: number): number {
  return spells * spells * days;
}

/** Common trigger points; companies use their own absence policy. */
export function bradfordBand(score: number): 'none' | 'low' | 'review' | 'high' {
  if (score === 0) return 'none';
  if (score < 51) return 'low';
  if (score < 250) return 'review';
  return 'high';
}
