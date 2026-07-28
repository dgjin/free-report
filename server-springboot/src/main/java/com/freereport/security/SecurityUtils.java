package com.freereport.security;

import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportSubmission;
import com.freereport.exception.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Component
public class SecurityUtils {

    /**
     * 通过 RequestContextHolder 获取当前线程绑定的请求，避免构造器注入 HttpServletRequest 代理。
     */
    private HttpServletRequest currentRequest() {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            throw new DomainException("当前线程无请求上下文", 500);
        }
        return attrs.getRequest();
    }

    public AuthUser getCurrentUser() {
        AuthUser user = (AuthUser) currentRequest().getAttribute("authUser");
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

    public boolean isDigitalAdmin() {
        return "digital_admin".equals(getCurrentUser().getRole());
    }

    public boolean canReadTemplate(Long ownerDepartmentId) {
        AuthUser user = getCurrentUser();
        if ("super_admin".equals(user.getRole())) return true;
        if (isDigitalAdmin()) return true;
        return "department_report_admin".equals(user.getRole()) && "department".equals(user.getCompanyLevel())
                && user.getCompanyId().equals(ownerDepartmentId);
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

    public void requireDigitalAdmin() {
        if (!isDigitalAdmin()) {
            throw new DomainException("仅数智化转型办公室管理员可执行此操作", 403);
        }
    }
}
