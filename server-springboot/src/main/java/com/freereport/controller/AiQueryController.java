package com.freereport.controller;

import com.freereport.dto.AiQueryRequest;
import com.freereport.exception.DomainException;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.AiQueryService;
import com.freereport.service.HelpAiService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 智能问数接口：超级管理员 / 数智化转型办公室 / 部门报表管理员可用。
 * 超级管理员与数智化转型办公室可问全部报表，部门报表管理员仅限本部门报表（范围由 TemplateMapper.findForUser 与汇总引擎双重约束）。
 */
@Slf4j
@RestController
@RequestMapping("/api/ai")
public class AiQueryController {

    private final AiQueryService aiQueryService;
    private final HelpAiService helpAiService;
    private final SecurityUtils securityUtils;
    private final ExecutorService sseExecutor = Executors.newCachedThreadPool();

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
     * SSE 流式问数：与 /query 相同的输入输出语义，但以 Server-Sent Events 渐进推送。
     * 前端在收到 plan/chart/table 后立即渲染，answer_delta 逐 token 流式展示（打字机效果）。
     * 事件类型：status | text_only | plan | chart | table | answer_delta | scope_note | done | error
     */
    @PostMapping(value = "/query/stream", produces = "text/event-stream")
    public SseEmitter queryStream(@Valid @RequestBody AiQueryRequest req) {
        AuthUser user = requireQueryPermission();
        SseEmitter emitter = new SseEmitter(120_000L); // 2 分钟超时

        sseExecutor.execute(() -> {
            try {
                aiQueryService.queryStream(req.getQuestion().trim(), req.getHistory(), user, event -> {
                    try {
                        emitter.send(SseEmitter.event().name(event.type()).data(event.data()));
                    } catch (Exception e) {
                        log.debug("SSE 发送失败（客户端可能已断开）: {}", e.getMessage());
                    }
                });
                emitter.complete();
            } catch (DomainException e) {
                try {
                    emitter.send(SseEmitter.event().name("error")
                            .data("{\"error\":\"" + escapeJson(e.getMessage()) + "\"}"));
                    emitter.complete();
                } catch (Exception ignored) {}
            } catch (Exception e) {
                log.error("SSE 问数未处理异常", e);
                try {
                    emitter.send(SseEmitter.event().name("error")
                            .data("{\"error\":\"服务器内部错误，请稍后重试\"}"));
                    emitter.complete();
                } catch (Exception ignored) {}
            }
        });

        return emitter;
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
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
