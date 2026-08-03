package com.freereport.service;

import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/**
 * 智能问数服务：自然语言 → 结构化查询计划 → 复用汇总引擎取数 → 生成文字结论与图表数据。
 * 大模型只负责「理解问题」与「总结数据」，不生成 SQL，取数一律走 AggregationService 的权限校验路径。
 *
 * 本类只保留编排逻辑，各阶段职责由协作组件承担：
 * - {@link AiQueryAuditor}        单用户并发闸门 + 审计日志
 * - {@link AiOperationAnalyzer}   运营统计（各部门下发情况 / 各机构填报情况）规则识别与直接作答
 * - {@link AiQueryContextBuilder} 用户可见的模板/指标/周期上下文组装
 * - {@link AiPlanResolver}        LLM 计划 prompt 构建、计划解析与白名单校验
 * - {@link AiResultBuilder}       表格/图表数据构建与结论生成
 */
@Service
public class AiQueryService {

    /** 用户问题最大长度，超出截断 */
    private static final int MAX_QUESTION_LENGTH = 500;
    /** 历史消息内容最大长度 */
    private static final int MAX_HISTORY_CONTENT_LENGTH = 300;
    /** 协议级注入标记正则：匹配 system:、<|...|>、[INST]、<<SYS>> 等 */
    private static final java.util.regex.Pattern PROTOCOL_INJECTION =
            java.util.regex.Pattern.compile("(?i)system\\s*:|<\\|[^|]*\\|>|\\[INST\\]|<<SYS>>|\\[/INST\\]|<</SYS>>");

    private final AiClient aiClient;
    private final AggregationService aggregationService;
    private final AiQueryContextBuilder contextBuilder;
    private final AiPlanResolver planResolver;
    private final AiResultBuilder resultBuilder;
    private final AiQueryAuditor auditor;
    private final AiOperationAnalyzer operationAnalyzer;
    private final SecurityUtils securityUtils;

    public AiQueryService(AiClient aiClient, AggregationService aggregationService,
                          AiQueryContextBuilder contextBuilder, AiPlanResolver planResolver,
                          AiResultBuilder resultBuilder, AiQueryAuditor auditor,
                          AiOperationAnalyzer operationAnalyzer, SecurityUtils securityUtils) {
        this.aiClient = aiClient;
        this.aggregationService = aggregationService;
        this.contextBuilder = contextBuilder;
        this.planResolver = planResolver;
        this.resultBuilder = resultBuilder;
        this.auditor = auditor;
        this.operationAnalyzer = operationAnalyzer;
        this.securityUtils = securityUtils;
    }

    /**
     * 流式执行智能问数：通过 onEvent 回调逐步推送 SSE 事件，前端可实现打字机效果。
     * 事件类型：status → text_only/plan → chart → table → answer_delta(多个) → scope_note → done
     */
    public void queryStream(String question, List<Map<String, String>> history, AuthUser user,
                            Consumer<SseEvent> onEvent) {
        AiAuditContext[] auditCtxRef = new AiAuditContext[1];
        auditor.executeStream(user, question, auditCtxRef, onResult -> {
            doQueryStream(question, history, user, onEvent, onResult, auditCtxRef);
        });
    }

