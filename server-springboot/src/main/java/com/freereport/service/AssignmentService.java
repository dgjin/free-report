package com.freereport.service;

import com.freereport.entity.AssignmentRecall;
import com.freereport.entity.Company;
import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportSubmission;
import com.freereport.entity.ReportTemplate;
import com.freereport.entity.User;
import com.freereport.exception.DomainException;
import com.freereport.mapper.AggregationMapper;
import com.freereport.mapper.ApprovalMapper;
import com.freereport.mapper.AssignmentMapper;
import com.freereport.mapper.CompanyMapper;
import com.freereport.mapper.SubmissionMapper;
import com.freereport.mapper.TemplateMapper;
import com.freereport.mapper.UserMapper;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 下发任务服务：任务列表、详情、收回。
 */
@Service
public class AssignmentService {

    private final AssignmentMapper assignmentMapper;
    private final TemplateMapper templateMapper;
    private final CompanyMapper companyMapper;
    private final UserMapper userMapper;
    private final SubmissionMapper submissionMapper;
    private final ApprovalMapper approvalMapper;
    private final AggregationMapper aggregationMapper;
    private final SecurityUtils securityUtils;

    public AssignmentService(AssignmentMapper assignmentMapper, TemplateMapper templateMapper,
                             CompanyMapper companyMapper, UserMapper userMapper, SubmissionMapper submissionMapper,
                             ApprovalMapper approvalMapper, AggregationMapper aggregationMapper, SecurityUtils securityUtils) {
        this.assignmentMapper = assignmentMapper;
        this.templateMapper = templateMapper;
        this.companyMapper = companyMapper;
        this.userMapper = userMapper;
        this.submissionMapper = submissionMapper;
        this.approvalMapper = approvalMapper;
        this.aggregationMapper = aggregationMapper;
        this.securityUtils = securityUtils;
    }

