package com.freereport.controller;

import com.freereport.dto.AssignTemplateRequest;
import com.freereport.dto.CreateTemplateRequest;
import com.freereport.entity.TemplateApproval;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.AutoAssignService;
import com.freereport.service.TemplateScheduleService;
import com.freereport.service.TemplateService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 报表模板控制器。
 * 提供模板的 CRUD、字段管理、下发、审批、定时下发配置等完整的模板生命周期接口。
 * 写操作仅限部门报表管理员及以上角色。
 */
@RestController
@RequestMapping("/api/templates")
public class TemplateController {

    private final TemplateService templateService;
    private final TemplateScheduleService templateScheduleService;
    private final AutoAssignService autoAssignService;
    private final SecurityUtils securityUtils;

    public TemplateController(TemplateService templateService, TemplateScheduleService templateScheduleService,
                              AutoAssignService autoAssignService, SecurityUtils securityUtils) {
        this.templateService = templateService;
        this.templateScheduleService = templateScheduleService;
        this.autoAssignService = autoAssignService;
        this.securityUtils = securityUtils;
    }

    /**
     * 模板列表：传 page/size 时返回分页封装 { data, total, page, size }，否则返回完整数组（兼容旧调用）。
     */
    @GetMapping
    public Object listTemplates(@RequestParam(required = false) Integer page,
                                @RequestParam(required = false) Integer size) {
        AuthUser user = securityUtils.getCurrentUser();
        if (page != null && size != null) {
            return templateService.getTemplatesForUserPaged(user, page, size);
        }
        return templateService.getTemplatesForUser(user);
    }

    /** 查看模板详情，包含字段列表和模板配置信息 */
    @GetMapping("/{id}")
    public Map<String, Object> getTemplateDetail(@PathVariable Long id) {
        AuthUser user = securityUtils.getCurrentUser();
        return templateService.getTemplateDetail(user, id);
    }