    private void doQueryStream(String question, List<Map<String, String>> history, AuthUser user,
                               Consumer<SseEvent> onEvent, Consumer<Map<String, Object>> onResult,
                               AiAuditContext[] auditCtxRef) {
        // 输入净化：防止 prompt injection
        String safeQuestion = sanitizeQuestion(question);
        if (safeQuestion == null) {
            Map<String, Object> rejected = textOnly("您的问题包含不支持的指令，请重新描述您的数据需求。", List.of());
            onEvent.accept(SseEvent.json("text_only", rejected));
            onEvent.accept(SseEvent.data("done", ""));
            onResult.accept(rejected);
            return;
        }

        // 防御性权限检查（Controller 层已拦截，此处为 defense-in-depth）
        Map<String, Object> permDenied = checkQueryPermission(user);
        if (permDenied != null) {
            onEvent.accept(SseEvent.json("text_only", permDenied));
            onEvent.accept(SseEvent.data("done", ""));
            onResult.accept(permDenied);
            return;
        }

        // 运营统计类问题：规则识别直接作答，不消耗 LLM 调用
        Map<String, Object> operationAnswer = operationAnalyzer.answerIfMatched(safeQuestion, user);
        if (operationAnswer != null) {
            onEvent.accept(SseEvent.json("text_only", operationAnswer));
            onEvent.accept(SseEvent.data("done", ""));
            onResult.accept(operationAnswer);
            return;
        }

        // 角色限制检查
        if (securityUtils.isAiQueryLimitedToOperationStats(user)) {
            Map<String, Object> limited = textOnly("当前角色仅支持运营统计类查询，可问我「各部门下发报表的情况」或「各分公司填报情况分析」。"
                    + "具体报表数据请由对应部门的报表管理员查询。", List.of());
            onEvent.accept(SseEvent.json("text_only", limited));
            onEvent.accept(SseEvent.data("done", ""));
            onResult.accept(limited);
            return;
        }

        onEvent.accept(SseEvent.data("status", "正在理解您的问题..."));

        List<AiTemplateContext> contexts = contextBuilder.buildContexts(user);
        if (contexts.isEmpty()) {
            Map<String, Object> noData = textOnly("当前没有可供问数的报表。请先创建并发布模板、下发任务并完成填报后再来提问。", contexts);
            onEvent.accept(SseEvent.json("text_only", noData));
            onEvent.accept(SseEvent.data("done", ""));
            onResult.accept(noData);
            return;
        }

        // LLM Call #1: 生成查询计划（对话历史经过净化，仅保留用户消息）
        String planJson = aiClient.chat(planResolver.buildPlanMessages(safeQuestion, sanitizeHistory(history), contexts), true);
        AiPlanResolver.PlanResult planResult = planResolver.resolve(planJson, contexts);
        if (planResult.isText()) {
            Map<String, Object> textResult = textOnly(planResult.textAnswer(), contexts);
            onEvent.accept(SseEvent.json("text_only", textResult));
            onEvent.accept(SseEvent.data("done", ""));
            onResult.accept(textResult);
            return;
        }
        AiResolvedPlan plan = planResult.plan();

        onEvent.accept(SseEvent.json("plan", planResolver.toResponseMap(plan, List.of())));
        onEvent.accept(SseEvent.data("status", "正在查询数据..."));

        // 取数
        Map<String, Map<String, Object>> aggregations = aggregationService.getAggregationsByTemplateAndPeriods(
                plan.ctx().template().getId(), plan.periods(), user);
        List<AiPeriodData> periodDataList = new ArrayList<>();
        for (String period : plan.periods()) {
            Map<String, Object> aggregation = aggregations.get(period);
            if (aggregation != null) {
                periodDataList.add(new AiPeriodData(period, aggregation));
            }
        }
        List<String> companyFilter = resultBuilder.effectiveCompanyFilter(periodDataList, plan.requestedCompanies());

        // 发送更新后的 plan（含 companyFilter）
        onEvent.accept(SseEvent.json("plan", planResolver.toResponseMap(plan, companyFilter)));

        Map<String, Object> table = resultBuilder.buildTable(periodDataList, plan, companyFilter);
        Map<String, Object> chart = resultBuilder.buildChart(periodDataList, plan, companyFilter);

        onEvent.accept(SseEvent.json("chart", chart));
        onEvent.accept(SseEvent.json("table", table));

        onEvent.accept(SseEvent.data("status", "正在生成结论..."));

        // LLM Call #2: 流式总结（使用净化后的问题）
        String answer = resultBuilder.summarizeStream(safeQuestion, plan, table, companyFilter,
                chunk -> onEvent.accept(SseEvent.data("answer_delta", chunk)));

        String scope = scopeNote(plan, companyFilter);
        onEvent.accept(SseEvent.data("scope_note", scope));
        onEvent.accept(SseEvent.data("done", ""));

        // 完整结果（用于审计日志）
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("answer", answer);
        result.put("plan", planResolver.toResponseMap(plan, companyFilter));
        result.put("chart", chart);
        result.put("table", table);
        result.put("scope_note", scope);
        onResult.accept(result);
        // 填充审计上下文：暴露的模板/指标、选中的模板
        auditCtxRef[0] = buildAuditContext(contexts, plan);
    }

    /** SSE 事件封装：type + data，支持 JSON 对象和纯文本两种 payload */
    public record SseEvent(String type, String data) {
        public static SseEvent data(String type, String data) { return new SseEvent(type, data); }
        public static SseEvent json(String type, Object obj) {
            try {
                return new SseEvent(type, new com.fasterxml.jackson.databind.ObjectMapper()
                        .setPropertyNamingStrategy(com.fasterxml.jackson.databind.PropertyNamingStrategies.SNAKE_CASE)
                        .writeValueAsString(obj));
            } catch (Exception e) {
                return new SseEvent(type, "{}");
            }
        }
    }

