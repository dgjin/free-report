package com.freereport.controller;

import com.freereport.dto.ActionRequest;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.ReceiptService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/receipts")
public class ReceiptController {

    private final ReceiptService receiptService;
    private final SecurityUtils securityUtils;

    public ReceiptController(ReceiptService receiptService, SecurityUtils securityUtils) {
        this.receiptService = receiptService;
        this.securityUtils = securityUtils;
    }

    @GetMapping("/pending")
    public List<Map<String, Object>> getPendingReceipts() {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return receiptService.getPendingReceipts(user);
    }

    @PostMapping("/{submissionId}/action")
    public Map<String, Object> processReceipt(@PathVariable Long submissionId,
                                               @Valid @RequestBody ActionRequest req) {
        securityUtils.requireDepartmentReportAdmin();
        AuthUser user = securityUtils.getCurrentUser();
        return receiptService.processReceipt(submissionId, user, req.getAction(), req.getComment());
    }
}
