package com.freereport.service;

import com.freereport.entity.Company;
import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportSubmission;
import com.freereport.entity.ReportSubmissionData;
import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;
import com.freereport.exception.DomainException;
import com.freereport.mapper.AssignmentMapper;
import com.freereport.mapper.CompanyMapper;
import com.freereport.mapper.SubmissionMapper;
import com.freereport.mapper.TemplateMapper;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 数据初始化导入：部门报表管理员按模板批量导入填报数据。
 * - archive（历史归档）：生成已签收（received）的历史数据，直接参与汇总统计；
 * - prefill（期初预填）：为已下发任务生成填报草稿，经办人打开填报页自动预填。
 * 先全量校验后单事务写入，任何行错误则整批不写入。
 */
@Service
public class DataImportService {

    private final TemplateMapper templateMapper;
    private final AssignmentMapper assignmentMapper;
    private final SubmissionMapper submissionMapper;
    private final CompanyMapper companyMapper;
    private final SecurityUtils securityUtils;
    private final ValidationService validationService;

    public DataImportService(TemplateMapper templateMapper, AssignmentMapper assignmentMapper,
                             SubmissionMapper submissionMapper, CompanyMapper companyMapper,
                             SecurityUtils securityUtils, ValidationService validationService) {
        this.templateMapper = templateMapper;
        this.assignmentMapper = assignmentMapper;
        this.submissionMapper = submissionMapper;
        this.companyMapper = companyMapper;
        this.securityUtils = securityUtils;
        this.validationService = validationService;
    }

    /**
     * 导入入口：rows 元素为 { company_code, summary: {fieldId: value}, details: [{fieldId: value}, ...] }。
     */
    @Transactional
    public Map<String, Object> importData(AuthUser user, Long templateId, String mode,
                                          String periodLabel, List<Map<String, Object>> rows) {
        ReportTemplate t = templateMapper.findById(templateId);
        if (t == null || !securityUtils.canManageTemplate(t.getOwnerDepartmentId())) {
            throw new DomainException("模板不存在或无权管理", 404);
        }
        if (!"archive".equals(mode) && !"prefill".equals(mode)) {
            throw new DomainException("导入模式须为 archive（历史归档）或 prefill（期初预填）", 400);
        }
        if (periodLabel == null || periodLabel.trim().isEmpty()) {
            throw new DomainException("请指定数据所属周期标签", 400);
        }
        periodLabel = periodLabel.trim();
        if (rows == null || rows.isEmpty()) {
            throw new DomainException("导入数据为空", 400);
        }

        List<ReportTemplateField> templateFields = templateMapper.findFieldsByTemplateId(templateId);
        Set<Long> validFieldIds = templateFields.stream()
                .map(ReportTemplateField::getId).collect(Collectors.toSet());

        // ---- 全量校验（不写入） ----
        List<Map<String, Object>> errors = new ArrayList<>();
        List<PreparedRow> prepared = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            int rowNo = i + 1;
            String companyCode = row.get("company_code") == null ? "" : String.valueOf(row.get("company_code")).trim();
            Map<String, Object> summary = asMap(row.get("summary"));
            List<Map<String, Object>> details = asMapList(row.get("details"));

            String error = validateRow(t, mode, periodLabel, companyCode, summary, details, validFieldIds, templateFields);
            if (error != null) {
                errors.add(errorItem(rowNo, companyCode, error));
                continue;
            }
            Company company = companyMapper.findByCode(companyCode);
            prepared.add(new PreparedRow(rowNo, company, summary, details));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        if (!errors.isEmpty()) {
            result.put("message", "校验失败，未写入任何数据，请修正后重新导入");
            result.put("imported", 0);
            result.put("errors", errors);
            return result;
        }

        // ---- 写入 ----
        int imported = 0;
        for (PreparedRow p : prepared) {
            if ("archive".equals(mode)) {
                writeArchiveRow(user, t, periodLabel, p);
            } else {
                writePrefillRow(user, t, periodLabel, p);
            }
            imported++;
        }
        result.put("message", "成功导入 " + imported + " 家机构数据（"
                + ("archive".equals(mode) ? "历史归档" : "期初预填") + "）");
        result.put("imported", imported);
        result.put("errors", errors);
        return result;
    }

