package com.freereport.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.freereport.entity.Company;
import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateSchedule;
import com.freereport.exception.DomainException;
import com.freereport.mapper.AssignmentMapper;
import com.freereport.mapper.CompanyMapper;
import com.freereport.mapper.TemplateMapper;
import com.freereport.mapper.TemplateScheduleMapper;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 自动下发执行器：扫描到期的周期计划，为目标机构自动生成本期下发任务。
 * 生效条件：计划 enabled 且模板已发布（审批通过后）；本期标签未生成过且已到应下发日。
 * 去重兜底：report_assignments 的 uq_assignment_period 唯一约束（INSERT IGNORE）。
 */
@Service
public class AutoAssignService {

    private static final Logger log = LoggerFactory.getLogger(AutoAssignService.class);

    private final TemplateScheduleMapper scheduleMapper;
    private final TemplateMapper templateMapper;
    private final AssignmentMapper assignmentMapper;
    private final CompanyMapper companyMapper;
    private final PeriodLabelService periodLabelService;
    private final SecurityUtils securityUtils;
    private final ObjectMapper objectMapper;
    private final ObjectProvider<AutoAssignService> selfProvider;

    public AutoAssignService(TemplateScheduleMapper scheduleMapper, TemplateMapper templateMapper,
                             AssignmentMapper assignmentMapper, CompanyMapper companyMapper,
                             PeriodLabelService periodLabelService, SecurityUtils securityUtils,
                             ObjectMapper objectMapper, @Lazy ObjectProvider<AutoAssignService> selfProvider) {
        this.scheduleMapper = scheduleMapper;
        this.templateMapper = templateMapper;
        this.assignmentMapper = assignmentMapper;
        this.companyMapper = companyMapper;
        this.periodLabelService = periodLabelService;
        this.securityUtils = securityUtils;
        this.objectMapper = objectMapper;
        this.selfProvider = selfProvider;
    }

    /**
     * 调度入口：扫描所有已启用且模板已发布的计划。
     */
    public void runDueSchedules() {
        List<ReportTemplateSchedule> schedules = scheduleMapper.findEnabledWithPublishedTemplate();
        LocalDate today = LocalDate.now();
        AutoAssignService self = selfProvider.getObject();
        for (ReportTemplateSchedule s : schedules) {
            try {
                // 通过代理调用，保证每条计划独立事务，失败互不影响
                Map<String, Object> result = self.executeSchedule(s, today);
                log.info("auto-assign template_id={} result={}", s.getTemplateId(), result);
            } catch (Exception e) {
                log.error("auto-assign failed for template_id={}: {}", s.getTemplateId(), e.getMessage());
            }
        }
    }

    /**
     * 手动触发：立即执行指定模板的自动下发（权限：本部门报表管理员）。
     */
    @Transactional
    public Map<String, Object> runForTemplate(AuthUser user, Long templateId) {
        ReportTemplate t = templateMapper.findById(templateId);
        if (t == null || !securityUtils.canManageTemplate(t.getOwnerDepartmentId())) {
            throw new DomainException("模板不存在或无权管理", 404);
        }
        ReportTemplateSchedule s = scheduleMapper.findByTemplateId(templateId);
        if (s == null || !Integer.valueOf(1).equals(s.getEnabled())) {
            throw new DomainException("该模板未启用周期下发计划", 409);
        }
        if (!"published".equals(t.getStatus())) {
            throw new DomainException("模板发布后方可自动下发", 409);
        }
        Map<String, Object> result = executeSchedule(s, LocalDate.now());
        result.put("message", buildMessage(result));
        return result;
    }

    private String buildMessage(Map<String, Object> result) {
        Object skipped = result.get("skipped");
        if ("not_due".equals(skipped)) {
            return "本期尚未到下发时间（应下发日: " + result.get("issue_date") + "）";
        }
        if ("already_generated".equals(skipped)) {
            return "本期（" + result.get("period_label") + "）已生成过下发任务";
        }
        return "已自动下发本期（" + result.get("period_label") + "）任务至 "
                + result.get("generated") + " 家机构";
    }

    /**
     * 执行单个计划：到期且本期未生成时，为各目标机构创建本期下发任务。
     */
    @Transactional
    public Map<String, Object> executeSchedule(ReportTemplateSchedule s, LocalDate today) {
        ReportTemplate t = templateMapper.findById(s.getTemplateId());
        Map<String, Object> result = new LinkedHashMap<>();
        if (t == null || !"published".equals(t.getStatus())) {
            result.put("skipped", "template_not_published");
            return result;
        }

        String periodLabel = periodLabelService.currentPeriodLabel(t.getPeriodType(), today);
        LocalDate issueDate = periodLabelService.computeIssueDate(
                t.getPeriodType(), s.getIssueMonth(), s.getIssueDay(), today);
        result.put("period_label", periodLabel);
        result.put("issue_date", issueDate.toString());

        if (today.isBefore(issueDate)) {
            result.put("skipped", "not_due");
            return result;
        }
        if (periodLabel.equals(s.getLastPeriodLabel())) {
            result.put("skipped", "already_generated");
            return result;
        }

        List<Long> targetIds = parseCompanyIds(s.getTargetCompanyIds());
        LocalDate deadline = today.plusDays(s.getDeadlineOffsetDays() != null ? s.getDeadlineOffsetDays() : 10);
        String title = periodLabel + t.getName();
        int generated = 0;
        List<String> skippedCompanies = new ArrayList<>();

        for (Long companyId : targetIds) {
            Company target = companyMapper.findById(companyId);
            if (target == null || !"active".equals(target.getStatus())
                    || (!"branch".equals(target.getLevel()) && !"department".equals(target.getLevel()))
                    || target.getId().equals(t.getOwnerDepartmentId())) {
                skippedCompanies.add(String.valueOf(companyId));
                continue;
            }
            ReportAssignment a = new ReportAssignment();
            a.setTemplateId(t.getId());
            a.setAssignedToCompanyId(companyId);
            a.setTitle(title);
            a.setPeriodLabel(periodLabel);
            a.setIsOneTime(0);
            a.setDeadline(deadline);
            a.setStatus("pending");
            a.setAssignedBy(t.getCreatedBy());
            a.setIssuerDepartmentId(t.getOwnerDepartmentId());
            int inserted = assignmentMapper.insertAssignmentIgnore(a);
            if (inserted > 0) {
                generated++;
            } else {
                skippedCompanies.add(target.getName() + "（本期已存在）");
            }
        }

        scheduleMapper.updateLastPeriodLabel(s.getId(), periodLabel);
        result.put("generated", generated);
        result.put("skipped_companies", skippedCompanies);
        return result;
    }

    private List<Long> parseCompanyIds(String json) {
        try {
            if (json == null || json.isEmpty()) {
                return new ArrayList<>();
            }
            return objectMapper.readValue(json, new TypeReference<List<Long>>() {});
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }
}