    /**
     * 返回当前用户的下发任务列表（含 template_name、company_name、issuer_department_name、
     * assigned_by_name、submission_status、submission_version、submission_id），批量查询避免 N+1。
     */
    public List<Map<String, Object>> getAssignmentsForUser(AuthUser user) {
        List<ReportAssignment> assignments = assignmentMapper.findForUser(
                user.getCompanyId(), user.getRole(), user.getCompanyLevel());
        if (assignments.isEmpty()) {
            return new ArrayList<>();
        }
        List<Long> assignmentIds = assignments.stream().map(ReportAssignment::getId).collect(Collectors.toList());
        List<Long> templateIds = assignments.stream().map(ReportAssignment::getTemplateId).distinct().collect(Collectors.toList());

        // 批量查询模板
        Map<Long, ReportTemplate> templateMap = templateIds.isEmpty() ? Collections.emptyMap()
                : templateMapper.findByIds(templateIds).stream()
                .collect(Collectors.toMap(ReportTemplate::getId, t -> t));

        // 批量查询机构（下发目标 + 发起部门）
        Set<Long> companyIds = new HashSet<>();
        for (ReportAssignment a : assignments) {
            if (a.getAssignedToCompanyId() != null) companyIds.add(a.getAssignedToCompanyId());
            if (a.getIssuerDepartmentId() != null) companyIds.add(a.getIssuerDepartmentId());
        }
        Map<Long, Company> companyMap = companyIds.isEmpty() ? Collections.emptyMap()
                : companyMapper.findByIds(new ArrayList<>(companyIds)).stream()
                .collect(Collectors.toMap(Company::getId, c -> c));

        // 批量查询发起人（仅查询需要的用户）
        Set<Long> assignedByIds = assignments.stream()
                .map(ReportAssignment::getAssignedBy)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, User> userMap = assignedByIds.isEmpty() ? Collections.emptyMap()
                : userMapper.findByIds(new ArrayList<>(assignedByIds)).stream()
                .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));

        // 批量查询每个任务的最新提交
        Map<Long, ReportSubmission> latestMap = new HashMap<>();
        List<ReportSubmission> latest = submissionMapper.findLatestByAssignmentIds(assignmentIds);
        for (ReportSubmission s : latest) {
            latestMap.put(s.getAssignmentId(), s);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (ReportAssignment a : assignments) {
            Map<String, Object> m = assignmentToMap(a);
            ReportTemplate t = templateMap.get(a.getTemplateId());
            m.put("template_name", t != null ? t.getName() : null);
            Company c = companyMap.get(a.getAssignedToCompanyId());
            m.put("company_name", c != null ? c.getName() : null);
            Company issuer = companyMap.get(a.getIssuerDepartmentId());
            m.put("issuer_department_name", issuer != null ? issuer.getName() : null);
            User assignedBy = userMap.get(a.getAssignedBy());
            m.put("assigned_by_name", assignedBy != null ? assignedBy.getDisplayName() : null);
            ReportSubmission s = latestMap.get(a.getId());
            if (s != null) {
                m.put("submission_status", s.getStatus());
                m.put("submission_version", s.getVersion());
                m.put("submission_id", s.getId());
            } else {
                m.put("submission_status", null);
                m.put("submission_version", null);
                m.put("submission_id", null);
            }
            result.add(m);
        }
        return result;
    }

    /**
     * 返回下发任务详情：验证 canReadAssignment。
     */
    public Map<String, Object> getAssignmentDetail(Long id, AuthUser user) {
        ReportAssignment a = assignmentMapper.findById(id);
        if (a == null) {
            throw new DomainException("下发任务不存在", 404);
        }
        if (!securityUtils.canReadAssignment(a)) {
            throw new DomainException("无权查看该下发任务", 403);
        }
        Map<String, Object> m = assignmentToMap(a);
        ReportTemplate t = templateMapper.findById(a.getTemplateId());
        m.put("template_name", t != null ? t.getName() : null);
        if (t != null) {
            m.put("fields", templateMapper.findFieldsByTemplateId(t.getId()).stream()
                    .map(this::fieldToMap).collect(Collectors.toList()));
        }
        Company c = companyMapper.findById(a.getAssignedToCompanyId());
        m.put("company_name", c != null ? c.getName() : null);
        Company issuer = a.getIssuerDepartmentId() == null ? null : companyMapper.findById(a.getIssuerDepartmentId());
        m.put("issuer_department_name", issuer != null ? issuer.getName() : null);
        User assignedBy = a.getAssignedBy() == null ? null : userMapper.findById(a.getAssignedBy());
        m.put("assigned_by_name", assignedBy != null ? assignedBy.getDisplayName() : null);
        ReportSubmission latest = submissionMapper.findLatestByAssignmentId(id);
        if (latest != null) {
            m.put("submission_id", latest.getId());
            m.put("submission_status", latest.getStatus());
            m.put("submission_version", latest.getVersion());
        }
        return m;
    }

    /**
     * 收回下发任务：
     * - 验证发起部门权限
     * - 状态不能是 recalled 或 aggregated
     * - 写入 assignment_recalls 审计表
     * - 更新状态为 recalled
     * - 批量拒绝相关 pending 审批记录
     */
    @Transactional
    public Map<String, Object> recallAssignment(Long id, AuthUser user, String reason) {
        ReportAssignment a = assignmentMapper.findByIdForUpdate(id);
        if (a == null) {
            throw new DomainException("下发任务不存在", 404);
        }
        if (!securityUtils.isDepartmentReportAdmin()
                || !user.getCompanyId().equals(a.getIssuerDepartmentId())) {
            throw new DomainException("无权收回该下发任务", 403);
        }
        if ("recalled".equals(a.getStatus())) {
            throw new DomainException("该任务已被收回", 409);
        }
        if ("aggregated".equals(a.getStatus())) {
            throw new DomainException("已汇总的任务不可收回", 409);
        }
        if (reason == null || reason.trim().isEmpty()) {
            throw new DomainException("收回原因不能为空", 400);
        }

        AssignmentRecall recall = new AssignmentRecall();
        recall.setAssignmentId(id);
        recall.setRecalledBy(user.getId());
        recall.setIssuerDepartmentId(a.getIssuerDepartmentId());
        recall.setReason(reason);
        aggregationMapper.insertRecall(recall);

        assignmentMapper.updateStatus(id, "recalled");

        // 批量拒绝该任务下所有提交的 pending 审批
        List<ReportSubmission> subs = submissionMapper.findByAssignmentIds(Collections.singletonList(id));
        for (ReportSubmission s : subs) {
            approvalMapper.rejectPendingApprovals(s.getId(), "任务被发起部门强制收回");
        }

        // 返回结构与前端契约匹配：{ message, assignment }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "任务已强制收回");
        result.put("assignment", assignmentToMap(assignmentMapper.findById(id)));
        return result;
    }

    // ---- helpers ----

    private Map<String, Object> assignmentToMap(ReportAssignment a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.getId());
        m.put("template_id", a.getTemplateId());
        m.put("assigned_to_company_id", a.getAssignedToCompanyId());
        m.put("title", a.getTitle());
        m.put("period_label", a.getPeriodLabel());
        m.put("is_one_time", a.getIsOneTime());
        m.put("deadline", a.getDeadline());
        m.put("status", a.getStatus());
        m.put("assigned_by", a.getAssignedBy());
        m.put("issuer_department_id", a.getIssuerDepartmentId());
        m.put("created_at", a.getCreatedAt());
        return m;
    }

    private Map<String, Object> fieldToMap(com.freereport.entity.ReportTemplateField f) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (f == null) {
            return m;
        }
        m.put("id", f.getId());
        m.put("template_id", f.getTemplateId());
        m.put("field_name", f.getFieldName());
        m.put("field_label", f.getFieldLabel());
        m.put("field_type", f.getFieldType());
        m.put("data_type", f.getDataType());
        m.put("field_config", f.getFieldConfig());
        m.put("sort_order", f.getSortOrder());
        m.put("status", f.getStatus());
        return m;
    }
}
