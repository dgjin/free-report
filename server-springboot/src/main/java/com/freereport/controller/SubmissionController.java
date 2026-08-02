package com.freereport.controller;

import com.freereport.dto.CreateSubmissionRequest;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.SubmissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 填报提交控制器。
 * 提供填报数据的创建/保存草稿、提交、查看详情等接口。
 * 主要由分公司填报人员使用。
 */
@RestController
@RequestMapping("/api/submissions")
public class SubmissionController {

    private final SubmissionService submissionService;
    private final SecurityUtils securityUtils;

    public SubmissionController(SubmissionService submissionService, SecurityUtils securityUtils) {
        this.submissionService = submissionService;
        this.securityUtils = securityUtils;
    }

    /**
     * 创建或更新填报提交（保存草稿或直接提交）。
     *
     * @param req 填报数据请求，包含汇总区、明细区数据和操作类型
     * @return 提交结果，包含提交 ID 和当前状态
     */
    @PostMapping
    public Map<String, Object> createOrUpdateSubmission(@Valid @RequestBody CreateSubmissionRequest req) {
        AuthUser user = securityUtils.getCurrentUser();
        boolean isSubmit = "submit".equals(req.getAction());
        return submissionService.createOrUpdateSubmission(
                user, req.getAssignmentId(), req.getSummary(), req.getDetails(), req.getComment(), isSubmit);
    }

    /**
     * 将已保存的草稿正式提交。
     *
     * @param id   填报提交 ID
     * @param body 可选的请求体，包含 comment 提交备注
     * @return 提交结果
     */
    @PostMapping("/{id}/submit")
    public Map<String, Object> submitExisting(@PathVariable Long id,
                                              @RequestBody(required = false) Map<String, Object> body) {
        AuthUser user = securityUtils.getCurrentUser();
        String comment = body != null ? (String) body.get("comment") : null;
        return submissionService.submitExistingDraft(id, user, comment);
    }

    /**
     * 查看填报提交详情，包含汇总区和明细区数据。
     *
     * @param id 填报提交 ID
     * @return 提交详情数据
     */
    @GetMapping("/{id}")
    public Map<String, Object> getSubmissionDetail(@PathVariable Long id) {
        AuthUser user = securityUtils.getCurrentUser();
        return submissionService.getSubmissionDetail(id, user);
    }

    /**
     * 按下发任务 ID 查询最新的填报提交。
     *
     * @param assignmentId 下发任务 ID
     * @return 最新提交数据，无提交时返回 null
     */
    @GetMapping("/by-assignment/{assignmentId}")
    public Object getLatestByAssignment(@PathVariable Long assignmentId) {
        AuthUser user = securityUtils.getCurrentUser();
        return submissionService.getSubmissionByAssignment(assignmentId, user);
    }
}