    /** 智能问数可用性（前端据此提示配置缺失） */
    public Map<String, Object> getConfig() {
        return Map.of("enabled", aiClient.isAvailable());
    }

    /**
     * 执行一次智能问数。
     * 外层负责：单用户并发限 1（LLM 调用慢且贵，防止重复点击打爆服务）+ 审计日志。
     *
     * @param question 自然语言问题
     * @param history  最近若干轮对话 [{role: user|assistant, content: ...}]
     */
    public Map<String, Object> query(String question, List<Map<String, String>> history, AuthUser user) {
        AiAuditContext[] auditCtxRef = new AiAuditContext[1];
        Map<String, Object> result = auditor.execute(user, question, auditCtxRef, () -> doQuery(question, history, user, auditCtxRef));
        return result;
    }

    private Map<String, Object> doQuery(String question, List<Map<String, String>> history, AuthUser user,
                                         AiAuditContext[] auditCtxRef) {
        // 输入净化：防止 prompt injection
        String safeQuestion = sanitizeQuestion(question);
        if (safeQuestion == null) {
            return textOnly("您的问题包含不支持的指令，请重新描述您的数据需求。", List.of());
        }

        // 防御性权限检查（Controller 层已拦截，此处为 defense-in-depth）
        Map<String, Object> permDenied = checkQueryPermission(user);
        if (permDenied != null) {
            return permDenied;
        }

        // 运营统计类问题（各部门下发情况 / 各机构填报情况）：固定口径规则识别直接作答，
        // 不消耗 LLM 调用，AI 服务不可用时也可用；数据范围仍按用户权限过滤
        Map<String, Object> operationAnswer = operationAnalyzer.answerIfMatched(safeQuestion, user);
        if (operationAnswer != null) {
            return operationAnswer;
        }

        // 超级管理员与数智化转型办公室仅限运营统计：具体报表数值归各部门负责，
        // 数值问数仅部门报表管理员可在本部门范围内执行，此处直接拦截（不消耗 LLM 调用）
        if (securityUtils.isAiQueryLimitedToOperationStats(user)) {
            return textOnly("当前角色仅支持运营统计类查询，可问我「各部门下发报表的情况」或「各分公司填报情况分析」。"
                    + "具体报表数据请由对应部门的报表管理员查询。", List.of());
        }

        List<AiTemplateContext> contexts = contextBuilder.buildContexts(user);
        if (contexts.isEmpty()) {
            return textOnly("当前没有可供问数的报表。请先创建并发布模板、下发任务并完成填报后再来提问。", contexts);
        }

        String planJson = aiClient.chat(planResolver.buildPlanMessages(safeQuestion, sanitizeHistory(history), contexts), true);
        AiPlanResolver.PlanResult planResult = planResolver.resolve(planJson, contexts);
        if (planResult.isText()) {
            return textOnly(planResult.textAnswer(), contexts);
        }
        AiResolvedPlan plan = planResult.plan();

        // ---- 取数：多周期一次性批量查询（内部含 canReadTemplate 与已审批状态过滤），避免逐周期 N+1 ----
        Map<String, Map<String, Object>> aggregations = aggregationService.getAggregationsByTemplateAndPeriods(
                plan.ctx().template().getId(), plan.periods(), user);
        List<AiPeriodData> periodDataList = new ArrayList<>();
        for (String period : plan.periods()) {
            Map<String, Object> aggregation = aggregations.get(period);
            if (aggregation != null) {
                periodDataList.add(new AiPeriodData(period, aggregation));
            }
        }
        List<String> companyFilter = resultBuilder.effectiveCompanyFilter(periodDataList, plan.requestedCompanies());

        Map<String, Object> table = resultBuilder.buildTable(periodDataList, plan, companyFilter);
        Map<String, Object> chart = resultBuilder.buildChart(periodDataList, plan, companyFilter);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("answer", resultBuilder.summarize(safeQuestion, plan, table, companyFilter));
        result.put("plan", planResolver.toResponseMap(plan, companyFilter));
        result.put("chart", chart);
        result.put("table", table);
        result.put("scope_note", scopeNote(plan, companyFilter));
        // 填充审计上下文
        auditCtxRef[0] = buildAuditContext(contexts, plan);
        return result;
    }

