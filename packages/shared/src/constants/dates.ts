/** Today's date (YYYY-MM-DD) in an IANA timezone, e.g. the agency's 'America/New_York'. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Offset (minutes, east of UTC positive) of an IANA timezone at an instant. */
function offsetMinutes(timeZone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(instant));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0; // "GMT" exactly
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/**
 * The UTC instant of an agency-local wall-clock time, e.g. ('2026-10-05', '09:00', 'America/Chicago').
 * Handles daylight-saving changes (the offset is re-checked at the result).
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, h!, mi!);
  let instant = wall - offsetMinutes(timeZone, wall) * 60_000;
  instant = wall - offsetMinutes(timeZone, instant) * 60_000;
  return new Date(instant);
}
