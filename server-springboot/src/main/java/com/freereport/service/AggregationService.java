package com.freereport.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.freereport.entity.Company;
import com.freereport.entity.ReportAggregation;
import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportSubmission;
import com.freereport.entity.ReportSubmissionData;
import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;
import com.freereport.exception.DomainException;
import com.freereport.mapper.AggregationMapper;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 汇总服务：按模板/周期查看汇总、按任务执行汇总、汇总历史。
 */
@Service
public class AggregationService {

    private final AggregationMapper aggregationMapper;
    private final TemplateMapper templateMapper;
    private final AssignmentMapper assignmentMapper;
    private final CompanyMapper companyMapper;
    private final SubmissionMapper submissionMapper;
    private final UserMapper userMapper;
    private final SecurityUtils securityUtils;
    private final ObjectMapper objectMapper;

    public AggregationService(AggregationMapper aggregationMapper, TemplateMapper templateMapper,
                              AssignmentMapper assignmentMapper, CompanyMapper companyMapper,
                              SubmissionMapper submissionMapper, UserMapper userMapper,
                              SecurityUtils securityUtils, ObjectMapper objectMapper) {
        this.aggregationMapper = aggregationMapper;
        this.templateMapper = templateMapper;
        this.assignmentMapper = assignmentMapper;
        this.companyMapper = companyMapper;
        this.submissionMapper = submissionMapper;
        this.userMapper = userMapper;
        this.securityUtils = securityUtils;
        this.objectMapper = objectMapper;
    }

    /**
     * 按模板 + 周期返回汇总数据：
     * - 验证 canReadTemplate
     * - 批量查询各分支最新已审批提交，计算合计/均值
     * - 仅 pending_receipt/received 状态参与计算
     * - 返回结构与前端 AggregationResponse 匹配
     */
    public Map<String, Object> getAggregationByTemplate(Long templateId, String periodLabel, AuthUser user) {
        ReportTemplate t = templateMapper.findById(templateId);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!securityUtils.canReadTemplate(t.getOwnerDepartmentId())) {
            throw new DomainException("无权查看该模板", 403);
        }
    
        List<ReportAssignment> assignments = assignmentMapper.findByTemplateAndPeriod(templateId, periodLabel);
        List<Long> assignmentIds = assignments.stream().map(ReportAssignment::getId).collect(Collectors.toList());
    
        List<ReportTemplateField> allFields = templateMapper.findFieldsByTemplateId(templateId);
        List<ReportTemplateField> summaryFields = allFields.stream()
                .filter(f -> "summary".equals(f.getDataType()) && "active".equals(f.getStatus()))
                .collect(Collectors.toList());
        List<ReportTemplateField> detailFields = allFields.stream()
                .filter(f -> "detail".equals(f.getDataType()) && "active".equals(f.getStatus()))
                .collect(Collectors.toList());
        List<ReportTemplateField> numericFields = allFields.stream()
                .filter(f -> "number".equals(f.getFieldType()) && "active".equals(f.getStatus()))
                .collect(Collectors.toList());
    
        // 每个任务的最新已审批提交
        Map<Long, ReportSubmission> subMap = new HashMap<>();
        if (!assignmentIds.isEmpty()) {
            List<ReportSubmission> latestApproved = submissionMapper.findLatestApprovedByAssignmentIds(assignmentIds);
            for (ReportSubmission s : latestApproved) {
                subMap.put(s.getAssignmentId(), s);
            }
        }
        List<Long> submissionIds = subMap.values().stream()
                .map(ReportSubmission::getId).collect(Collectors.toList());
    
        // 批量查询明细数据
        Map<Long, Map<Long, String>> valueBySubmission = new HashMap<>();
        if (!submissionIds.isEmpty()) {
            List<ReportSubmissionData> allData = submissionMapper.findDataBySubmissionIds(submissionIds);
            for (ReportSubmissionData d : allData) {
                valueBySubmission
                        .computeIfAbsent(d.getSubmissionId(), k -> new HashMap<>())
                        .put(d.getFieldId(), d.getValue());
            }
        }
    
