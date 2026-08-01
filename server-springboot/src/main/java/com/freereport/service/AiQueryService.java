package com.freereport.service;

import com.freereport.security.AuthUser;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 智能问数服务：自然语言 → 结构化查询计划 → 复用汇总引擎取数 → 生成文字结论与图表数据。
 * 大模型只负责「理解问题」与「总结数据」，不生成 SQL，取数一律走 AggregationService 的权限校验路径。
 *
 * 本类只保留编排逻辑，各阶段职责由协作组件承担：
 * - {@link AiQueryAuditor}        单用户并发闸门 + 审计日志
 * - {@link AiQueryContextBuilder} 用户可见的模板/指标/周期上下文组装
 * - {@link AiPlanResolver}        LLM 计划 prompt 构建、计划解析与白名单校验
 * - {@link AiResultBuilder}       表格/图表数据构建与结论生成
 */
@Service
public class AiQueryService {

    private final AiClient aiClient;
    private final AggregationService aggregationService;
    private final AiQueryContextBuilder contextBuilder;
    private final AiPlanResolver planResolver;
    private final AiResultBuilder resultBuilder;
    private final AiQueryAuditor auditor;

    public AiQueryService(AiClient aiClient, AggregationService aggregationService,
                          AiQueryContextBuilder contextBuilder, AiPlanResolver planResolver,
                          AiResultBuilder resultBuilder, AiQueryAuditor auditor) {
        this.aiClient = aiClient;
        this.aggregationService = aggregationService;
        this.contextBuilder = contextBuilder;
        this.planResolver = planResolver;
        this.resultBuilder = resultBuilder;
        this.auditor = auditor;
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
        return auditor.execute(user, question, () -> doQuery(question, history, user));
    }

    private Map<String, Object> doQuery(String question, List<Map<String, String>> history, AuthUser user) {
        List<AiTemplateContext> contexts = contextBuilder.buildContexts(user);
        if (contexts.isEmpty()) {
            return textOnly("当前没有可供问数的报表。请先创建并发布模板、下发任务并完成填报后再来提问。", contexts);
        }

        String planJson = aiClient.chat(planResolver.buildPlanMessages(question, history, contexts), true);
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
        result.put("answer", resultBuilder.summarize(question, plan, table, companyFilter));
        result.put("plan", planResolver.toResponseMap(plan, companyFilter));
        result.put("chart", chart);
        result.put("table", table);
        result.put("scope_note", scopeNote(plan, companyFilter));
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
        if (!companyFilter.isEmpty()) {
            scopeNote.append(" ｜ 机构：").append(String.join("、", companyFilter));
        }
        if (plan.agg() != AiAgg.SUM) {
            scopeNote.append(" ｜ 聚合：").append(plan.agg().cn());
        }
        scopeNote.append(" ｜ 仅统计已提交并通过接收的数据");
        return scopeNote.toString();
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