    /**
     * 行级校验：公司合法性、字段归属、值校验、目标状态可写。返回错误原因，合法返回 null。
     */
    private String validateRow(ReportTemplate t, String mode, String periodLabel, String companyCode,
                               Map<String, Object> summary, List<Map<String, Object>> details,
                               Set<Long> validFieldIds, List<ReportTemplateField> templateFields) {
        if (companyCode.isEmpty()) {
            return "缺少分公司编码";
        }
        Company company = companyMapper.findByCode(companyCode);
        if (company == null || !"active".equals(company.getStatus())) {
            return "分公司编码不存在或已停用: " + companyCode;
        }
        if (!"branch".equals(company.getLevel()) && !"department".equals(company.getLevel())) {
            return "目标机构层级不可填报: " + companyCode;
        }
        if (company.getId().equals(t.getOwnerDepartmentId())) {
            return "不能导入本部门数据";
        }
        String fieldError = validateFields(summary, details, validFieldIds);
        if (fieldError != null) {
            return fieldError;
        }
        // 值校验：archive 按提交标准全量（必填/单值/跨字段），prefill 仅类型/范围
        List<String> valueErrors = "archive".equals(mode)
                ? validationService.validateSubmissionData(templateFields, summary, details)
                : validationService.validateValuesOnly(templateFields, summary, details);
        if (!valueErrors.isEmpty()) {
            return String.join("；", valueErrors);
        }

        ReportAssignment assignment = findAssignment(t.getId(), company.getId(), periodLabel);
        if ("archive".equals(mode)) {
            if (assignment != null) {
                ReportSubmission latest = submissionMapper.findLatestByAssignmentId(assignment.getId());
                if (latest != null) {
                    return "该机构本期已有填报记录，不可重复归档";
                }
            }
        } else {
            if (assignment == null) {
                return "该机构本期尚未下发任务，请先下发";
            }
            ReportSubmission latest = submissionMapper.findLatestByAssignmentId(assignment.getId());
            if (latest != null && !isWritableDraftStatus(latest.getStatus())) {
                return "该机构已有提交中的填报数据，无法预填";
            }
        }
        return null;
    }

    private String validateFields(Map<String, Object> summary, List<Map<String, Object>> details,
                                  Set<Long> validFieldIds) {
        Set<Long> used = new HashSet<>();
        collectFieldIds(summary, used);
        if (details != null) {
            for (Map<String, Object> row : details) {
                collectFieldIds(row, used);
            }
        }
        for (Long fid : used) {
            if (!validFieldIds.contains(fid)) {
                return "字段 ID " + fid + " 不属于该模板";
            }
        }
        if (used.isEmpty()) {
            return "数据行为空";
        }
        return null;
    }

    private void collectFieldIds(Map<String, Object> values, Set<Long> out) {
        if (values == null) {
            return;
        }
        for (String key : values.keySet()) {
            try {
                out.add(Long.parseLong(key));
            } catch (NumberFormatException e) {
                throw new DomainException("字段键非法: " + key, 400);
            }
        }
    }

    private boolean isWritableDraftStatus(String status) {
        return "draft".equals(status) || "rejected".equals(status) || "returned".equals(status);
    }

    private ReportAssignment findAssignment(Long templateId, Long companyId, String periodLabel) {
        return assignmentMapper.findByTemplateAndPeriod(templateId, periodLabel).stream()
                .filter(a -> a.getAssignedToCompanyId().equals(companyId))
                .findFirst().orElse(null);
    }

    // ---- archive：生成已签收历史数据 ----

    private void writeArchiveRow(AuthUser user, ReportTemplate t, String periodLabel, PreparedRow p) {
        ReportAssignment assignment = findAssignment(t.getId(), p.company.getId(), periodLabel);
        if (assignment == null) {
            assignment = new ReportAssignment();
            assignment.setTemplateId(t.getId());
            assignment.setAssignedToCompanyId(p.company.getId());
            assignment.setTitle(periodLabel + t.getName());
            assignment.setPeriodLabel(periodLabel);
            assignment.setIsOneTime(0);
            assignment.setDeadline(LocalDate.now());
            assignment.setStatus("received");
            assignment.setAssignedBy(user.getId());
            assignment.setIssuerDepartmentId(t.getOwnerDepartmentId());
            int inserted = assignmentMapper.insertAssignmentIgnore(assignment);
            if (inserted == 0) {
                assignment = findAssignment(t.getId(), p.company.getId(), periodLabel);
            }
        } else if (!"received".equals(assignment.getStatus())) {
            assignmentMapper.updateStatus(assignment.getId(), "received");
        }

        ReportSubmission s = new ReportSubmission();
        s.setAssignmentId(assignment.getId());
        s.setVersion(1);
        s.setSubmittedByCompanyId(p.company.getId());
        s.setSubmittedBy(user.getId());
        s.setStatus("received");
        s.setComment("历史数据导入");
        s.setSubmittedAt(LocalDateTime.now());
        submissionMapper.insertSubmission(s);
        writeData(s.getId(), p);
    }

