package com.freereport.controller;

import com.freereport.dto.ActionRequest;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.ApprovalService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/approvals")
public class ApprovalController {

    private final ApprovalService approvalService;
    private final SecurityUtils securityUtils;

    public ApprovalController(ApprovalService approvalService, SecurityUtils securityUtils) {
        this.approvalService = approvalService;
        this.securityUtils = securityUtils;
    }

    @GetMapping("/pending")
    public List<Map<String, Object>> getPendingApprovals() {
        AuthUser user = securityUtils.getCurrentUser();
        return approvalService.getPendingApprovals(user);
    }

    @PostMapping("/{submissionId}/action")
    public Map<String, Object> processApprovalAction(@PathVariable Long submissionId,
                                                      @Valid @RequestBody ActionRequest req) {
        AuthUser user = securityUtils.getCurrentUser();
        return approvalService.processApprovalAction(submissionId, user, req.getAction(), req.getComment());
    }
}
