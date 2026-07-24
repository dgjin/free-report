import assert from 'node:assert/strict';
import test from 'node:test';
import { getClientAccess } from '../src/utils/access';

test('client access reflects super admin read-only and department roles', () => {
  const superAccess = getClientAccess({ role: 'super_admin', company_level: 'headquarter' } as any);
  assert.equal(superAccess.canManageOrganizations, true);
  assert.equal(superAccess.canManageTemplates, false);
  assert.equal(superAccess.canFill, false);
  const department = getClientAccess({ role: 'department_report_admin', company_level: 'department' } as any);
  assert.equal(department.canManageTemplates, true);
  assert.equal(department.canReceive, true);
  assert.equal(department.canFill, false);
});
