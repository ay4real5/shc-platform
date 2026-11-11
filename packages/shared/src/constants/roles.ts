/** Built-in system roles for a UK care provider (DECISIONS S-002). Companies may add custom roles on top of these. */
export const ROLES = [
  'super_admin',
  'agency_admin',
  'registered_manager',
  'care_coordinator',
  'recruiter',
  'team_leader',
  'senior_care_worker',
  'care_worker',
  'support_worker',
] as const;

export type Role = (typeof ROLES)[number];

/** Roles of people who deliver care or support and use the staff app. */
export const FIELD_ROLES = ['team_leader', 'senior_care_worker', 'care_worker', 'support_worker'] as const satisfies readonly Role[];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Roles that must use two-factor authentication: anyone who can see or change everything. */
export const MANDATORY_TWO_FACTOR_ROLES: readonly Role[] = ['super_admin', 'agency_admin', 'registered_manager'];
