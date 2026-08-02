package com.freereport.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.freereport.entity.Company;
import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;
import com.freereport.entity.TemplateApproval;
import com.freereport.entity.User;
import com.freereport.exception.DomainException;
import com.freereport.mapper.AssignmentMapper;
import com.freereport.mapper.CompanyMapper;
import com.freereport.mapper.TemplateMapper;
import com.freereport.mapper.UserMapper;
import com.freereport.security.AuthUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 报表模板服务：模板 CRUD、字段管理、矩阵字段、下发任务。
 */
@Service
public class TemplateService {

    private final TemplateMapper templateMapper;
    private final AssignmentMapper assignmentMapper;
    private final CompanyMapper companyMapper;
    private final UserMapper userMapper;
    private final ObjectMapper objectMapper;
    private final AiQueryContextBuilder aiQueryContextBuilder;

    public TemplateService(TemplateMapper templateMapper, AssignmentMapper assignmentMapper,
                           CompanyMapper companyMapper, UserMapper userMapper, ObjectMapper objectMapper,
                           AiQueryContextBuilder aiQueryContextBuilder) {
        this.templateMapper = templateMapper;
        this.assignmentMapper = assignmentMapper;
        this.companyMapper = companyMapper;
        this.userMapper = userMapper;
        this.objectMapper = objectMapper;
        this.aiQueryContextBuilder = aiQueryContextBuilder;
    }

    /**
     * 返回当前用户可见的模板列表（含 field_count、assignment_count、created_by_name），批量查询避免 N+1。
     */
    public List<Map<String, Object>> getTemplatesForUser(AuthUser user) {
        List<ReportTemplate> templates = templateMapper.findForUser(
                user.getCompanyId(), user.getRole(), user.getCompanyLevel());
        return enrichTemplates(templates);
    }

