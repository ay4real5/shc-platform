import { PERMISSIONS, type Permission } from './permissions.js';
import type { Role } from './roles.js';

/**
 * What each built-in role may do (DECISIONS S-002). These roles are synced into the database on every API start and
 * cannot be edited there; companies make custom roles for anything different (D-022, D-099).
 *
 * Permissions answer "may this role do X at all?". Narrower rules (e.g. staff only see their own documents) are
 * enforced per record by each module.
 */

/** Every member of staff: their own holiday requests and secure messaging. */
const STAFF_BASE: Permission[] = ['time_off:request', 'messages:use'];

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, readonly Permission[]> = {
  /** Platform owner. Cross-company powers come later; within a company, everything. */
  super_admin: PERMISSIONS,

  /** The company's administrator (owner/director). */
  agency_admin: PERMISSIONS,

  /** The CQC-registered manager: everything except company settings and deleting user accounts. */
  registered_manager: PERMISSIONS.filter((p) => p !== 'settings:update' && p !== 'users:delete'),

  /** Office coordinator: runs recruitment, onboarding, staff records, training and holidays. */
  care_coordinator: [
    ...STAFF_BASE,
    'users:read',
    'staff:create',
    'staff:read',
    'staff:update',
    'time_off:approve',
    'documents:create',
    'documents:read',
    'documents:sign',
    'notifications:create',
    'training:manage',
    'recruitment:read',
    'recruitment:manage',
    'compliance:read',
    'reports:read',
  ],

  /** Recruitment only: jobs, applicants, interviews, offers. */
  recruiter: [...STAFF_BASE, 'recruitment:read', 'recruitment:manage', 'staff:read', 'documents:create', 'documents:read'],

  /** Leads a team or a supported-living service: sees their people, approves holidays. */
  team_leader: [...STAFF_BASE, 'staff:read', 'time_off:approve', 'documents:read', 'compliance:read'],

  senior_care_worker: STAFF_BASE,
  care_worker: STAFF_BASE,
  support_worker: STAFF_BASE,
};