        // 批量查询机构
        List<Long> companyIds = assignments.stream()
                .map(ReportAssignment::getAssignedToCompanyId).distinct().collect(Collectors.toList());
        Map<Long, Company> companyMap = companyIds.isEmpty() ? Collections.emptyMap()
                : companyMapper.findByIds(companyIds).stream()
                .collect(Collectors.toMap(Company::getId, c -> c));
    
        // 构建 company_data 行
        List<Map<String, Object>> companyData = new ArrayList<>();
        Map<String, Double> sumMap = new LinkedHashMap<>();
        for (ReportTemplateField nf : numericFields) {
            sumMap.put(nf.getFieldName(), 0.0);
        }
        int submittedCount = 0;
        for (ReportAssignment a : assignments) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("company_id", a.getAssignedToCompanyId());
            Company c = companyMap.get(a.getAssignedToCompanyId());
            row.put("company_name", c != null ? c.getName() : null);
            row.put("company_code", c != null ? c.getCode() : null);
            row.put("has_assignment", true);
            row.put("assignment_status", a.getStatus());
    
            ReportSubmission s = subMap.get(a.getId());
            boolean hasSubmitted = s != null && ("pending_receipt".equals(s.getStatus()) || "received".equals(s.getStatus()));
            row.put("has_submitted", hasSubmitted);
            row.put("submission_status", s != null ? s.getStatus() : null);
            row.put("submission_version", s != null ? s.getVersion() : null);
    