    /**
     * 分页返回当前用户可见的模板列表：{ data, total, page, size }。
     */
    public Map<String, Object> getTemplatesForUserPaged(AuthUser user, int page, int size) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        long total = templateMapper.countForUser(
                user.getCompanyId(), user.getRole(), user.getCompanyLevel());
        List<ReportTemplate> templates = total == 0 ? Collections.emptyList()
                : templateMapper.findForUserPaged(user.getCompanyId(), user.getRole(), user.getCompanyLevel(),
                        safeSize, (safePage - 1) * safeSize);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("data", enrichTemplates(templates));
        result.put("total", total);
        result.put("page", safePage);
        result.put("size", safeSize);
        return result;
    }

    /**
     * 批量补充 field_count、assignment_count、created_by_name，避免 N+1。
     */
    private List<Map<String, Object>> enrichTemplates(List<ReportTemplate> templates) {
        if (templates.isEmpty()) {
            return new ArrayList<>();
        }
        List<Long> templateIds = templates.stream().map(ReportTemplate::getId).collect(Collectors.toList());

        // 批量查询字段，统计每个模板的字段数
        List<ReportTemplateField> fields = templateMapper.findFieldsByTemplateIds(templateIds);
        Map<Long, Long> fieldCount = fields.stream()
                .collect(Collectors.groupingBy(ReportTemplateField::getTemplateId, Collectors.counting()));

        // 批量查询创建者（仅查询需要的用户）
        Set<Long> creatorIds = templates.stream().map(ReportTemplate::getCreatedBy).collect(Collectors.toSet());
        Map<Long, User> userMap = creatorIds.isEmpty() ? Collections.emptyMap()
                : userMapper.findByIds(new ArrayList<>(creatorIds)).stream()
                .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));

        // 批量统计每个模板的下发任务数（SQL COUNT 聚合）
        List<Map<String, Object>> assignmentCounts = assignmentMapper.countByTemplateIds(templateIds);
        Map<Long, Long> assignmentCount = new HashMap<>();
        for (Map<String, Object> row : assignmentCounts) {
            Long tid = ((Number) row.get("template_id")).longValue();
            Long cnt = ((Number) row.get("cnt")).longValue();
            assignmentCount.put(tid, cnt);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (ReportTemplate t : templates) {
            Map<String, Object> m = toMap(t);
            m.put("field_count", fieldCount.getOrDefault(t.getId(), 0L));
            m.put("assignment_count", assignmentCount.getOrDefault(t.getId(), 0L));
            User creator = userMap.get(t.getCreatedBy());
            m.put("created_by_name", creator != null ? creator.getDisplayName() : null);
            result.add(m);
        }
        return result;
    }

    /**
     * 模板详情（含字段列表、创建者姓名与下发任务数；含属主校验）：
     * 超级管理员与数智化转型办公室可看全部，部门报表管理员仅限本部门模板，
     * 其余角色（含跨部门）一律 404 防止遍历探测。
     */
    public Map<String, Object> getTemplateDetail(AuthUser user, Long id) {
        ReportTemplate t = templateMapper.findById(id);
        if (t == null || !canReadTemplate(user, t.getOwnerDepartmentId())) {
            throw new DomainException("模板不存在", 404);
        }
        return buildTemplateDetail(id);
    }

    /** 组装模板详情（无权限校验）：仅供已通过属主校验的内部流程调用 */
    private Map<String, Object> buildTemplateDetail(Long id) {
        ReportTemplate t = templateMapper.findById(id);
        Map<String, Object> m = toMap(t);
        List<ReportTemplateField> fields = templateMapper.findFieldsByTemplateId(id);
        m.put("fields", fields.stream().map(this::fieldToMap).collect(Collectors.toList()));
        User creator = userMapper.findById(t.getCreatedBy());
        m.put("created_by_name", creator != null ? creator.getDisplayName() : null);
        m.put("assignment_count", countAssignments(id));
        return m;
    }

    /**
     * 创建模板（草稿状态）及其字段。
     */
    @Transactional
    public Map<String, Object> createTemplate(AuthUser user, String name, String description,
                                               String periodType, List<Map<String, Object>> fields) {
        ReportTemplate t = new ReportTemplate();
        t.setName(name);
        t.setDescription(description != null ? description : "");
        t.setPeriodType(periodType);
        // 创建即为草稿状态：需提交数智化转型办公室审批后才能发布下发
        t.setStatus("draft");
        t.setCreatedBy(user.getId());
        t.setOwnerDepartmentId(user.getCompanyId());
        templateMapper.insertTemplate(t);
        Long templateId = t.getId();

        if (fields != null && !fields.isEmpty()) {
            List<ReportTemplateField> fieldList = new ArrayList<>();
            int idx = 0;
            for (Map<String, Object> f : fields) {
                fieldList.add(mapToField(templateId, f, idx + 1));
                idx++;
            }
            templateMapper.insertFieldsBatch(fieldList);
        }
        // 返回结构与前端契约匹配：{ template, fields }
        Map<String, Object> detail = buildTemplateDetail(templateId);
        Map<String, Object> template = new LinkedHashMap<>(detail);
        template.remove("fields");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("template", template);
        result.put("fields", detail.get("fields"));
        return result;
    }

    /**
     * 更新模板基本信息：验证模板可写（published）与部门权限。
     */
    @Transactional
    public Map<String, Object> updateTemplate(AuthUser user, Long id, Map<String, Object> updates) {
        ReportTemplate t = templateMapper.findByIdForUpdate(id);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!canManageTemplate(user, t.getOwnerDepartmentId())) {
            throw new DomainException("无权管理该模板", 404);
        }
        validateOwnerDepartmentActive(t.getOwnerDepartmentId());
        assertTemplateWritable(t.getStatus());

        String name = updates.containsKey("name") ? (String) updates.get("name") : t.getName();
        String description = updates.containsKey("description") ? (String) updates.get("description") : t.getDescription();
        String periodType = updates.containsKey("period_type") ? (String) updates.get("period_type") : t.getPeriodType();
        templateMapper.updateTemplate(id, name, description, periodType);
        return buildTemplateDetail(id);
    }

    /**
     * 启用/停用模板：draft 不支持；enabled -> published，disabled -> archived。
     */
    @Transactional
    public Map<String, Object> setTemplateEnabled(AuthUser user, Long id, boolean enabled) {
        ReportTemplate t = templateMapper.findByIdForUpdate(id);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!canManageTemplate(user, t.getOwnerDepartmentId())) {
            throw new DomainException("无权管理该模板", 404);
        }
        if ("draft".equals(t.getStatus())) {
            throw new DomainException("草稿模板不支持启用或停用操作", 409);
        }
        String status = enabled ? "published" : "archived";
        if (!status.equals(t.getStatus())) {
            templateMapper.setTemplateStatus(id, status);
        }
        // 返回结构与前端契约匹配：{ message, template }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", enabled ? "报表模板已启用" : "报表模板已停用");
        result.put("template", buildTemplateDetail(id));
        return result;
    }

    /**
     * 新增模板字段：检查字段名冲突。
     */
    @Transactional
    public Map<String, Object> addTemplateField(AuthUser user, Long templateId, Map<String, Object> fieldMap) {
        lockWritableTemplate(user, templateId);
        String fieldName = (String) fieldMap.get("field_name");
        if (fieldName != null && templateMapper.findFieldByName(templateId, fieldName) != null) {
            throw new DomainException("字段标识 \"" + fieldName + "\" 在该模板中已存在", 400);
        }
        Integer maxSort = templateMapper.findMaxSortOrder(templateId);
        int sortOrder = (maxSort != null ? maxSort : 0) + 1;
        ReportTemplateField field = mapToField(templateId, fieldMap, sortOrder);
        if (fieldMap.containsKey("sensitive")) {
            field.setSensitive(toBool(fieldMap.get("sensitive")));
        }
        templateMapper.insertField(field);
        return fieldToMap(field);
    }

    /**
     * 批量新增矩阵字段：检查字段名冲突，按列生成 matrix 类型字段。
     */
    @Transactional
    public Map<String, Object> addMatrixFields(AuthUser user, Long templateId,
                                               List<Map<String, Object>> columns, Map<String, Object> matrixConfig) {
        lockWritableTemplate(user, templateId);

        List<ReportTemplateField> existingFields = templateMapper.findFieldsByTemplateId(templateId);
        Set<String> nameSet = new HashSet<>();
        for (ReportTemplateField f : existingFields) {
            nameSet.add(f.getFieldName());
        }
        if (columns != null) {
            for (Map<String, Object> col : columns) {
                String fieldName = (String) col.get("field_name");
                if (nameSet.contains(fieldName)) {
                    throw new DomainException("字段标识 \"" + fieldName + "\" 在该模板中已存在", 400);
                }
                nameSet.add(fieldName);
            }
        }

        Integer maxSort = templateMapper.findMaxSortOrder(templateId);
        int sortOrder = (maxSort != null ? maxSort : 0) + 1;
        List<Map<String, Object>> created = new ArrayList<>();
        if (columns != null) {
            for (Map<String, Object> col : columns) {
                ReportTemplateField field = new ReportTemplateField();
                field.setTemplateId(templateId);
                field.setFieldName((String) col.get("field_name"));
                field.setFieldLabel((String) col.get("field_label"));
                field.setFieldType((String) col.get("field_type"));
                field.setDataType("matrix");
                Map<String, Object> config = new LinkedHashMap<>();
                config.put("required", true);
                Map<String, Object> matrix = new LinkedHashMap<>();
                if (matrixConfig != null) {
                    matrix.putAll(matrixConfig);
                }
                matrix.put("column_label", col.get("field_label"));
                config.put("matrix", matrix);
                field.setFieldConfig(toJson(config));
                field.setSortOrder(sortOrder);
                field.setStatus("active");
                templateMapper.insertField(field);
                created.add(fieldToMap(field));
                sortOrder++;
            }
        }
        // 返回结构与前端契约匹配：{ message, fields }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "已添加 " + created.size() + " 个矩阵字段");
        result.put("fields", created);
        return result;
    }

    /**
     * 停用模板字段：返回 { message, field } 与前端契约匹配。
     */
    @Transactional
    public Map<String, Object> disableTemplateField(AuthUser user, Long templateId, Long fieldId) {
        lockWritableTemplate(user, templateId);
        List<ReportTemplateField> fields = templateMapper.findFieldsByTemplateId(templateId);
        ReportTemplateField target = fields.stream()
                .filter(f -> f.getId() != null && f.getId().equals(fieldId))
                .findFirst().orElse(null);
        if (target == null) {
            throw new DomainException("字段不存在", 404);
        }
        templateMapper.disableField(templateId, fieldId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "字段已停用");
        result.put("field", fieldToMap(target));
        return result;
    }

    /**
     * 更新模板字段：仅设计阶段（模板从未下发）允许。
     * - field_name 修改需校验模板内唯一；data_type 不可变
     * - field_config 合并更新（required/options），交叉表列联动 column_label
     */
    @Transactional
    public Map<String, Object> updateTemplateField(AuthUser user, Long templateId, Long fieldId,
                                                   Map<String, Object> updates) {
        lockWritableTemplate(user, templateId);
        assertNoAssignmentsYet(templateId);
        List<ReportTemplateField> fields = templateMapper.findFieldsByTemplateId(templateId);
        ReportTemplateField target = fields.stream()
                .filter(f -> f.getId() != null && f.getId().equals(fieldId))
                .findFirst().orElse(null);
        if (target == null) {
            throw new DomainException("字段不存在", 404);
        }
        if (!"active".equals(target.getStatus())) {
            throw new DomainException("已停用字段不可编辑", 409);
        }

        String fieldLabel = updates.containsKey("field_label")
                ? (String) updates.get("field_label") : target.getFieldLabel();
        if (fieldLabel == null || fieldLabel.trim().isEmpty()) {
            throw new DomainException("字段显示名称不能为空", 400);
        }
        fieldLabel = fieldLabel.trim();

        String fieldName = updates.containsKey("field_name")
                ? (String) updates.get("field_name") : target.getFieldName();
        if (fieldName == null || fieldName.trim().isEmpty()) {
            throw new DomainException("字段标识不能为空", 400);
        }
        fieldName = fieldName.trim();
        if (!fieldName.equals(target.getFieldName())) {
            ReportTemplateField dup = templateMapper.findFieldByName(templateId, fieldName);
            if (dup != null && !fieldId.equals(dup.getId())) {
                throw new DomainException("字段标识 \"" + fieldName + "\" 在该模板中已存在", 400);
            }
        }

        String fieldType = updates.containsKey("field_type")
                ? (String) updates.get("field_type") : target.getFieldType();
        if (fieldType == null || fieldType.trim().isEmpty()) {
            fieldType = target.getFieldType();
        }

        // field_config 合并更新：保留既有键（如 matrix），覆盖 required/options/min/max/validation
        Map<String, Object> config = parseFieldConfig(target.getFieldConfig());
        Object payloadConfig = updates.get("field_config");
        if (payloadConfig instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> pc = (Map<String, Object>) payloadConfig;
            if (pc.containsKey("required")) {
                config.put("required", pc.get("required"));
            }
            if ("select".equals(fieldType)) {
                if (pc.get("options") != null) {
                    config.put("options", pc.get("options"));
                }
            } else {
                config.remove("options");
            }
            // min/max 仅 number 类型有效；前端未传的键（undefined 序列化丢弃）视为清除
            if ("number".equals(fieldType)) {
                if (pc.containsKey("min")) {
                    config.put("min", pc.get("min"));
                } else {
                    config.remove("min");
                }
                if (pc.containsKey("max")) {
                    config.put("max", pc.get("max"));
                } else {
                    config.remove("max");
                }
            } else {
                config.remove("min");
                config.remove("max");
            }
            if (pc.get("validation") instanceof Map && !((Map<?, ?>) pc.get("validation")).isEmpty()) {
                config.put("validation", pc.get("validation"));
            } else {
                config.remove("validation");
            }
        }
        // 交叉表列：显示名称与 column_label 联动
        Object matrix = config.get("matrix");
        if (matrix instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> matrixMap = (Map<String, Object>) matrix;
            matrixMap.put("column_label", fieldLabel);
        }

        String configJson = toJson(config);
        Boolean sensitive = updates.containsKey("sensitive") ? toBool(updates.get("sensitive")) : null;
        templateMapper.updateField(templateId, fieldId, fieldName, fieldLabel, fieldType, configJson, sensitive);
        if (sensitive != null) {
            target.setSensitive(sensitive);
            aiQueryContextBuilder.invalidateAll();
        }

        target.setFieldName(fieldName);
        target.setFieldLabel(fieldLabel);
        target.setFieldType(fieldType);
        target.setFieldConfig(configJson);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "字段已更新");
        result.put("field", fieldToMap(target));
        return result;
    }

    /**
     * 物理删除模板字段：仅设计阶段（模板从未下发）允许；下发后请使用停用。
     */
    @Transactional
    public Map<String, Object> deleteTemplateField(AuthUser user, Long templateId, Long fieldId) {
        lockWritableTemplate(user, templateId);
        assertNoAssignmentsYet(templateId);
        List<ReportTemplateField> fields = templateMapper.findFieldsByTemplateId(templateId);
        ReportTemplateField target = fields.stream()
                .filter(f -> f.getId() != null && f.getId().equals(fieldId))
                .findFirst().orElse(null);
        if (target == null) {
            throw new DomainException("字段不存在", 404);
        }
        templateMapper.deleteField(templateId, fieldId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "字段已删除");
        result.put("field", fieldToMap(target));
        return result;
    }

    /**
     * 下发模板到目标公司：
     * - 验证模板已发布（通过审批）、目标公司有效、不能向本部门下发
     * - 一次性下发：period_label 追加时间戳后缀，用 INSERT
     * - 常规下发：用 INSERT IGNORE 去重
     */
    @Transactional
    public Map<String, Object> assignTemplate(AuthUser user, Long templateId, List<Long> companyIds,
                                              String title, String periodLabel, LocalDate deadline,
                                              boolean isOneTime) {
        ReportTemplate t = lockWritableTemplate(user, templateId);
        assertTemplateAssignable(t.getStatus());
        List<Map<String, Object>> created = new ArrayList<>();
        if (companyIds == null) {
            companyIds = Collections.emptyList();
        }
        for (Long companyId : companyIds) {
            Company target = companyMapper.findById(companyId);
            if (target == null || !"active".equals(target.getStatus())
                    || (!"department".equals(target.getLevel()) && !"branch".equals(target.getLevel()))) {
                throw new DomainException("下发目标不存在或已停用", 400);
            }
            if (target.getId().equals(t.getOwnerDepartmentId())) {
                throw new DomainException("不能向本部门下发报表", 400);
            }

            ReportAssignment a = new ReportAssignment();
            a.setTemplateId(templateId);
            a.setAssignedToCompanyId(companyId);
            a.setTitle(title);
            a.setIsOneTime(isOneTime ? 1 : 0);
            a.setDeadline(deadline);
            a.setStatus("pending");
            a.setAssignedBy(user.getId());
            a.setIssuerDepartmentId(t.getOwnerDepartmentId());

            if (isOneTime) {
                a.setPeriodLabel(periodLabel + " #" + System.currentTimeMillis());
                assignmentMapper.insertAssignment(a);
                created.add(assignmentToMap(a));
            } else {
                a.setPeriodLabel(periodLabel);
                int inserted = assignmentMapper.insertAssignmentIgnore(a);
                if (inserted > 0) {
                    created.add(assignmentToMap(a));
                }
            }
        }
        // 返回结构与前端契约匹配：{ message, assignments }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "成功下发 " + created.size() + " 家机构");
        result.put("assignments", created);
        return result;
    }

    // ---- 模板审批 ----

    /**
     * 提交模板审批：draft → pending_approval，创建审批记录。
     */
    @Transactional
    public Map<String, Object> submitForApproval(AuthUser user, Long templateId) {
        ReportTemplate t = templateMapper.findByIdForUpdate(templateId);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!canManageTemplate(user, t.getOwnerDepartmentId())) {
            throw new DomainException("无权管理该模板", 404);
        }
        if (!"draft".equals(t.getStatus())) {
            throw new DomainException("仅草稿状态的模板可以提交审批", 409);
        }

        templateMapper.setTemplateStatus(templateId, "pending_approval");

        TemplateApproval approval = new TemplateApproval();
        approval.setTemplateId(templateId);
        approval.setSubmittedBy(user.getId());
        approval.setStatus("pending");
        templateMapper.insertTemplateApproval(approval);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "模板已提交审批，等待数智化转型办公室审核");
        result.put("template", buildTemplateDetail(templateId));
        return result;
    }

    /**
     * 审批通过：pending_approval → published。
     */
    @Transactional
    public Map<String, Object> approveTemplate(AuthUser user, Long templateId, String comment) {
        ReportTemplate t = templateMapper.findByIdForUpdate(templateId);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!"pending_approval".equals(t.getStatus())) {
            throw new DomainException("该模板不在待审批状态", 409);
        }

        TemplateApproval approval = templateMapper.findLatestApprovalByTemplateId(templateId);
        if (approval == null || !"pending".equals(approval.getStatus())) {
            throw new DomainException("未找到待审批记录", 404);
        }

        templateMapper.setTemplateStatus(templateId, "published");
        templateMapper.updateApprovalStatus(approval.getId(), "approved", user.getId(), comment);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "模板审批通过，已发布");
        result.put("template", buildTemplateDetail(templateId));
        return result;
    }

    /**
     * 审批驳回：pending_approval → draft。
     */
    @Transactional
    public Map<String, Object> rejectTemplate(AuthUser user, Long templateId, String comment) {
        ReportTemplate t = templateMapper.findByIdForUpdate(templateId);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!"pending_approval".equals(t.getStatus())) {
            throw new DomainException("该模板不在待审批状态", 409);
        }

        TemplateApproval approval = templateMapper.findLatestApprovalByTemplateId(templateId);
        if (approval == null || !"pending".equals(approval.getStatus())) {
            throw new DomainException("未找到待审批记录", 404);
        }

        templateMapper.setTemplateStatus(templateId, "draft");
        templateMapper.updateApprovalStatus(approval.getId(), "rejected", user.getId(), comment);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "模板已驳回");
        result.put("template", buildTemplateDetail(templateId));
        return result;
    }

    /**
     * 获取待审批模板列表（数转办视角）。
     */
    public List<TemplateApproval> getPendingApprovals() {
        return templateMapper.findPendingApprovals();
    }

    /**
     * 设置模板的 AI 问数开关（启用/禁用后该模板不再出现在智能问数白名单中）。
     */
    @Transactional
    public Map<String, Object> setAiQueryEnabled(AuthUser user, Long id, boolean enabled) {
        ReportTemplate t = templateMapper.findByIdForUpdate(id);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!canManageTemplate(user, t.getOwnerDepartmentId())) {
            throw new DomainException("无权管理该模板", 404);
        }
        templateMapper.setAiQueryEnabled(id, enabled);
        aiQueryContextBuilder.invalidateAll();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", enabled ? "已开启智能问数" : "已关闭智能问数");
        result.put("ai_query_enabled", enabled);
        return result;
    }

    /**
     * 设置字段的敏感标记：敏感字段不会暴露给智能问数上下文。
     * 与字段编辑/删除不同，标记敏感度不限制模板状态（已发布模板也可操作）。
     */
    @Transactional
    public Map<String, Object> setFieldSensitive(AuthUser user, Long templateId, Long fieldId, boolean sensitive) {
        ReportTemplate t = templateMapper.findByIdForUpdate(templateId);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!canManageTemplate(user, t.getOwnerDepartmentId())) {
            throw new DomainException("无权管理该模板", 404);
        }
        List<ReportTemplateField> fields = templateMapper.findFieldsByTemplateId(templateId);
        ReportTemplateField target = fields.stream()
                .filter(f -> f.getId() != null && f.getId().equals(fieldId))
                .findFirst().orElse(null);
        if (target == null) {
            throw new DomainException("字段不存在", 404);
        }
        // updateField SQL 用 IFNULL(#{sensitive}, sensitive)，仅更新 sensitive 列
        templateMapper.updateField(templateId, fieldId,
                target.getFieldName(), target.getFieldLabel(), target.getFieldType(),
                target.getFieldConfig(), sensitive);
        aiQueryContextBuilder.invalidateAll();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", sensitive ? "已标记为敏感字段" : "已取消敏感标记");
        result.put("field_id", fieldId);
        result.put("sensitive", sensitive);
        return result;
    }

    // ---- helpers ----

    private Boolean toBool(Object val) {
        if (val == null) return null;
        if (val instanceof Boolean) return (Boolean) val;
        return Boolean.parseBoolean(String.valueOf(val));
    }

    private ReportTemplate lockWritableTemplate(AuthUser user, Long templateId) {
        ReportTemplate t = templateMapper.findByIdForUpdate(templateId);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        if (!canManageTemplate(user, t.getOwnerDepartmentId())) {
            throw new DomainException("无权管理该模板", 404);
        }
        validateOwnerDepartmentActive(t.getOwnerDepartmentId());
        assertTemplateWritable(t.getStatus());
        return t;
    }

    private void validateOwnerDepartmentActive(Long ownerDepartmentId) {
        if (ownerDepartmentId == null) {
            return;
        }
        Company owner = companyMapper.findById(ownerDepartmentId);
        if (owner == null || !"department".equals(owner.getLevel()) || !"active".equals(owner.getStatus())) {
            throw new DomainException("模板所属部门已停用", 409);
        }
    }

    private void assertTemplateWritable(String status) {
        if ("pending_approval".equals(status)) {
            throw new DomainException("模板正在等待数智化转型办公室审批，不能编辑或下发", 409);
        }
        if ("archived".equals(status)) {
            throw new DomainException("报表模板已停用，不能编辑或下发", 409);
        }
    }

    /**
     * 统计模板的下发任务数（复用批量 COUNT 查询）。
     */
    private long countAssignments(Long templateId) {
        List<Map<String, Object>> counts = assignmentMapper.countByTemplateIds(
                Collections.singletonList(templateId));
        long total = 0;
        for (Map<String, Object> row : counts) {
            total += ((Number) row.get("cnt")).longValue();
        }
        return total;
    }

    /**
     * 设计阶段守卫：模板一旦下发过，字段即不可修改或物理删除（仅可停用），保证历史数据可溯。
     */
    private void assertNoAssignmentsYet(Long templateId) {
        if (countAssignments(templateId) > 0) {
            throw new DomainException("模板已下发，字段不可修改或删除；如需调整请使用「停用」", 409);
        }
    }

    /**
     * 解析字段配置 JSON，异常时返回空 Map。
     */
    private Map<String, Object> parseFieldConfig(String json) {
        if (json == null || json.trim().isEmpty()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private void assertTemplateAssignable(String status) {
        if (!"published".equals(status)) {
            throw new DomainException("模板尚未发布，不能下发。请先提交审批并通过", 409);
        }
    }

    private boolean canReadTemplate(AuthUser user, Long ownerDepartmentId) {
        if ("super_admin".equals(user.getRole()) || "digital_admin".equals(user.getRole())) {
            return true;
        }
        return "department_report_admin".equals(user.getRole())
                && "department".equals(user.getCompanyLevel())
                && user.getCompanyId().equals(ownerDepartmentId);
    }

    private boolean canManageTemplate(AuthUser user, Long ownerDepartmentId) {
        if ("super_admin".equals(user.getRole())) {
            return false;
        }
        return "department_report_admin".equals(user.getRole())
                && "department".equals(user.getCompanyLevel())
                && user.getCompanyId().equals(ownerDepartmentId);
    }

    private ReportTemplateField mapToField(Long templateId, Map<String, Object> f, int defaultSort) {
        ReportTemplateField field = new ReportTemplateField();
        field.setTemplateId(templateId);
        field.setFieldName((String) f.get("field_name"));
        field.setFieldLabel((String) f.get("field_label"));
        field.setFieldType((String) f.get("field_type"));
        field.setDataType(f.get("data_type") != null ? (String) f.get("data_type") : "summary");
        Object config = f.get("field_config");
        field.setFieldConfig(config != null ? toJson(config) : "{}");
        Object sort = f.get("sort_order");
        field.setSortOrder(sort != null ? ((Number) sort).intValue() : defaultSort);
        field.setStatus("active");
        return field;
    }

    private String toJson(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return "{}";
        }
    }

    private Map<String, Object> toMap(ReportTemplate t) {
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
        m.put("ai_query_enabled", t.getAiQueryEnabled());
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
        m.put("sensitive", f.getSensitive());
        return m;
    }

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
}
