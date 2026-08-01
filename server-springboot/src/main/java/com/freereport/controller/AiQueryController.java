package com.freereport.controller;

import com.freereport.dto.AiQueryRequest;
import com.freereport.exception.DomainException;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.AiQueryService;
import com.freereport.service.HelpAiService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 智能问数接口：超级管理员 / 数智化转型办公室 / 部门报表管理员可用。
 * 超级管理员与数智化转型办公室可问全部报表，部门报表管理员仅限本部门报表（范围由 TemplateMapper.findForUser 与汇总引擎双重约束）。
 */
@RestController
@RequestMapping("/api/ai")
public class AiQueryController {

    private final AiQueryService aiQueryService;
    private final HelpAiService helpAiService;
    private final SecurityUtils securityUtils;

    public AiQueryController(AiQueryService aiQueryService, HelpAiService helpAiService, SecurityUtils securityUtils) {
        this.aiQueryService = aiQueryService;
        this.helpAiService = helpAiService;
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

    /**
     * 帮助知识库 AI 问答：所有登录用户可用。
     * 基于系统帮助文档（角色权限、审批流程、操作指南、模板设计、FAQ 等）回答用户咨询。
     */
    @PostMapping("/help")
    public Map<String, String> helpAsk(@Valid @RequestBody AiQueryRequest req) {
        securityUtils.getCurrentUser(); // 确保已登录
        String answer = helpAiService.ask(req.getQuestion().trim(), req.getHistory());
        return Map.of("answer", answer);
    }

    /** 仅 super_admin、digital_admin 与 department_report_admin 可使用智能问数 */
    private AuthUser requireQueryPermission() {
        AuthUser user = securityUtils.getCurrentUser();
        if (!securityUtils.isSuperAdmin() && !securityUtils.isDigitalAdmin() && !securityUtils.isDepartmentReportAdmin()) {
            throw new DomainException("仅超级管理员、数智化转型办公室与部门报表管理员可使用智能问数", 403);
        }
        return user;
    }
}
