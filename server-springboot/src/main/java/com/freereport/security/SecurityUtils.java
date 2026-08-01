package com.freereport.security;

import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportSubmission;
import com.freereport.exception.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 权限判断工具：所有规则基于「角色 + 机构级别 + 机构归属」三元组。
 * 角色/级别字面量集中为常量，避免散落各处导致改名漏改。
 */
@Component
public class SecurityUtils {

    // 角色
    private static final String ROLE_SUPER_ADMIN = "super_admin";
    private static final String ROLE_DEPARTMENT_REPORT_ADMIN = "department_report_admin";
    private static final String ROLE_DIGITAL_ADMIN = "digital_admin";
    private static final String ROLE_HANDLER = "handler";
    private static final String ROLE_BRANCH_ADMIN = "branch_admin";
    // 机构级别
    private static final String LEVEL_HEADQUARTER = "headquarter";
    private static final String LEVEL_DEPARTMENT = "department";

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

    // ---- 角色判断：公开方法每次调用取一次当前用户，委托给私有实现避免重复读取 ----

    public boolean isSuperAdmin() {
        return isSuperAdmin(getCurrentUser());
    }

    public boolean isDepartmentReportAdmin() {
        return isDepartmentReportAdmin(getCurrentUser());
    }

    public boolean isDigitalAdmin() {
        return isDigitalAdmin(getCurrentUser());
    }

    private boolean isSuperAdmin(AuthUser user) {
        return ROLE_SUPER_ADMIN.equals(user.getRole());
    }

    private boolean isDepartmentReportAdmin(AuthUser user) {
        return ROLE_DEPARTMENT_REPORT_ADMIN.equals(user.getRole())
                && LEVEL_DEPARTMENT.equals(user.getCompanyLevel());
    }

    private boolean isDigitalAdmin(AuthUser user) {
        return ROLE_DIGITAL_ADMIN.equals(user.getRole());
    }

    // ---- 资源级权限 ----

    /**
     * 智能问数是否仅限运营统计（各部门下发情况 / 各分公司填报情况）。
     * 超级管理员与数智化转型办公室可看全量任务状态统计，但不可查询具体报表数值——
     * 报表数据归各部门负责，数值问数仅对部门报表管理员开放（限本部门模板）。
     */
    public boolean isAiQueryLimitedToOperationStats(AuthUser user) {
        return isSuperAdmin(user) || isDigitalAdmin(user);
    }

    public boolean canReadTemplate(Long ownerDepartmentId) {
        AuthUser user = getCurrentUser();
        if (isSuperAdmin(user) || isDigitalAdmin(user)) return true;
        return isDepartmentReportAdmin(user) && user.getCompanyId().equals(ownerDepartmentId);
    }

    public boolean canManageTemplate(Long ownerDepartmentId) {
        AuthUser user = getCurrentUser();
        return !isSuperAdmin(user) && isDepartmentReportAdmin(user)
                && user.getCompanyId().equals(ownerDepartmentId);
    }

    public boolean canReadAssignment(ReportAssignment assignment) {
        AuthUser user = getCurrentUser();
        if (isSuperAdmin(user)) return true;
        if (user.getCompanyId().equals(assignment.getAssignedToCompanyId())) return true;
        return isDepartmentReportAdmin(user) && user.getCompanyId().equals(assignment.getIssuerDepartmentId());
    }

    public boolean canWriteAssignment(ReportAssignment assignment) {
        AuthUser user = getCurrentUser();
        if (isSuperAdmin(user)) return false;
        if (!user.getCompanyId().equals(assignment.getAssignedToCompanyId())) return false;
        return ROLE_HANDLER.equals(user.getRole()) || ROLE_BRANCH_ADMIN.equals(user.getRole());
    }

    public boolean canReadSubmission(ReportSubmission submission) {
        AuthUser user = getCurrentUser();
        if (isSuperAdmin(user)) return true;
        if (LEVEL_HEADQUARTER.equals(user.getCompanyLevel())) return true;
        return submission.getSubmittedByCompanyId().equals(user.getCompanyId());
    }

    // ---- 门槛式断言 ----

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
