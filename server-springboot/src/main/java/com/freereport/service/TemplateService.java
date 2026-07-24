package com.freereport.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.freereport.entity.Company;
import com.freereport.entity.ReportAssignment;
import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;
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

    public TemplateService(TemplateMapper templateMapper, AssignmentMapper assignmentMapper,
                           CompanyMapper companyMapper, UserMapper userMapper, ObjectMapper objectMapper) {
        this.templateMapper = templateMapper;
        this.assignmentMapper = assignmentMapper;
        this.companyMapper = companyMapper;
        this.userMapper = userMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * 返回当前用户可见的模板列表（含 field_count、assignment_count、created_by_name），批量查询避免 N+1。
     */
    public List<Map<String, Object>> getTemplatesForUser(AuthUser user) {
        List<ReportTemplate> templates = templateMapper.findForUser(
                user.getCompanyId(), user.getRole(), user.getCompanyLevel());
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
     * 返回模板详情（含字段列表与 created_by_name）。
     */
    public Map<String, Object> getTemplateDetail(Long id) {
        ReportTemplate t = templateMapper.findById(id);
        if (t == null) {
            throw new DomainException("模板不存在", 404);
        }
        Map<String, Object> m = toMap(t);
        List<ReportTemplateField> fields = templateMapper.findFieldsByTemplateId(id);
        m.put("fields", fields.stream().map(this::fieldToMap).collect(Collectors.toList()));
        User creator = userMapper.findById(t.getCreatedBy());
        m.put("created_by_name", creator != null ? creator.getDisplayName() : null);
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
        t.setDescription(description);
        t.setPeriodType(periodType);
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
        return getTemplateDetail(templateId);
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
        return getTemplateDetail(id);
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
        return getTemplateDetail(id);
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
        templateMapper.insertField(field);
        return fieldToMap(field);
    }

    /**
     * 批量新增矩阵字段：检查字段名冲突，按列生成 matrix 类型字段。
     */
    @Transactional
    public List<Map<String, Object>> addMatrixFields(AuthUser user, Long templateId,
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
                matrix.put("columnLabel", col.get("field_label"));
                config.put("matrix", matrix);
                field.setFieldConfig(toJson(config));
                field.setSortOrder(sortOrder);
                field.setStatus("active");
                templateMapper.insertField(field);
                created.add(fieldToMap(field));
                sortOrder++;
            }
        }
        return created;
    }

    /**
     * 停用模板字段。
     */
    @Transactional
    public void disableTemplateField(AuthUser user, Long templateId, Long fieldId) {
        lockWritableTemplate(user, templateId);
        List<ReportTemplateField> fields = templateMapper.findFieldsByTemplateId(templateId);
        boolean exists = fields.stream().anyMatch(f -> f.getId() != null && f.getId().equals(fieldId));
        if (!exists) {
            throw new DomainException("字段不存在", 404);
        }
        templateMapper.disableField(templateId, fieldId);
    }

    /**
     * 下发模板到目标公司：
     * - 验证模板可写、目标公司有效、不能向本部门下发
     * - 一次性下发：period_label 追加时间戳后缀，用 INSERT
     * - 常规下发：用 INSERT IGNORE 去重
     */
    @Transactional
    public List<Map<String, Object>> assignTemplate(AuthUser user, Long templateId, List<Long> companyIds,
                                                    String title, String periodLabel, LocalDate deadline,
                                                    boolean isOneTime) {
        ReportTemplate t = lockWritableTemplate(user, templateId);
        List<Map<String, Object>> created = new ArrayList<>();
        if (companyIds == null) {
            return created;
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
        return created;
    }

    // ---- helpers ----

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
        if ("draft".equals(status)) {
            throw new DomainException("草稿模板尚未发布，不能编辑或下发", 409);
        }
        if ("archived".equals(status)) {
            throw new DomainException("报表模板已停用，不能编辑或下发", 409);
        }
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
