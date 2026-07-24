package com.freereport.security;

import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportSubmission;
import com.freereport.exception.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

@Component
public class SecurityUtils {
    private final HttpServletRequest request;

    public SecurityUtils(HttpServletRequest request) {
        this.request = request;
    }

    public AuthUser getCurrentUser() {
        AuthUser user = (AuthUser) request.getAttribute("authUser");
        if (user == null) {
            throw new DomainException("未登录", 401);
        }
        return user;
    }

    public boolean isSuperAdmin() {
        return "super_admin".equals(getCurrentUser().getRole());
    }

    public boolean isDepartmentReportAdmin() {
        AuthUser user = getCurrentUser();
        return "department_report_admin".equals(user.getRole()) && "department".equals(user.getCompanyLevel());
    }

    public boolean canReadTemplate(Long ownerDepartmentId) {
        AuthUser user = getCurrentUser();
        return "super_admin".equals(user.getRole()) ||
               ("department_report_admin".equals(user.getRole()) && "department".equals(user.getCompanyLevel())
                && user.getCompanyId().equals(ownerDepartmentId));
    }

    public boolean canManageTemplate(Long ownerDepartmentId) {
        AuthUser user = getCurrentUser();
        return !"super_admin".equals(user.getRole()) &&
               "department_report_admin".equals(user.getRole()) && "department".equals(user.getCompanyLevel())
               && user.getCompanyId().equals(ownerDepartmentId);
    }

    public boolean canReadAssignment(ReportAssignment assignment) {
        AuthUser user = getCurrentUser();
        if ("super_admin".equals(user.getRole())) return true;
        if (user.getCompanyId().equals(assignment.getAssignedToCompanyId())) return true;
        return isDepartmentReportAdmin() && user.getCompanyId().equals(assignment.getIssuerDepartmentId());
    }

    public boolean canWriteAssignment(ReportAssignment assignment) {
        AuthUser user = getCurrentUser();
        if ("super_admin".equals(user.getRole())) return false;
        if (!user.getCompanyId().equals(assignment.getAssignedToCompanyId())) return false;
        return "handler".equals(user.getRole()) || "branch_admin".equals(user.getRole());
    }

    public boolean canReadSubmission(ReportSubmission submission) {
        AuthUser user = getCurrentUser();
        if ("super_admin".equals(user.getRole())) return true;
        if ("headquarter".equals(user.getCompanyLevel())) return true;
        return submission.getSubmittedByCompanyId().equals(user.getCompanyId());
    }

    public void requireDepartmentReportAdmin() {
        if (!isDepartmentReportAdmin()) {
            throw new DomainException("仅所属部门报表管理员可执行此操作", 403);
        }
    }

    public void requireSuperAdmin() {
        if (!isSuperAdmin()) {
            throw new DomainException("仅超级管理员可执行此操作", 403);
        }
    }
}
