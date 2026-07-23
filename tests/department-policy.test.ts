import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canManageTemplate, canReadTemplate, canReadAssignment, canWriteAssignment, canReceiveSubmission,
} from '../server/src/department-policy';

const adminA = { id: 1, company_id: 10, company_level: 'department', role: 'department_report_admin' } as const;
const adminB = { id: 2, company_id: 20, company_level: 'department', role: 'department_report_admin' } as const;
const handlerB = { id: 3, company_id: 20, company_level: 'department', role: 'handler' } as const;
const superAdmin = { id: 4, company_id: 1, company_level: 'headquarter', role: 'super_admin' } as const;
const templateA = { owner_department_id: 10 };
const assignment = { assigned_to_company_id: 20, issuer_department_id: 10 };

test('templates are isolated while super admin is read only', () => {
  assert.equal(canReadTemplate(adminA, templateA), true);
  assert.equal(canManageTemplate(adminA, templateA), true);
  assert.equal(canReadTemplate(adminB, templateA), false);
  assert.equal(canManageTemplate(adminB, templateA), false);
  assert.equal(canReadTemplate(superAdmin, templateA), true);
  assert.equal(canManageTemplate(superAdmin, templateA), false);
});

test('receiver writes and issuer department receives', () => {
  assert.equal(canReadAssignment(handlerB, assignment), true);
  assert.equal(canWriteAssignment(handlerB, assignment), true);
  assert.equal(canReceiveSubmission(adminA, assignment), true);
  assert.equal(canReceiveSubmission(adminB, assignment), false);
  assert.equal(canWriteAssignment(superAdmin, assignment), false);
  assert.equal(canReceiveSubmission(superAdmin, assignment), false);
});
