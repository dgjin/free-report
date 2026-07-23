type AccessUser = { company_id: number; company_level?: string; role: string };
type OwnedTemplate = { owner_department_id: number };
type ScopedAssignment = { assigned_to_company_id: number; issuer_department_id?: number };

export const isSuperAdminReadOnly = (user: AccessUser) => user.role === 'super_admin';
export const isDepartmentReportAdmin = (user: AccessUser) =>
  user.role === 'department_report_admin' && user.company_level === 'department';

export function canReadTemplate(user: AccessUser, template: OwnedTemplate): boolean {
  return isSuperAdminReadOnly(user) || (isDepartmentReportAdmin(user) && user.company_id === template.owner_department_id);
}

export function canManageTemplate(user: AccessUser, template: OwnedTemplate): boolean {
  return !isSuperAdminReadOnly(user) && isDepartmentReportAdmin(user) && user.company_id === template.owner_department_id;
}

export function canReadAssignment(user: AccessUser, assignment: ScopedAssignment): boolean {
  return isSuperAdminReadOnly(user) || user.company_id === assignment.assigned_to_company_id ||
    (isDepartmentReportAdmin(user) && user.company_id === assignment.issuer_department_id);
}

export function canWriteAssignment(user: AccessUser, assignment: ScopedAssignment): boolean {
  if (isSuperAdminReadOnly(user) || user.company_id !== assignment.assigned_to_company_id) return false;
  return ['handler', 'branch_admin', 'department_report_admin'].includes(user.role);
}

export function canReceiveSubmission(user: AccessUser, assignment: ScopedAssignment): boolean {
  return !isSuperAdminReadOnly(user) && isDepartmentReportAdmin(user) && user.company_id === assignment.issuer_department_id;
}
