import type { UserInfo } from '../types';

export function getClientAccess(user: Pick<UserInfo, 'role' | 'company_level'>) {
  const isSuperAdmin = user.role === 'super_admin';
  const isDepartmentAdmin = user.role === 'department_report_admin' && user.company_level === 'department';
  const isDigitalAdmin = user.role === 'digital_admin';
  return {
    isSuperAdmin,
    isDepartmentAdmin,
    isDigitalAdmin,
    canManageTemplates: isDepartmentAdmin,
    canApproveTemplates: isDigitalAdmin,
    canFill: !isSuperAdmin && ['handler', 'branch_admin'].includes(user.role),
    canReceive: isDepartmentAdmin,
    canManageOrganizations: isSuperAdmin,
  };
}