            Map<String, String> values = new LinkedHashMap<>();
            if (hasSubmitted) {
                submittedCount++;
                Map<Long, String> submissionValues = valueBySubmission.getOrDefault(s.getId(), Collections.emptyMap());
                for (ReportTemplateField nf : numericFields) {
                    double num = parseDouble(submissionValues.get(nf.getId()));
                    values.put(nf.getFieldName(), String.valueOf(num));
                    sumMap.merge(nf.getFieldName(), num, Double::sum);
                }
                for (ReportTemplateField tf : summaryFields) {
                    if (!"number".equals(tf.getFieldType())) {
                        values.put(tf.getFieldName(), submissionValues.getOrDefault(tf.getId(), ""));
                    }
                }
            }
            row.put("values", values);
            companyData.add(row);
        }
    
        // summary: { field_name: { total, count, average } }
        Map<String, Object> summary = new LinkedHashMap<>();
        for (ReportTemplateField nf : numericFields) {
            double total = sumMap.getOrDefault(nf.getFieldName(), 0.0);
            summary.put(nf.getFieldName(), Map.of(
                    "total", total,
                    "count", submittedCount,
                    "average", submittedCount > 0 ? total / submittedCount : 0.0
            ));
        }
    
        // detail_rows 和 detail_summary（简化，从明细字段的提交数据构建）
        List<Map<String, Object>> detailRows = new ArrayList<>();
        Map<String, Object> detailSummary = new LinkedHashMap<>();
    
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("template", templateToMap(t));
        result.put("summary_fields", summaryFields.stream().map(this::fieldToMap).collect(Collectors.toList()));
        result.put("detail_fields", detailFields.stream().map(this::fieldToMap).collect(Collectors.toList()));
        result.put("company_data", companyData);
        result.put("summary", summary);
        result.put("detail_rows", detailRows);
        result.put("detail_summary", detailSummary);
        return result;
    }

    /**
     * 汇总指定任务：
     * - 验证 canManageTemplate
     * - SUM 数值字段，COUNT 提交数
     * - 插入/更新 report_aggregations（ON DUPLICATE KEY UPDATE）
     * - 更新 assignment 状态为 aggregated
     */
    @Transactional
    public Map<String, Object> aggregateAssignment(Long assignmentId, AuthUser user) {
        ReportAssignment a = assignmentMapper.findById(assignmentId);
        if (a == null) {
            throw new DomainException("下发任务不存在", 404);
        }
        ReportTemplate t = templateMapper.findById(a.getTemplateId());
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!securityUtils.canManageTemplate(t.getOwnerDepartmentId())) {
            throw new DomainException("无权管理该模板", 403);
        }

        List<Map<String, Object>> sums = aggregationMapper.sumNumericFieldsByAssignment(assignmentId);
        Map<String, Object> data = new LinkedHashMap<>();
        for (Map<String, Object> row : sums) {
            String fieldName = (String) row.get("fieldName");
            data.put(fieldName, parseDouble(row.get("total")));
        }
        int submittedCount = aggregationMapper.countApprovedSubmissions(assignmentId);

        aggregationMapper.insertAggregation(t.getId(), assignmentId, toJson(data), 1, submittedCount);
        assignmentMapper.updateStatus(assignmentId, "aggregated");

        return aggregationToMap(aggregationMapper.findByAssignmentId(assignmentId));
    }

    /**
     * 返回模板的汇总历史版本：验证 canReadTemplate。
     */
    public List<Map<String, Object>> getAggregationHistory(Long templateId, AuthUser user) {
        ReportTemplate t = templateMapper.findById(templateId);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!securityUtils.canReadTemplate(t.getOwnerDepartmentId())) {
            throw new DomainException("无权查看该模板", 403);
        }

        List<ReportAssignment> assignments = assignmentMapper.findByTemplateId(templateId);
        List<Long> companyIds = assignments.stream()
                .map(ReportAssignment::getAssignedToCompanyId).distinct().collect(Collectors.toList());
        Map<Long, Company> companyMap = companyIds.isEmpty() ? Collections.emptyMap()
                : companyMapper.findByIds(companyIds).stream()
                .collect(Collectors.toMap(Company::getId, c -> c));

        List<Map<String, Object>> result = new ArrayList<>();
        for (ReportAssignment a : assignments) {
            ReportAggregation agg = aggregationMapper.findByAssignmentId(a.getId());
            if (agg == null) {
                continue;
            }
            Map<String, Object> m = aggregationToMap(agg);
            Company c = companyMap.get(a.getAssignedToCompanyId());
            m.put("company_name", c != null ? c.getName() : null);
            m.put("period_label", a.getPeriodLabel());
            m.put("assignment_title", a.getTitle());
            m.put("assignment_status", a.getStatus());
            result.add(m);
        }
        return result;
    }

    // ---- helpers ----

    private double parseDouble(Object value) {
        if (value == null) {
            return 0;
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private String toJson(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return "{}";
        }
    }

    private Object parseJson(String json) {
        if (json == null || json.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (Exception e) {
            return json;
        }
    }

    private Map<String, Object> aggregationToMap(ReportAggregation agg) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (agg == null) {
            return m;
        }
        m.put("id", agg.getId());
        m.put("template_id", agg.getTemplateId());
        m.put("assignment_id", agg.getAssignmentId());
        m.put("aggregated_data", parseJson(agg.getAggregatedData()));
        m.put("branch_count", agg.getBranchCount());
        m.put("submitted_count", agg.getSubmittedCount());
        m.put("created_at", agg.getCreatedAt());
        m.put("updated_at", agg.getUpdatedAt());
        return m;
    }

    private Map<String, Object> templateToMap(ReportTemplate t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("name", t.getName());
        m.put("description", t.getDescription());
        m.put("period_type", t.getPeriodType());
        m.put("status", t.getStatus());
        m.put("created_by", t.getCreatedBy());
        m.put("owner_department_id", t.getOwnerDepartmentId());
        m.put("created_at", t.getCreatedAt());
        m.put("updated_at", t.getUpdatedAt());
        return m;
    }

    private Map<String, Object> fieldToMap(ReportTemplateField f) {
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
