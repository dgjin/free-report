package com.freereport.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.freereport.entity.Company;
import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateSchedule;
import com.freereport.exception.DomainException;
import com.freereport.mapper.CompanyMapper;
import com.freereport.mapper.TemplateMapper;
import com.freereport.mapper.TemplateScheduleMapper;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 模板周期下发计划配置：读取与保存，含规则校验。
 * 仅 monthly/quarterly/yearly 模板可启用；目标机构须为 active 的部门/分公司且非本部门。
 */
@Service
public class TemplateScheduleService {

    private final TemplateMapper templateMapper;
    private final TemplateScheduleMapper scheduleMapper;
    private final CompanyMapper companyMapper;
    private final PeriodLabelService periodLabelService;
    private final SecurityUtils securityUtils;
    private final ObjectMapper objectMapper;

    public TemplateScheduleService(TemplateMapper templateMapper, TemplateScheduleMapper scheduleMapper,
                                   CompanyMapper companyMapper, PeriodLabelService periodLabelService,
                                   SecurityUtils securityUtils, ObjectMapper objectMapper) {
        this.templateMapper = templateMapper;
        this.scheduleMapper = scheduleMapper;
        this.companyMapper = companyMapper;
        this.periodLabelService = periodLabelService;
        this.securityUtils = securityUtils;
        this.objectMapper = objectMapper;
    }

    /**
     * 读取模板的周期计划（无计划时返回默认空配置）。
     */
    public Map<String, Object> getSchedule(AuthUser user, Long templateId) {
        ReportTemplate t = requireReadableTemplate(user, templateId);
        ReportTemplateSchedule s = scheduleMapper.findByTemplateId(templateId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("template_id", templateId);
        result.put("period_type", t.getPeriodType());
        result.put("schedulable", periodLabelService.isSchedulable(t.getPeriodType()));
        result.put("enabled", s != null && Integer.valueOf(1).equals(s.getEnabled()));
        result.put("issue_month", s != null ? s.getIssueMonth() : null);
        result.put("issue_day", s != null ? s.getIssueDay() : 5);
        result.put("deadline_offset_days", s != null ? s.getDeadlineOffsetDays() : 10);
        result.put("target_company_ids", s != null ? parseCompanyIds(s.getTargetCompanyIds()) : new ArrayList<Long>());
        result.put("last_period_label", s != null ? s.getLastPeriodLabel() : null);
        return result;
    }

    /**
     * 保存模板的周期计划（启用时做完整规则校验）。
     */
    @Transactional
    public Map<String, Object> saveSchedule(AuthUser user, Long templateId, Map<String, Object> body) {
        ReportTemplate t = requireManageableTemplate(user, templateId);

        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        int issueDay = parseInt(body.get("issue_day"), 5);
        Integer issueMonth = body.get("issue_month") == null ? null : parseInt(body.get("issue_month"), 1);
        int offsetDays = parseInt(body.get("deadline_offset_days"), 10);
        List<Long> targetIds = parseTargetIds(body.get("target_company_ids"));

        if (enabled && !periodLabelService.isSchedulable(t.getPeriodType())) {
            throw new DomainException("仅月报/季报/年报模板支持自动下发", 400);
        }
        if (issueDay < 1 || issueDay > 28) {
            throw new DomainException("下发日须在 1-28 之间", 400);
        }
        if (enabled && "yearly".equals(t.getPeriodType()) && (issueMonth == null || issueMonth < 1 || issueMonth > 12)) {
            throw new DomainException("年报模板须指定下发月份（1-12）", 400);
        }
        if (offsetDays < 1 || offsetDays > 365) {
            throw new DomainException("截止天数须在 1-365 之间", 400);
        }
        if (enabled && targetIds.isEmpty()) {
            throw new DomainException("启用自动下发须至少选择一个目标机构", 400);
        }
        validateTargetCompanies(t, targetIds);

        ReportTemplateSchedule s = new ReportTemplateSchedule();
        s.setTemplateId(templateId);
        s.setEnabled(enabled ? 1 : 0);
        s.setIssueMonth(issueMonth);
        s.setIssueDay(issueDay);
        s.setDeadlineOffsetDays(offsetDays);
        s.setTargetCompanyIds(toJson(targetIds));
        scheduleMapper.upsert(s);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", enabled ? "周期下发计划已保存并启用" : "周期下发计划已保存（未启用）");
        result.put("schedule", getSchedule(user, templateId));
        return result;
    }

    /**
     * 校验目标机构：存在、active、部门/分公司层级、非本部门。
     */
    private void validateTargetCompanies(ReportTemplate t, List<Long> targetIds) {
        if (targetIds.isEmpty()) {
            return;
        }
        List<Company> companies = companyMapper.findByIds(targetIds);
        if (companies.size() != targetIds.size()) {
            throw new DomainException("目标机构不存在或已删除", 400);
        }
        for (Company c : companies) {
            if (!"active".equals(c.getStatus())
                    || (!"branch".equals(c.getLevel()) && !"department".equals(c.getLevel()))) {
                throw new DomainException("目标机构「" + c.getName() + "」不可作为下发对象", 400);
            }
            if (c.getId().equals(t.getOwnerDepartmentId())) {
                throw new DomainException("不能向本部门下发报表", 400);
            }
        }
    }

    private ReportTemplate requireReadableTemplate(AuthUser user, Long templateId) {
        ReportTemplate t = templateMapper.findById(templateId);
        if (t == null || !securityUtils.canReadTemplate(t.getOwnerDepartmentId())) {
            throw new DomainException("模板不存在", 404);
        }
        return t;
    }

    private ReportTemplate requireManageableTemplate(AuthUser user, Long templateId) {
        ReportTemplate t = templateMapper.findById(templateId);
        if (t == null || !securityUtils.canManageTemplate(t.getOwnerDepartmentId())) {
            throw new DomainException("模板不存在或无权管理", 404);
        }
        return t;
    }

    @SuppressWarnings("unchecked")
    private List<Long> parseTargetIds(Object raw) {
        List<Long> ids = new ArrayList<>();
        if (raw instanceof List) {
            for (Object o : (List<Object>) raw) {
                if (o instanceof Number) {
                    ids.add(((Number) o).longValue());
                }
            }
        }
        return ids;
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

    private String toJson(List<Long> ids) {
        try {
            return objectMapper.writeValueAsString(ids);
        } catch (Exception e) {
            throw new DomainException("目标机构序列化失败", 500);
        }
    }

    private int parseInt(Object raw, int fallback) {
        if (raw instanceof Number) {
            return ((Number) raw).intValue();
        }
        if (raw instanceof String) {
            try {
                return Integer.parseInt((String) raw);
            } catch (NumberFormatException ignored) {
            }
        }
        return fallback;
    }
}
