package com.freereport.controller;

import com.freereport.dto.AiQueryRequest;
import com.freereport.exception.DomainException;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.AiQueryService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 智能问数接口：仅超级管理员与部门报表管理员可用。
 * 超级管理员可问全部报表，部门报表管理员仅限本部门报表（范围由 TemplateMapper.findForUser 与汇总引擎双重约束）。
 */
@RestController
@RequestMapping("/api/ai")
public class AiQueryController {

    private final AiQueryService aiQueryService;
    private final SecurityUtils securityUtils;

    public AiQueryController(AiQueryService aiQueryService, SecurityUtils securityUtils) {
        this.aiQueryService = aiQueryService;
        this.securityUtils = securityUtils;
    }

    @GetMapping("/config")
    public Map<String, Object> getConfig() {
        requireQueryPermission();
        return aiQueryService.getConfig();
    }

    @PostMapping("/query")
    public Map<String, Object> query(@Valid @RequestBody AiQueryRequest req) {
        AuthUser user = requireQueryPermission();
        return aiQueryService.query(req.getQuestion().trim(), req.getHistory(), user);
    }

    /** 仅 super_admin 与 department_report_admin 可使用智能问数 */
    private AuthUser requireQueryPermission() {
        AuthUser user = securityUtils.getCurrentUser();
        if (!securityUtils.isSuperAdmin() && !securityUtils.isDepartmentReportAdmin()) {
            throw new DomainException("仅超级管理员与部门报表管理员可使用智能问数", 403);
        }
        return user;
    }
}
