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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 汇总服务：按模板/周期查看汇总、按任务执行汇总、汇总历史。
 *
 * 【汇总数据一致性契约】
 * 1. 单一事实来源：report_submission_data（numeric_value 冗余列）。所有汇总数字
 *    均可由该表实时推导，任何读路径的数字都以实时计算为准。
 * 2. 实时计算路径（汇总页 / 智能问数）：getAggregationByTemplate /
 *    getAggregationsByTemplateAndPeriods 走 SQL 下沉聚合
 *    （sumNumericFieldsByTemplateAndPeriods），口径 = 各任务最新版本 + 已审批
 *    （pending_receipt / received）+ 汇总区（row_index=0）数值字段。
 * 3. 快照路径（report_aggregations 表）：仅在部门管理员手动执行 aggregateAssignment
 *    时写入（ON DUPLICATE KEY UPDATE 可重复刷新），是「某次手动汇总动作」的历史留痕，
 *    仅 getAggregationHistory 展示使用。快照不随后续退回/重报自动刷新，展示时应
 *    结合 updated_at 理解其时效性；需要最新数字请走实时路径。
 * 4. 两条路径的数值口径已对齐（最新版本过滤 + 已审批状态过滤），同一时刻对同一
 *    任务重复执行手动汇总，快照数字与实时汇总数字一致。
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
     *
     * 单周期是批量多周期版本的特例，统一走批量实现以保证口径只有一份。
     */
    public Map<String, Object> getAggregationByTemplate(Long templateId, String periodLabel, AuthUser user) {
        return getAggregationsByTemplateAndPeriods(templateId, List.of(periodLabel), user).get(periodLabel);
    }
    
    /**
     * 按模板 + 多个周期批量返回汇总数据（智能问数多周期取数用，避免逐周期 N+1）：
     * 模板/权限/字段仅加载一次，任务/提交/数据/机构/聚合全部批量查询后按周期分组组装，
     * 口径与单周期调用完全一致。返回 LinkedHashMap，键顺序与入参周期顺序一致；
     * 无任务的周期也会返回空结构（与逐周期调用行为一致）。
     */
    public Map<String, Map<String, Object>> getAggregationsByTemplateAndPeriods(
            Long templateId, List<String> periodLabels, AuthUser user) {
        ReportTemplate t = templateMapper.findById(templateId);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!securityUtils.canReadTemplate(t.getOwnerDepartmentId())) {
            throw new DomainException("无权查看该模板", 403);
        }
    
        // 周期去重且保序，避免重复周期重复取数
        List<String> periods = new ArrayList<>(new LinkedHashSet<>(periodLabels));
        Map<String, Map<String, Object>> resultByPeriod = new LinkedHashMap<>();
        if (periods.isEmpty()) {
            return resultByPeriod;
        }
    
        List<ReportAssignment> allAssignments = assignmentMapper.findByTemplateAndPeriods(templateId, periods);
        Map<String, List<ReportAssignment>> assignmentsByPeriod = allAssignments.stream()
                .collect(Collectors.groupingBy(ReportAssignment::getPeriodLabel, LinkedHashMap::new, Collectors.toList()));
        List<Long> allAssignmentIds = allAssignments.stream()
                .map(ReportAssignment::getId).collect(Collectors.toList());
    
        List<ReportTemplateField> allFields = templateMapper.findFieldsByTemplateId(templateId);
        List<ReportTemplateField> summaryFields = allFields.stream()
                .filter(f -> "summary".equals(f.getDataType()) && "active".equals(f.getStatus()))
                .collect(Collectors.toList());
        List<ReportTemplateField> detailFields = allFields.stream()
                .filter(f -> "detail".equals(f.getDataType()) && "active".equals(f.getStatus()))
                .collect(Collectors.toList());
        // 交叉表字段单独输出：其数据与明细行共用 row_index 空间，但列定义需按 field_config.matrix 分组渲染
        List<ReportTemplateField> matrixFields = allFields.stream()
                .filter(f -> "matrix".equals(f.getDataType()) && "active".equals(f.getStatus()))
                .collect(Collectors.toList());
        // 汇总指标仅统计 summary 区的数值字段（detail/matrix 的数值字段不混入汇总区）
        List<ReportTemplateField> numericFields = allFields.stream()
                .filter(f -> "summary".equals(f.getDataType()) && "number".equals(f.getFieldType())
                        && "active".equals(f.getStatus()))
                .collect(Collectors.toList());
    
        // 每个任务的最新已审批提交（跨周期一次批量查询；assignmentId 全局唯一，按任务归组天然区分周期）
        Map<Long, ReportSubmission> subMap = new HashMap<>();
        if (!allAssignmentIds.isEmpty()) {
            List<ReportSubmission> latestApproved = submissionMapper.findLatestApprovedByAssignmentIds(allAssignmentIds);
            for (ReportSubmission s : latestApproved) {
                subMap.put(s.getAssignmentId(), s);
            }
        }
        List<Long> submissionIds = subMap.values().stream()
                .map(ReportSubmission::getId).collect(Collectors.toList());
    
        // 批量查询提交数据，按 row_index 拆分为汇总值与明细行，避免多行明细同字段互相覆盖
        // summaryBySubmission: submissionId -> (fieldId -> value)，row_index = 0
        Map<Long, Map<Long, String>> summaryBySubmission = new HashMap<>();
        // detailBySubmission: submissionId -> (rowIndex -> (fieldId -> value))，row_index > 0，TreeMap 保留行序
        Map<Long, Map<Integer, Map<Long, String>>> detailBySubmission = new HashMap<>();
        if (!submissionIds.isEmpty()) {
            List<ReportSubmissionData> allData = submissionMapper.findDataBySubmissionIds(submissionIds);
            for (ReportSubmissionData d : allData) {
                if (d.getRowIndex() != null && d.getRowIndex() > 0) {
                    detailBySubmission
                            .computeIfAbsent(d.getSubmissionId(), k -> new java.util.TreeMap<>())
                            .computeIfAbsent(d.getRowIndex(), k -> new LinkedHashMap<>())
                            .put(d.getFieldId(), d.getValue());
                } else {
                    summaryBySubmission
                            .computeIfAbsent(d.getSubmissionId(), k -> new HashMap<>())
                            .put(d.getFieldId(), d.getValue());
                }
            }
        }
    
        // 批量查询机构（跨周期去重）
        List<Long> companyIds = allAssignments.stream()
                .map(ReportAssignment::getAssignedToCompanyId).distinct().collect(Collectors.toList());
        Map<Long, Company> companyMap = companyIds.isEmpty() ? Collections.emptyMap()
                : companyMapper.findByIds(companyIds).stream()
                .collect(Collectors.toMap(Company::getId, c -> c));
    
        // summary 数值总额：SQL 下沉批量聚合，按 (周期, 字段) 分组；count/average 在组装阶段按周期计算
        Map<String, Map<String, Double>> sqlTotalsByPeriod = new HashMap<>();
        if (!numericFields.isEmpty()) {
            List<Map<String, Object>> aggRows =
                    aggregationMapper.sumNumericFieldsByTemplateAndPeriods(templateId, periods);
            for (Map<String, Object> aggRow : aggRows) {
                sqlTotalsByPeriod
                        .computeIfAbsent((String) aggRow.get("periodLabel"), k -> new HashMap<>())
                        .put((String) aggRow.get("fieldName"), parseDouble(aggRow.get("total")));
            }
        }
    
        for (String period : periods) {
            resultByPeriod.put(period, assemblePeriodAggregation(t,
                    assignmentsByPeriod.getOrDefault(period, Collections.emptyList()),
                    summaryFields, detailFields, matrixFields, numericFields,
                    subMap, summaryBySubmission, detailBySubmission, companyMap,
                    sqlTotalsByPeriod.getOrDefault(period, Collections.emptyMap())));
        }
        return resultByPeriod;
    }
    
    /**
     * 组装单个周期的汇总结构（company_data / summary / detail_rows / detail_summary）。
     * 输入的 subMap / 数据索引 / 机构表为跨周期批量查询结果，按本周期任务过滤使用。
     */
    private Map<String, Object> assemblePeriodAggregation(
            ReportTemplate t, List<ReportAssignment> assignments,
            List<ReportTemplateField> summaryFields, List<ReportTemplateField> detailFields,
            List<ReportTemplateField> matrixFields, List<ReportTemplateField> numericFields,
            Map<Long, ReportSubmission> subMap,
            Map<Long, Map<Long, String>> summaryBySubmission,
            Map<Long, Map<Integer, Map<Long, String>>> detailBySubmission,
            Map<Long, Company> companyMap,
            Map<String, Double> sqlTotals) {
        // 构建 company_data 行
        List<Map<String, Object>> companyData = new ArrayList<>();
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
                Map<Long, String> submissionValues = summaryBySubmission.getOrDefault(s.getId(), Collections.emptyMap());
                for (ReportTemplateField nf : numericFields) {
                    double num = parseDouble(submissionValues.get(nf.getId()));
                    values.put(nf.getFieldName(), String.valueOf(num));
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
        // total 来自 SQL 下沉批量聚合结果（仅统计各任务最新已审批提交的 row_index=0 数据），替代 Java 循环累加；
        // count/average 语义保持不变：缺失值按 0 计入平均。
        Map<String, Object> summary = new LinkedHashMap<>();
        for (ReportTemplateField nf : numericFields) {
            double total = sqlTotals.getOrDefault(nf.getFieldName(), 0.0);
            summary.put(nf.getFieldName(), Map.of(
                    "total", total,
                    "count", submittedCount,
                    "average", submittedCount > 0 ? total / submittedCount : 0.0
            ));
        }
    
        // 明细数据行：按提交逐行展开（row_index > 0 的每一行都输出），数值列逐行累计
        // row_index 保留库内真实行号（交叉表按行号定位行选项），seq 为跨机构连续序号仅供列表展示
        List<Map<String, Object>> detailRows = new ArrayList<>();
        Map<String, Double> detailSumMap = new LinkedHashMap<>();
        for (ReportTemplateField nf : detailFields) {
            if ("number".equals(nf.getFieldType())) {
                detailSumMap.put(nf.getFieldName(), 0.0);
            }
        }
        // 交叉表数值列同样参与逐行累计（供前端交叉表合计行展示）
        for (ReportTemplateField mf : matrixFields) {
            if ("number".equals(mf.getFieldType())) {
                detailSumMap.put(mf.getFieldName(), 0.0);
            }
        }
        int detailRowCount = 0;
        for (ReportAssignment a : assignments) {
            ReportSubmission s = subMap.get(a.getId());
            if (s == null) continue;
            boolean hasSubmitted = "pending_receipt".equals(s.getStatus()) || "received".equals(s.getStatus());
            if (!hasSubmitted) continue;
            Map<Integer, Map<Long, String>> rowMap = detailBySubmission.getOrDefault(s.getId(), Collections.emptyMap());
            Company c = companyMap.get(a.getAssignedToCompanyId());
            for (Map.Entry<Integer, Map<Long, String>> entry : rowMap.entrySet()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("company_id", a.getAssignedToCompanyId());
                row.put("company_name", c != null ? c.getName() : null);
                row.put("submission_status", s.getStatus());
                row.put("row_index", entry.getKey());
                row.put("seq", ++detailRowCount);
                for (ReportTemplateField df : detailFields) {
                    String val = entry.getValue().getOrDefault(df.getId(), "");
                    row.put(df.getFieldName(), val);
                    if ("number".equals(df.getFieldType())) {
                        detailSumMap.merge(df.getFieldName(), parseDouble(val), Double::sum);
                    }
                }
                // 交叉表单元格与明细字段共用同一行，同行输出便于前端按 row_index 定位
                for (ReportTemplateField mf : matrixFields) {
                    String val = entry.getValue().getOrDefault(mf.getId(), "");
                    row.put(mf.getFieldName(), val);
                    if ("number".equals(mf.getFieldType())) {
                        detailSumMap.merge(mf.getFieldName(), parseDouble(val), Double::sum);
                    }
                }
                detailRows.add(row);
            }
        }
        // 明细汇总（含交叉表数值列）
        Map<String, Object> detailSummary = new LinkedHashMap<>();
        List<ReportTemplateField> detailSummaryFields = new ArrayList<>(detailFields);
        detailSummaryFields.addAll(matrixFields);
        for (ReportTemplateField df : detailSummaryFields) {
            if ("number".equals(df.getFieldType())) {
                double total = detailSumMap.getOrDefault(df.getFieldName(), 0.0);
                int count = Math.max(detailRowCount, 1);
                detailSummary.put(df.getFieldName(), Map.of(
                        "total", total,
                        "count", detailRowCount,
                        "average", total / count
                ));
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("template", templateToMap(t));
        result.put("summary_fields", summaryFields.stream().map(this::fieldToMap).collect(Collectors.toList()));
        result.put("detail_fields", detailFields.stream().map(this::fieldToMap).collect(Collectors.toList()));
        result.put("matrix_fields", matrixFields.stream().map(this::fieldToMap).collect(Collectors.toList()));
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

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "汇总完成");
        result.put("aggregation", aggregationToMap(aggregationMapper.findByAssignmentId(assignmentId)));
        return result;
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

        // 批量查询汇总记录（避免 N+1）
        List<Long> assignmentIds = assignments.stream().map(ReportAssignment::getId).collect(Collectors.toList());
        Map<Long, ReportAggregation> aggMap = assignmentIds.isEmpty() ? Collections.emptyMap()
                : aggregationMapper.findByAssignmentIds(assignmentIds).stream()
                .collect(Collectors.toMap(ReportAggregation::getAssignmentId, a -> a));

        List<Map<String, Object>> result = new ArrayList<>();
        for (ReportAssignment a : assignments) {
            ReportAggregation agg = aggMap.get(a.getId());
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
