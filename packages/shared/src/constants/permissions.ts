/**
 * Permission catalogue, written `resource:action` (DECISIONS D-004, S-002).
 */
export const PERMISSION_CATALOGUE = {
  users: ['create', 'read', 'update', 'delete'],
  settings: ['read', 'update'],
  staff: ['create', 'read', 'update', 'delete'],
  /** request = ask for your own holiday/time off; approve = decide other people's. */
  time_off: ['request', 'approve'],
  /** See staff pay rates (everyone sees their own). */
  pay: ['read'],
  documents: ['create', 'read', 'delete', 'sign'],
  notifications: ['create'],
  /** Secure staff messaging (D-057). */
  messages: ['use'],
  reports: ['read'],
  compliance: ['read', 'update'],
  audit_logs: ['read'],
  /** Academy (D-102): write training courses and see results. Taking courses needs no permission. */
  training: ['manage'],
  /** Jobs, the careers page and the applicant pipeline (S1-04/S1-05). */
  recruitment: ['read', 'manage'],
} as const;

type Catalogue = typeof PERMISSION_CATALOGUE;
export type PermissionResource = keyof Catalogue;
export type Permission = {
  [R in PermissionResource]: `${R}:${Catalogue[R][number]}`;
}[PermissionResource];

/** Every permission string, e.g. `staff:read`. */
export const PERMISSIONS: readonly Permission[] = (
  Object.entries(PERMISSION_CATALOGUE) as [PermissionResource, readonly string[]][]
).flatMap(([resource, actions]) => actions.map((action) => `${resource}:${action}` as Permission));

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
