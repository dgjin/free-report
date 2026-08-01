package com.freereport.service;

import com.freereport.entity.ApprovalRecord;
import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportSubmission;
import com.freereport.entity.ReportSubmissionData;
import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;
import com.freereport.entity.User;
import com.freereport.exception.DomainException;
import com.freereport.mapper.ApprovalMapper;
import com.freereport.mapper.AssignmentMapper;
import com.freereport.mapper.CompanyMapper;
import com.freereport.mapper.SubmissionMapper;
import com.freereport.mapper.TemplateMapper;
import com.freereport.mapper.UserMapper;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * 填报服务：创建/更新填报（含三级审批流程）、详情查询、提交草稿。
 */
@Service
public class SubmissionService {

    private final SubmissionMapper submissionMapper;
    private final AssignmentMapper assignmentMapper;
    private final TemplateMapper templateMapper;
    private final ApprovalMapper approvalMapper;
    private final UserMapper userMapper;
    private final CompanyMapper companyMapper;
    private final SecurityUtils securityUtils;
    private final ObjectMapper objectMapper;
    private final ValidationService validationService;
    private final SubmissionWorkflow submissionWorkflow;

    public SubmissionService(SubmissionMapper submissionMapper, AssignmentMapper assignmentMapper,
                             TemplateMapper templateMapper, ApprovalMapper approvalMapper, UserMapper userMapper,
                             CompanyMapper companyMapper, SecurityUtils securityUtils, ObjectMapper objectMapper,
                             ValidationService validationService, SubmissionWorkflow submissionWorkflow) {
        this.submissionMapper = submissionMapper;
        this.assignmentMapper = assignmentMapper;
        this.templateMapper = templateMapper;
        this.approvalMapper = approvalMapper;
        this.userMapper = userMapper;
        this.companyMapper = companyMapper;
        this.securityUtils = securityUtils;
        this.objectMapper = objectMapper;
        this.validationService = validationService;
        this.submissionWorkflow = submissionWorkflow;
    }

