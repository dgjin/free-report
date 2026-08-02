package com.freereport.controller;

import com.freereport.dto.ActionRequest;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.ReceiptService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 签收流程控制器。
 * 提供待签收列表和签收操作（签收/退回）接口。
 * 仅限部门报表管理员访问。
 */
@RestController
@RequestMapping("/api/receipts")
public class ReceiptController {

    private final ReceiptService receiptService;
    private final SecurityUtils securityUtils;

    public ReceiptController(ReceiptService receiptService, SecurityUtils securityUtils) {
        this.receiptService = receiptService;
        this.securityUtils = securityUtils;
    }

    /**
     * 查询当前部门的待签收列表。
     * 筛选已通过审批但尚未签收的填报提交。
     *
     * @return 待签收列表
     */
    @GetMapping("/pending")
    public List<Map<String, Object>> getPendingReceipts() {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return receiptService.getPendingReceipts(user);
    }

    /**
     * 处理签收操作（签收或退回）。
     *
     * @param submissionId 填报提交 ID
     * @param req          操作请求，包含 action(received/returned) 和可选的 comment
     * @return 操作结果
     */
    @PostMapping("/{submissionId}/action")
    public Map<String, Object> processReceipt(@PathVariable Long submissionId,
                                               @Valid @RequestBody ActionRequest req) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return receiptService.processReceipt(submissionId, user, req.getAction(), req.getComment());
    }
}
