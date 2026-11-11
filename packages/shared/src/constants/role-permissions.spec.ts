import { PERMISSIONS } from './permissions.js';
import { ROLE_DEFAULT_PERMISSIONS } from './role-permissions.js';
import { ROLES } from './roles.js';

describe('ROLE_DEFAULT_PERMISSIONS', () => {
  it('covers every role and only uses real permissions, without duplicates', () => {
    expect(Object.keys(ROLE_DEFAULT_PERMISSIONS).sort()).toEqual([...ROLES].sort());
    for (const [role, permissions] of Object.entries(ROLE_DEFAULT_PERMISSIONS)) {
      for (const p of permissions) expect(PERMISSIONS, `${role} → ${p}`).toContain(p);
      expect(new Set(permissions).size, role).toBe(permissions.length);
    }
  });

  it('keeps the separations a care provider needs', () => {
    const can = (role: keyof typeof ROLE_DEFAULT_PERMISSIONS, p: string) =>
      (ROLE_DEFAULT_PERMISSIONS[role] as readonly string[]).includes(p);

    expect(can('care_worker', 'staff:read')).toBe(false); // care workers don't see other people's records
    expect(can('care_worker', 'time_off:request')).toBe(true);
    expect(can('recruiter', 'staff:update')).toBe(false);
    expect(can('recruiter', 'recruitment:manage')).toBe(true);
    expect(can('team_leader', 'time_off:approve')).toBe(true);
    expect(can('care_coordinator', 'settings:update')).toBe(false);
    expect(can('registered_manager', 'settings:update')).toBe(false);
    expect(can('registered_manager', 'audit_logs:read')).toBe(true);
    expect(ROLE_DEFAULT_PERMISSIONS.agency_admin).toEqual(PERMISSIONS);
  });
});