    /**
     * 创建或更新填报，完整实现三级审批流程：
     * - 验证权限（handler/branch_admin/department_report_admin 且公司匹配）
     * - 状态流转（可写判断/目标状态/版本演化）由 {@link SubmissionWorkflow} 集中决策
     * - submit 时查找 reviewer：有 -> pending_review，无 -> pending_receipt
     * - 清理旧数据并插入新数据
     * - 更新 assignment 状态，必要时创建审批记录
     */
    @Transactional
    public Map<String, Object> createOrUpdateSubmission(AuthUser user, Long assignmentId,
                                                        Map<String, Object> summary, List<Map<String, Object>> details,
                                                        String comment, boolean isSubmit) {
        ReportAssignment assignment = assignmentMapper.findById(assignmentId);
        if (assignment == null) {
            throw new DomainException("下发任务不存在", 404);
        }
        User u = userMapper.findById(user.getId());
        if (u == null || !"active".equals(u.getStatus())
                || !u.getCompanyId().equals(user.getCompanyId())
                || !assignment.getAssignedToCompanyId().equals(user.getCompanyId())
                || (!"handler".equals(u.getRole()) && !"branch_admin".equals(u.getRole())
                    && !"department_report_admin".equals(u.getRole()))) {
            throw new DomainException("你无权填写该任务", 403);
        }

        ReportSubmission existing = submissionMapper.findLatestByAssignmentIdForUpdate(assignmentId);
        if (!submissionWorkflow.canWrite(existing)) {
            throw new DomainException("该报表已提交，不能重复保存或提交，请刷新页面查看最新状态", 409);
        }

        // 提交时兜底强校验（草稿不校验）：必填、单值、跨字段规则
        if (isSubmit) {
            List<ReportTemplateField> templateFields = templateMapper.findFieldsByTemplateId(assignment.getTemplateId());
            List<String> validationErrors = validationService.validateSubmissionData(templateFields, summary, details);
            if (!validationErrors.isEmpty()) {
                String joined = String.join("；", validationErrors.subList(0, Math.min(5, validationErrors.size())));
                String suffix = validationErrors.size() > 5 ? " 等共 " + validationErrors.size() + " 项" : "";
                throw new DomainException("提交校验未通过：" + joined + suffix, 400);
            }
        }

        // 三级审批：submit 时查找公司内的复核人，目标状态由状态机决策
        User reviewer = isSubmit ? approvalMapper.findReviewer(user.getCompanyId()) : null;
        SubmissionWorkflow.SaveTransition transition = submissionWorkflow.onSave(isSubmit, reviewer != null);

        Long submissionId;
        if (submissionWorkflow.shouldUpdateInPlace(existing)) {
            // 草稿状态：更新现有记录
            submissionId = existing.getId();
            submissionMapper.updateSubmissionStatus(submissionId, user.getId(), user.getCompanyId(),
                    transition.submissionStatus(), comment, isSubmit ? LocalDateTime.now() : null);
            submissionMapper.deleteSubmissionData(submissionId);
        } else {
            // 防御性清理：上一版本若是 rejected/returned，关闭其遗留 pending 审批
            if (submissionWorkflow.shouldClosePendingApprovals(existing)) {
                approvalMapper.rejectPendingApprovals(existing.getId(), "版本过期（重新提交）");
            }
            ReportSubmission sub = new ReportSubmission();
            sub.setAssignmentId(assignmentId);
            sub.setVersion(submissionWorkflow.nextVersion(existing));
            sub.setSubmittedByCompanyId(user.getCompanyId());
            sub.setSubmittedBy(user.getId());
            sub.setStatus(transition.submissionStatus());
            sub.setComment(comment);
            sub.setSubmittedAt(isSubmit ? LocalDateTime.now() : null);
            submissionMapper.insertSubmission(sub);
            submissionId = sub.getId();
        }

        // 写入明细数据：row_index=0 为汇总，>0 为明细行
        List<ReportSubmissionData> dataList = new ArrayList<>();
        if (summary != null) {
            for (Map.Entry<String, Object> e : summary.entrySet()) {
                ReportSubmissionData d = new ReportSubmissionData();
                d.setSubmissionId(submissionId);
                d.setFieldId(parseFieldId(e.getKey()));
                d.setRowIndex(0);
                d.setValue(e.getValue() != null ? String.valueOf(e.getValue()) : "");
                dataList.add(d);
            }
        }
        if (details != null) {
            for (int i = 0; i < details.size(); i++) {
                Map<String, Object> row = details.get(i);
                if (row == null) {
                    continue;
                }
                for (Map.Entry<String, Object> e : row.entrySet()) {
                    ReportSubmissionData d = new ReportSubmissionData();
                    d.setSubmissionId(submissionId);
                    d.setFieldId(parseFieldId(e.getKey()));
                    d.setRowIndex(i + 1);
                    d.setValue(e.getValue() != null ? String.valueOf(e.getValue()) : "");
                    dataList.add(d);
                }
            }
        }
        if (!dataList.isEmpty()) {
            submissionMapper.insertSubmissionDataBatch(dataList);
        }

        assignmentMapper.updateStatus(assignmentId, transition.assignmentStatus());

        // submit 且存在复核人时，创建复核审批记录
        List<Map<String, Object>> approvals = new ArrayList<>();
        if (isSubmit && reviewer != null) {
            ApprovalRecord rec = new ApprovalRecord();
            rec.setSubmissionId(submissionId);
            rec.setApprovalLevel("reviewer");
            rec.setApproverId(reviewer.getId());
            rec.setStatus("pending");
            rec.setComment("待复核");
            approvalMapper.insertApproval(rec);
            approvals.add(approvalToMap(rec));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", isSubmit ? "提交成功，报表已发送至下发部门等待签收。" : "草稿已保存");
        result.put("submission", submissionToMap(submissionMapper.findById(submissionId)));
        result.put("approvals", approvals);
        return result;
    }

    /**
     * 返回填报详情：验证 canReadAssignment，解析 summary/details，批量查审批人信息。
     */
    public Map<String, Object> getSubmissionDetail(Long id, AuthUser user) {
        ReportSubmission s = submissionMapper.findById(id);
        if (s == null) {
            throw new DomainException("填报记录不存在", 404);
        }
        ReportAssignment a = assignmentMapper.findById(s.getAssignmentId());
        if (a == null) {
            throw new DomainException("下发任务不存在", 404);
        }
        if (!securityUtils.canReadAssignment(a)) {
            throw new DomainException("无权查看该填报", 403);
        }

        List<ReportSubmissionData> dataList = submissionMapper.findDataBySubmissionId(id);
        Map<String, String> summary = new LinkedHashMap<>();
        TreeMap<Integer, Map<String, String>> detailRows = new TreeMap<>();
        for (ReportSubmissionData d : dataList) {
            String key = String.valueOf(d.getFieldId());
            int row = d.getRowIndex() == null ? 0 : d.getRowIndex();
            if (row == 0) {
                summary.put(key, d.getValue());
            } else {
                detailRows.computeIfAbsent(row, k -> new LinkedHashMap<>()).put(key, d.getValue());
            }
        }
        // 保留行位置：中间空行补空 Map，避免回显时行错位（如交叉表只填部分行）
        List<Map<String, String>> details = new ArrayList<>();
        if (!detailRows.isEmpty()) {
            int maxRow = detailRows.lastKey();
            for (int r = 1; r <= maxRow; r++) {
                details.add(detailRows.getOrDefault(r, new LinkedHashMap<>()));
            }
        }

        // 查询字段元数据（field_name, field_label, field_type）
        List<ReportTemplateField> templateFields = templateMapper.findFieldsByTemplateId(a.getTemplateId());
        Map<Long, ReportTemplateField> fieldMetaMap = templateFields.stream()
                .collect(Collectors.toMap(ReportTemplateField::getId, f -> f, (x, y) -> x));

        // 将 summary 从 fieldId->value 转换为带元数据的列表
        List<Map<String, Object>> enrichedSummary = new ArrayList<>();
        for (Map.Entry<String, String> e : summary.entrySet()) {
            Long fieldId = Long.parseLong(e.getKey());
            ReportTemplateField field = fieldMetaMap.get(fieldId);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("field_id", fieldId);
            item.put("field_name", field != null ? field.getFieldName() : null);
            item.put("field_label", field != null ? field.getFieldLabel() : null);
            item.put("field_type", field != null ? field.getFieldType() : null);
            item.put("data_type", field != null ? field.getDataType() : null);
            item.put("value", e.getValue());
            item.put("row_index", 0);
            enrichedSummary.add(item);
        }

        // 将 details 行转为带元数据的列表
        List<List<Map<String, Object>>> enrichedDetails = new ArrayList<>();
        for (int rowIdx = 0; rowIdx < details.size(); rowIdx++) {
            Map<String, String> row = details.get(rowIdx);
            List<Map<String, Object>> enrichedRow = new ArrayList<>();
            for (Map.Entry<String, String> e : row.entrySet()) {
                Long fieldId = Long.parseLong(e.getKey());
                ReportTemplateField field = fieldMetaMap.get(fieldId);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("field_id", fieldId);
                item.put("field_name", field != null ? field.getFieldName() : null);
                item.put("field_label", field != null ? field.getFieldLabel() : null);
                item.put("data_type", field != null ? field.getDataType() : null);
                item.put("value", e.getValue());
                item.put("row_index", rowIdx + 1);
                enrichedRow.add(item);
            }
            enrichedDetails.add(enrichedRow);
        }

        // 批量查询审批人信息（单次查询）
        List<ApprovalRecord> records = approvalMapper.findBySubmissionId(id);
        Set<Long> approverIds = records.stream()
                .map(ApprovalRecord::getApproverId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, User> userMap = approverIds.isEmpty() ? Collections.emptyMap()
                : userMapper.findByIds(new ArrayList<>(approverIds)).stream()
                .collect(Collectors.toMap(User::getId, uu -> uu, (x, y) -> x));
        List<Map<String, Object>> approvalMaps = new ArrayList<>();
        for (ApprovalRecord r : records) {
            Map<String, Object> m = approvalToMap(r);
            User approver = userMap.get(r.getApproverId());
            m.put("approver_name", approver != null ? approver.getDisplayName() : null);
            approvalMaps.add(m);
        }

        Map<String, Object> result = submissionToMap(s);
        result.put("summary", enrichedSummary);
        result.put("details", enrichedDetails);
        result.put("approvals", approvalMaps);
        result.put("matrix_groups", buildMatrixGroups(templateFields));
        // 附加任务与模板信息
        result.put("assignment_title", a.getTitle());
        ReportTemplate template = templateMapper.findById(a.getTemplateId());
        result.put("template_name", template != null ? template.getName() : null);
        return result;
    }

    /**
     * 返回指定任务的最新填报完整详情（含 summary/details/approvals），无则返回 null。
     * 复用 getSubmissionDetail 保证回显数据完整。
     */
    public Map<String, Object> getSubmissionByAssignment(Long assignmentId, AuthUser user) {
        ReportAssignment a = assignmentMapper.findById(assignmentId);
        if (a == null) {
            throw new DomainException("下发任务不存在", 404);
        }
        if (!securityUtils.canReadAssignment(a)) {
            throw new DomainException("无权查看该填报", 403);
        }
        ReportSubmission s = submissionMapper.findLatestByAssignmentId(assignmentId);
        return s == null ? null : getSubmissionDetail(s.getId(), user);
    }

    /**
     * 提交已存在的草稿：重新组装数据后调用 createOrUpdateSubmission(isSubmit=true)。
     */
    @Transactional
    public Map<String, Object> submitExistingDraft(Long id, AuthUser user, String comment) {
        ReportSubmission s = submissionMapper.findById(id);
        if (s == null) {
            throw new DomainException("填报记录不存在", 404);
        }
        if (!"draft".equals(s.getStatus())) {
            throw new DomainException("仅草稿状态可提交", 409);
        }
        List<ReportSubmissionData> dataList = submissionMapper.findDataBySubmissionId(id);
        Map<String, Object> summary = new LinkedHashMap<>();
        Map<Integer, Map<String, Object>> detailRows = new TreeMap<>();
        for (ReportSubmissionData d : dataList) {
            String key = String.valueOf(d.getFieldId());
            int row = d.getRowIndex() == null ? 0 : d.getRowIndex();
            if (row == 0) {
                summary.put(key, d.getValue());
            } else {
                detailRows.computeIfAbsent(row, k -> new LinkedHashMap<>()).put(key, d.getValue());
            }
        }
        List<Map<String, Object>> details = new ArrayList<>(detailRows.values());
        return createOrUpdateSubmission(user, s.getAssignmentId(), summary, details, comment, true);
    }

    // ---- helpers ----

    /**
     * 组装矩阵分组：按 field_config.matrix.row_label 分组 active 的 matrix 字段，
     * 供复核/签收视图重建交叉表结构（行表头 = row_label + row_options）。
     */
    private List<Map<String, Object>> buildMatrixGroups(List<ReportTemplateField> templateFields) {
        Map<String, Map<String, Object>> groupMap = new LinkedHashMap<>();
        for (ReportTemplateField f : templateFields) {
            if (!"matrix".equals(f.getDataType()) || !"active".equals(f.getStatus())) {
                continue;
            }
            Map<String, Object> config = parseJsonMap(f.getFieldConfig());
            Object matrixObj = config.get("matrix");
            if (!(matrixObj instanceof Map)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> matrix = (Map<String, Object>) matrixObj;
            Object rowLabel = matrix.get("row_label");
            if (rowLabel == null) {
                continue;
            }
            String key = String.valueOf(rowLabel);
            Map<String, Object> group = groupMap.computeIfAbsent(key, k -> {
                Map<String, Object> g = new LinkedHashMap<>();
                g.put("row_label", key);
                Object rowOptions = matrix.get("row_options");
                g.put("row_options", rowOptions != null ? rowOptions : Collections.emptyList());
                g.put("columns", new ArrayList<Map<String, Object>>());
                return g;
            });
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> columns = (List<Map<String, Object>>) group.get("columns");
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("field_id", f.getId());
            col.put("field_label", f.getFieldLabel());
            col.put("field_type", f.getFieldType());
            columns.add(col);
        }
        return new ArrayList<>(groupMap.values());
    }

    private Map<String, Object> parseJsonMap(String json) {
        if (json == null || json.isEmpty()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    private Long parseFieldId(Object key) {
        if (key == null) {
            throw new DomainException("字段标识缺失", 400);
        }
        try {
            return Long.valueOf(key.toString());
        } catch (NumberFormatException e) {
            throw new DomainException("字段标识无效：" + key, 400);
        }
    }

    private Map<String, Object> submissionToMap(ReportSubmission s) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (s == null) {
            return m;
        }
        m.put("id", s.getId());
        m.put("assignment_id", s.getAssignmentId());
        m.put("version", s.getVersion());
        m.put("submitted_by_company_id", s.getSubmittedByCompanyId());
        m.put("submitted_by", s.getSubmittedBy());
        m.put("status", s.getStatus());
        m.put("comment", s.getComment());
        m.put("submitted_at", s.getSubmittedAt());
        m.put("created_at", s.getCreatedAt());
        return m;
    }

    private Map<String, Object> approvalToMap(ApprovalRecord r) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (r == null) {
            return m;
        }
        m.put("id", r.getId());
        m.put("submission_id", r.getSubmissionId());
        m.put("approval_level", r.getApprovalLevel());
        m.put("approver_id", r.getApproverId());
        m.put("status", r.getStatus());
        m.put("comment", r.getComment());
        m.put("created_at", r.getCreatedAt());
        m.put("updated_at", r.getUpdatedAt());
        return m;
    }
}