    /** 创建新报表模板（仅部门报表管理员） */
    @PostMapping
    public Map<String, Object> createTemplate(@Valid @RequestBody CreateTemplateRequest req) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return templateService.createTemplate(user, req.getName(), req.getDescription(),
                req.getPeriodType(), req.getFields());
    }

    /** 更新模板基本信息（仅部门报表管理员） */
    @PutMapping("/{id}")
    public Map<String, Object> updateTemplate(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return templateService.updateTemplate(user, id, body);
    }

    /** 停用模板（仅部门报表管理员），停用后不可下发新任务 */
    @PutMapping("/{id}/disable")
    public Map<String, Object> disableTemplate(@PathVariable Long id) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return templateService.setTemplateEnabled(user, id, false);
    }

    /** 启用模板（仅部门报表管理员） */
    @PutMapping("/{id}/enable")
    public Map<String, Object> enableTemplate(@PathVariable Long id) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return templateService.setTemplateEnabled(user, id, true);
    }

    /** 设置模板是否在智能问数中可用（仅部门报表管理员） */
    @PutMapping("/{id}/ai-query")
    public Map<String, Object> setAiQueryEnabled(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        return templateService.setAiQueryEnabled(user, id, enabled);
    }

    /** 添加模板字段（仅部门报表管理员） */
    @PostMapping("/{id}/fields")
    public Map<String, Object> addTemplateField(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return templateService.addTemplateField(user, id, body);
    }

    /** 停用字段（仅部门报表管理员），已下发的数据不受影响 */
    @PutMapping("/{id}/fields/{fieldId}/disable")
    public Map<String, Object> disableTemplateField(@PathVariable Long id, @PathVariable Long fieldId) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return templateService.disableTemplateField(user, id, fieldId);
    }

    /**
     * 更新字段（仅设计阶段未下发前允许）。
     */
    @PutMapping("/{id}/fields/{fieldId}")
    public Map<String, Object> updateTemplateField(@PathVariable Long id, @PathVariable Long fieldId,
                                                   @RequestBody Map<String, Object> body) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return templateService.updateTemplateField(user, id, fieldId, body);
    }

    /**
     * 物理删除字段（仅设计阶段未下发前允许）。
     */
    @DeleteMapping("/{id}/fields/{fieldId}")
    public Map<String, Object> deleteTemplateField(@PathVariable Long id, @PathVariable Long fieldId) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return templateService.deleteTemplateField(user, id, fieldId);
    }

    /** 设置字段是否为敏感字段，敏感字段在智能问数中不可查询 */
    @PutMapping("/{id}/fields/{fieldId}/sensitive")
    public Map<String, Object> setFieldSensitive(@PathVariable Long id, @PathVariable Long fieldId,
                                                  @RequestBody Map<String, Object> body) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        boolean sensitive = Boolean.TRUE.equals(body.get("sensitive"));
        return templateService.setFieldSensitive(user, id, fieldId, sensitive);
    }

    /** 批量添加矩阵区字段（仅部门报表管理员） */
    @PostMapping("/{id}/matrix-fields")
    public Map<String, Object> addMatrixFields(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> columns = (List<Map<String, Object>>) body.get("columns");
        @SuppressWarnings("unchecked")
        Map<String, Object> matrixConfig = (Map<String, Object>) body.get("matrix_config");
        // 兼容前端请求格式：未传 matrix_config 时，从顶层 row_label/row_options 组装
        if (matrixConfig == null && body.get("row_label") != null) {
            matrixConfig = new java.util.LinkedHashMap<>();
            matrixConfig.put("row_label", body.get("row_label"));
            matrixConfig.put("row_options", body.get("row_options"));
        }
        return templateService.addMatrixFields(user, id, columns, matrixConfig);
    }

    /** 将模板下发给指定分公司，生成填报任务（仅部门报表管理员） */
    @PostMapping("/{id}/assign")
    public Map<String, Object> assignTemplate(@PathVariable Long id,
                                              @Valid @RequestBody AssignTemplateRequest req) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        LocalDate deadline = req.getDeadline() != null ? LocalDate.parse(req.getDeadline()) : null;
        boolean isOneTime = Boolean.TRUE.equals(req.getIsOneTime());
        return templateService.assignTemplate(user, id, req.getCompanyIds(),
                req.getTitle(), req.getPeriodLabel(), deadline, isOneTime);
    }

    // ==== 模板审批 ====

    /** 提交模板进入审批流程（仅部门报表管理员） */
    @PostMapping("/{id}/submit-approval")
    public Map<String, Object> submitForApproval(@PathVariable Long id) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return templateService.submitForApproval(user, id);
    }

    /** 查询待审批的模板列表（仅数字化管理员） */
    @GetMapping("/pending-approvals")
    public List<TemplateApproval> getPendingApprovals() {
        securityUtils.requireDigitalAdmin();
        return templateService.getPendingApprovals();
    }

    /** 审批通过模板（仅数字化管理员） */
    @PostMapping("/{id}/approve")
    public Map<String, Object> approveTemplate(@PathVariable Long id,
                                                @RequestBody(required = false) Map<String, String> body) {
        securityUtils.requireDigitalAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        String comment = body != null ? body.get("comment") : null;
        return templateService.approveTemplate(user, id, comment);
    }

    /** 审批驳回模板（仅数字化管理员） */
    @PostMapping("/{id}/reject")
    public Map<String, Object> rejectTemplate(@PathVariable Long id,
                                               @RequestBody(required = false) Map<String, String> body) {
        securityUtils.requireDigitalAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        String comment = body != null ? body.get("comment") : null;
        return templateService.rejectTemplate(user, id, comment);
    }

    // ==== 周期下发计划 ====

    /** 查询模板的定时下发配置 */
    @GetMapping("/{id}/schedule")
    public Map<String, Object> getTemplateSchedule(@PathVariable Long id) {
        AuthUser user = securityUtils.getCurrentUser();
        return templateScheduleService.getSchedule(user, id);
    }

    /** 保存模板的定时下发配置（仅部门报表管理员） */
    @PutMapping("/{id}/schedule")
    public Map<String, Object> saveTemplateSchedule(@PathVariable Long id,
                                                    @RequestBody Map<String, Object> body) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return templateScheduleService.saveSchedule(user, id, body);
    }

    /** 手动触发模板的定时下发（仅部门报表管理员） */
    @PostMapping("/{id}/schedule/run")
    public Map<String, Object> runTemplateSchedule(@PathVariable Long id) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return autoAssignService.runForTemplate(user, id);
    }
}
