package com.freereport.controller;

import com.freereport.dto.ActionRequest;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.ApprovalService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 审批流程控制器。
 * 提供待审批列表和审批操作（通过/驳回）接口。
 * 仅限具有审批角色的用户（handler / reviewer / approver）访问。
 */
@RestController
@RequestMapping("/api/approvals")
public class ApprovalController {

    private final ApprovalService approvalService;
    private final SecurityUtils securityUtils;

    public ApprovalController(ApprovalService approvalService, SecurityUtils securityUtils) {
        this.approvalService = approvalService;
        this.securityUtils = securityUtils;
    }

    /**
     * 查询当前用户的待审批列表。
     * 根据用户角色和机构筛选待处理的填报提交。
     *
     * @return 待审批列表，包含提交信息、任务信息、提交方机构等
     */
    @GetMapping("/pending")
    public List<Map<String, Object>> getPendingApprovals() {
        AuthUser user = securityUtils.getCurrentUser();
        return approvalService.getPendingApprovals(user);
    }

    /**
     * 处理审批操作（通过或驳回）。
     *
     * @param submissionId 填报提交 ID
     * @param req          操作请求，包含 action 和可选的 comment
     * @return 操作结果
     */
    @PostMapping("/{submissionId}/action")
    public Map<String, Object> processApprovalAction(@PathVariable Long submissionId,
                                                      @Valid @RequestBody ActionRequest req) {
        AuthUser user = securityUtils.getCurrentUser();
        return approvalService.processApprovalAction(submissionId, user, req.getAction(), req.getComment());
    }
}
