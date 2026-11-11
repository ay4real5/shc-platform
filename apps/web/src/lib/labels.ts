import { DISCIPLINE_LABELS, type Discipline } from '@alora/shared';

/** Human-readable labels for codes the API returns. */

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  agency_admin: 'Company admin',
  registered_manager: 'Registered manager',
  care_coordinator: 'Care coordinator',
  recruiter: 'Recruiter',
  team_leader: 'Team leader',
  senior_care_worker: 'Senior care worker',
  care_worker: 'Care worker',
  support_worker: 'Support worker',
};

/** A staff member's job role ('care_worker' → 'Care worker'). */
export function disciplineLabel(code: string): string {
  return DISCIPLINE_LABELS[code as Discipline] ?? humanize(code);
}

export function roleLabel(name: string): string {
  return ROLE_LABELS[name] ?? name;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? String(dayOfWeek);
}

/** 'shift_assigned' → 'Shift assigned'. */
export function humanize(code: string): string {
  const text = code.replaceAll('_', ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "09:30" → "9:30 AM". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h! >= 12 ? 'PM' : 'AM';
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}


/** An ISO instant → local clock time ("4:05 PM"), or a dash. */
export function clockTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
}