    // ---- prefill：生成/覆盖填报草稿 ----

    private void writePrefillRow(AuthUser user, ReportTemplate t, String periodLabel, PreparedRow p) {
        ReportAssignment assignment = findAssignment(t.getId(), p.company.getId(), periodLabel);
        ReportSubmission latest = submissionMapper.findLatestByAssignmentId(assignment.getId());

        ReportSubmission target;
        if (latest == null) {
            target = new ReportSubmission();
            target.setAssignmentId(assignment.getId());
            target.setVersion(1);
            target.setStatus("draft");
            target.setSubmittedByCompanyId(p.company.getId());
            target.setSubmittedBy(user.getId());
            target.setComment("期初数据预填");
            submissionMapper.insertSubmission(target);
        } else if ("draft".equals(latest.getStatus())) {
            target = latest;
            submissionMapper.deleteSubmissionData(latest.getId());
        } else {
            // rejected / returned：按既有版本机制新建一版草稿
            target = new ReportSubmission();
            target.setAssignmentId(assignment.getId());
            target.setVersion((latest.getVersion() == null ? 1 : latest.getVersion()) + 1);
            target.setStatus("draft");
            target.setSubmittedByCompanyId(p.company.getId());
            target.setSubmittedBy(user.getId());
            target.setComment("期初数据预填");
            submissionMapper.insertSubmission(target);
        }
        writeData(target.getId(), p);
        if (!"filling".equals(assignment.getStatus())) {
            assignmentMapper.updateStatus(assignment.getId(), "filling");
        }
    }

    /**
     * 写入 submission_data：summary 为 row_index=0，details 逐行 row_index 从 1 递增。
     */
    private void writeData(Long submissionId, PreparedRow p) {
        List<ReportSubmissionData> dataList = new ArrayList<>();
        if (p.summary != null) {
            for (Map.Entry<String, Object> e : p.summary.entrySet()) {
                ReportSubmissionData d = new ReportSubmissionData();
                d.setSubmissionId(submissionId);
                d.setFieldId(Long.parseLong(e.getKey()));
                d.setRowIndex(0);
                d.setValue(e.getValue() != null ? String.valueOf(e.getValue()) : "");
                dataList.add(d);
            }
        }
        if (p.details != null) {
            for (int i = 0; i < p.details.size(); i++) {
                for (Map.Entry<String, Object> e : p.details.get(i).entrySet()) {
                    ReportSubmissionData d = new ReportSubmissionData();
                    d.setSubmissionId(submissionId);
                    d.setFieldId(Long.parseLong(e.getKey()));
                    d.setRowIndex(i + 1);
                    d.setValue(e.getValue() != null ? String.valueOf(e.getValue()) : "");
                    dataList.add(d);
                }
            }
        }
        if (!dataList.isEmpty()) {
            submissionMapper.insertSubmissionDataBatch(dataList);
        }
    }

    private Map<String, Object> errorItem(int row, String companyCode, String reason) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("row", row);
        item.put("company_code", companyCode);
        item.put("reason", reason);
        return item;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object raw) {
        return raw instanceof Map ? (Map<String, Object>) raw : null;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> asMapList(Object raw) {
        if (!(raw instanceof List)) {
            return null;
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : (List<Object>) raw) {
            if (o instanceof Map) {
                out.add((Map<String, Object>) o);
            }
        }
        return out;
    }

    private static class PreparedRow {
        final int rowNo;
        final Company company;
        final Map<String, Object> summary;
        final List<Map<String, Object>> details;

        PreparedRow(int rowNo, Company company, Map<String, Object> summary, List<Map<String, Object>> details) {
            this.rowNo = rowNo;
            this.company = company;
            this.summary = summary;
            this.details = details;
        }
    }
}
