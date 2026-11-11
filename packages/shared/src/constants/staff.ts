/** Job roles in a UK care provider (staff_profiles.discipline; DECISIONS S-002). */
export const DISCIPLINES = [
  'care_worker',
  'senior_care_worker',
  'support_worker',
  'team_leader',
  'nurse',
  'care_coordinator',
  'manager',
  'office',
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  care_worker: 'Care worker',
  senior_care_worker: 'Senior care worker',
  support_worker: 'Support worker',
  team_leader: 'Team leader',
  nurse: 'Nurse',
  care_coordinator: 'Care coordinator',
  manager: 'Manager',
  office: 'Office',
};

/** UK contract types. Bank staff work as and when needed. */
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'zero_hours', 'bank', 'contractor'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const TIME_OFF_TYPES = ['annual_leave', 'sickness', 'compassionate', 'unpaid', 'other'] as const;
export type TimeOffType = (typeof TIME_OFF_TYPES)[number];

export const TIME_OFF_STATUSES = ['pending', 'approved', 'denied', 'cancelled'] as const;
export type TimeOffStatus = (typeof TIME_OFF_STATUSES)[number];

/** Derived from expiry date and the credential's alert window; never stored. */
export type CredentialState = 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';

export function credentialState(expiryDate: string | null, alertDaysBefore: number, today: string): CredentialState {
  if (!expiryDate) return 'no_expiry';
  if (expiryDate < today) return 'expired';
  const alertFrom = new Date(`${expiryDate}T00:00:00Z`);
  alertFrom.setUTCDate(alertFrom.getUTCDate() - alertDaysBefore);
  return today >= alertFrom.toISOString().slice(0, 10) ? 'expiring_soon' : 'valid';
}

/** Recorded only when the person chooses to give it. */
export const GENDERS = ['female', 'male', 'other', 'unknown'] as const;
export type Gender = (typeof GENDERS)[number];