    /** 数据范围说明：报表/周期/指标/筛选口径，供前端展示「这次问数查的是什么」 */
    private String scopeNote(AiResolvedPlan plan, List<String> companyFilter) {
        StringBuilder scopeNote = new StringBuilder("报表：" + plan.ctx().template().getName()
                + " ｜ 周期：" + String.join("、", plan.periods())
                + " ｜ 指标：" + plan.metrics().stream().map(AiMetric::label).collect(Collectors.joining("、")));
        if (plan.groupByFieldLabel() != null) {
            scopeNote.append(" ｜ 分组：").append(plan.groupByFieldLabel());
        }
        if (plan.matrixDimension() != null) {
            scopeNote.append(" ｜ 交叉表行维度：").append(plan.matrixDimension().rowLabel());
            if ("matrix_column".equals(plan.dimension())) {
                scopeNote.append(" ｜ 列维度对比");
            }
        }
        if (!companyFilter.isEmpty()) {
            scopeNote.append(" ｜ 机构：").append(String.join("、", companyFilter));
        }
        if (plan.agg() != AiAgg.SUM) {
            scopeNote.append(" ｜ 聚合：").append(plan.agg().cn());
        }
        scopeNote.append(" ｜ 仅统计已提交并通过接收的数据");
        return scopeNote.toString();
    }

    // ---- 审计上下文 ----

    /** 构建审计上下文：记录本次请求暴露给 LLM 的模板/指标范围 */
    private AiAuditContext buildAuditContext(List<AiTemplateContext> contexts, AiResolvedPlan plan) {
        List<Long> exposedIds = contexts.stream()
                .map(c -> c.template().getId())
                .collect(Collectors.toList());
        int metricCount = contexts.stream()
                .mapToInt(c -> c.metrics().size())
                .sum();
        Long selectedId = plan != null ? plan.ctx().template().getId() : null;
        return new AiAuditContext(exposedIds, metricCount, selectedId);
    }

    // ---- 输入净化与权限防御 ----

    /** 净化用户输入：长度截断 + 协议级注入标记过滤，过滤量超过 70% 则拒绝 */
    private String sanitizeQuestion(String question) {
        if (question == null || question.isBlank()) return null;
        String cleaned = question.trim();
        if (cleaned.length() > MAX_QUESTION_LENGTH) {
            cleaned = cleaned.substring(0, MAX_QUESTION_LENGTH);
        }
        cleaned = PROTOCOL_INJECTION.matcher(cleaned).replaceAll("[已过滤]");
        if (cleaned.isEmpty() || cleaned.length() < question.trim().length() * 0.3) {
            return null;
        }
        return cleaned;
    }

    /**
     * 净化对话历史：仅保留 user 消息（丢弃 assistant 消息，避免上一轮的实际数据泄露给 LLM），
     * 并对内容做长度截断与协议标记过滤。
     */
    private List<Map<String, String>> sanitizeHistory(List<Map<String, String>> history) {
        if (history == null || history.isEmpty()) return List.of();
        return history.stream()
                .filter(h -> "user".equals(h.get("role")))
                .filter(h -> h.get("content") != null && !h.get("content").isBlank())
                .map(h -> {
                    String content = h.get("content");
                    if (content.length() > MAX_HISTORY_CONTENT_LENGTH) {
                        content = content.substring(0, MAX_HISTORY_CONTENT_LENGTH);
                    }
                    content = PROTOCOL_INJECTION.matcher(content).replaceAll("[已过滤]");
                    return Map.of("role", "user", "content", content);
                })
                .collect(Collectors.toList());
    }

    /** 防御性权限检查：仅 super_admin / digital_admin / department_report_admin 可使用智能问数 */
    private Map<String, Object> checkQueryPermission(AuthUser user) {
        String role = user.getRole();
        if (!"super_admin".equals(role) && !"digital_admin".equals(role) && !"department_report_admin".equals(role)) {
            return textOnly("智能问数功能仅向报表管理员开放。如需查询数据，请使用汇总报表页面。", List.of());
        }
        return null;
    }

    private Map<String, Object> textOnly(String answer, List<AiTemplateContext> contexts) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("answer", answer);
        result.put("plan", null);
        result.put("chart", null);
        result.put("table", null);
        result.put("scope_note", contexts.isEmpty() ? null
                : "可问数的报表：" + contexts.stream().map(c -> c.template().getName()).collect(Collectors.joining("、")));
        return result;
    }
}
