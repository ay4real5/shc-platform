import { PERMISSIONS, isPermission } from './permissions.js';

describe('permissions', () => {
  it('uses resource:action format with no duplicates', () => {
    for (const p of PERMISSIONS) expect(p).toMatch(/^[a-z_]+:[a-z_]+$/);
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('recognises valid and invalid permission strings', () => {
    expect(isPermission('staff:read')).toBe(true);
    expect(isPermission('read:staff')).toBe(false);
    expect(isPermission('patients:read')).toBe(false);
  });
});
