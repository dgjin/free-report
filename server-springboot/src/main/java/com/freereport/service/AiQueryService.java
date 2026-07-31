package com.freereport.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;
import com.freereport.exception.DomainException;
import com.freereport.mapper.AssignmentMapper;
import com.freereport.mapper.TemplateMapper;
import com.freereport.security.AuthUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiPredicate;
import java.util.stream.Collectors;

/**
 * 智能问数服务：自然语言 → 结构化查询计划 → 复用汇总引擎取数 → 生成文字结论与图表数据。
 * 大模型只负责「理解问题」与「总结数据」，不生成 SQL，取数一律走 AggregationService 的权限校验路径。
 */
@Slf4j
@Service
public class AiQueryService {

    /** 单次查询最多涉及的周期数，防止 prompt 与响应体过大 */
    private static final int MAX_PERIODS = 12;
    /** 单次查询最多涉及的指标数 */
    private static final int MAX_METRICS = 6;
    /** 用户未指定指标时默认采用的指标数 */
    private static final int DEFAULT_METRICS = 3;
    /** 注入 prompt 的模板上限 */
    private static final int MAX_TEMPLATES_IN_PROMPT = 30;
    /** 每个模板注入 prompt 的周期上限（取最近的） */
    private static final int MAX_PERIODS_IN_PROMPT = 12;
    /** 交给模型总结的数据行上限 */
    private static final int MAX_ROWS_FOR_SUMMARY = 50;
    /** 携带的历史对话轮次上限 */
    private static final int MAX_HISTORY_MESSAGES = 6;
    /** 明细行数这一内置指标的字段名（明细型台账没有汇总字段时也能统计「有多少条/多少台」） */
    private static final String RECORD_COUNT_FIELD = "_record_count";

    private final AiClient aiClient;
    private final AggregationService aggregationService;
    private final TemplateMapper templateMapper;
    private final AssignmentMapper assignmentMapper;
    private final ObjectMapper objectMapper;
    /** 正在执行问数的用户 ID 集合，单用户并发限 1 */
    private final Set<Long> inFlightUsers = ConcurrentHashMap.newKeySet();

    public AiQueryService(AiClient aiClient, AggregationService aggregationService,
                          TemplateMapper templateMapper, AssignmentMapper assignmentMapper,
                          ObjectMapper objectMapper) {
        this.aiClient = aiClient;
        this.aggregationService = aggregationService;
        this.templateMapper = templateMapper;
        this.assignmentMapper = assignmentMapper;
        this.objectMapper = objectMapper;
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
        if (!inFlightUsers.add(user.getId())) {
            throw new DomainException("您有一条问数请求正在处理中，请等它完成后再提问", 429);
        }
        long startedAt = System.currentTimeMillis();
        String outcome = "error";
        String scope = "-";
        try {
            Map<String, Object> result = doQuery(question, history, user);
            Object plan = result.get("plan");
            outcome = plan != null ? "answered" : "no_data";
            if (plan instanceof Map<?, ?> p) {
                scope = "template=" + p.get("template_id") + " periods=" + p.get("period_labels");
            }
            return result;
        } finally {
            inFlightUsers.remove(user.getId());
            // 审计日志：谁在什么时候问了什么、命中了哪张表哪些周期、耗时多少
            log.info("[AI_QUERY_AUDIT] user={}({}) role={} outcome={} costMs={} scope={} question={}",
                    user.getId(), user.getUsername(), user.getRole(), outcome,
                    System.currentTimeMillis() - startedAt, scope, truncate(str(question), 200));
        }
    }

    private Map<String, Object> doQuery(String question, List<Map<String, String>> history, AuthUser user) {
        List<TemplateContext> contexts = buildContexts(user);
        if (contexts.isEmpty()) {
            return textOnly("当前没有可供问数的报表。请先创建并发布模板、下发任务并完成填报后再来提问。", contexts);
        }

        String planJson = aiClient.chat(buildPlanMessages(question, history, contexts), true);
        JsonNode plan = parseJsonLoose(planJson);
        if (plan == null) {
            log.warn("查询计划解析失败，原始响应: {}", planJson);
            return textOnly("没能理解这个问题，请换一种说法，例如「2026年07月各机构的总收入是多少」。" + scopeHint(contexts), contexts);
        }

        String unanswerable = text(plan, "unanswerable_reason");
        if (unanswerable != null && !unanswerable.isBlank() && !"null".equalsIgnoreCase(unanswerable)) {
            return textOnly(unanswerable + scopeHint(contexts), contexts);
        }

        // ---- 计划校验：模板、指标、周期必须落在当前用户可见范围内 ----
        Long templateId = plan.path("template_id").isNumber() ? plan.path("template_id").asLong() : null;
        TemplateContext ctx = contexts.stream()
                .filter(c -> c.template.getId().equals(templateId))
                .findFirst().orElse(null);
        if (ctx == null) {
            return textOnly("没能定位到您要查询的报表。" + scopeHint(contexts), contexts);
        }
        if (ctx.periods.isEmpty()) {
            return textOnly("报表「" + ctx.template.getName() + "」还没有下发任务，暂无可查询的数据周期。", contexts);
        }

        List<String> periods = stringList(plan.path("period_labels")).stream()
                .filter(ctx.periods::contains)
                .distinct()
                .limit(MAX_PERIODS)
                .collect(Collectors.toList());
        if (periods.isEmpty()) {
            periods = List.of(ctx.periods.get(0));
        }

        List<Metric> metrics = stringList(plan.path("metric_field_names")).stream()
                .map(name -> ctx.metrics.stream()
                        .filter(m -> name.equals(m.fieldName()) || name.equals(m.label()))
                        .findFirst().orElse(null))
                .filter(m -> m != null)
                .distinct()
                .limit(MAX_METRICS)
                .collect(Collectors.toList());
        if (metrics.isEmpty()) {
            // 用户未指定指标：默认取前若干个可求和指标，避免把标识类字段与量级悬殊的指标混进同一张图
            metrics = ctx.metrics.stream()
                    .filter(m -> !m.identifierLike())
                    .limit(DEFAULT_METRICS)
                    .collect(Collectors.toList());
        }
        if (metrics.isEmpty()) {
            return textOnly("报表「" + ctx.template.getName() + "」没有可统计的数值指标，暂时无法问数。", contexts);
        }

        String dimension = "period".equals(text(plan, "dimension")) ? "period" : "company";
        String chartType = normalizeChartType(text(plan, "chart_type"));
        Agg agg = Agg.parse(text(plan, "aggregation"));
        // 机构筛选：模型给出的机构名在取数后与真实机构名模糊匹配，全都对不上时忽略筛选而不是返回空结果
        List<String> requestedCompanies = stringList(plan.path("company_names")).stream()
                .distinct().limit(20).collect(Collectors.toList());
        String title = text(plan, "title");
        if (title == null || title.isBlank()) {
            title = ctx.template.getName();
        }

        // ---- 取数：逐周期复用汇总引擎（内部含 canReadTemplate 与已审批状态过滤）----
        List<PeriodData> periodDataList = new ArrayList<>();
        for (String period : periods) {
            Map<String, Object> aggregation = aggregationService.getAggregationByTemplate(ctx.template.getId(), period, user);
            periodDataList.add(new PeriodData(period, aggregation));
        }
        boolean filterMatched = periodDataList.stream()
                .flatMap(pd -> pd.companyData().stream())
                .anyMatch(c -> matchesCompany(str(c.get("company_name")), requestedCompanies));
        List<String> companyFilter = (!requestedCompanies.isEmpty() && filterMatched)
                ? requestedCompanies : List.of();

        Map<String, Object> table = "period".equals(dimension)
                ? buildPeriodTable(periodDataList, metrics, agg, companyFilter)
                : buildCompanyTable(periodDataList, metrics, agg, companyFilter);
        Map<String, Object> chart = "period".equals(dimension)
                ? buildPeriodChart(periodDataList, metrics, chartType, title, agg, companyFilter)
                : buildCompanyChart(periodDataList, metrics, chartType, title, agg, companyFilter);

        Map<String, Object> resolvedPlan = new LinkedHashMap<>();
        resolvedPlan.put("template_id", ctx.template.getId());
        resolvedPlan.put("template_name", ctx.template.getName());
        resolvedPlan.put("period_labels", periods);
        resolvedPlan.put("metrics", metrics.stream().map(m -> Map.of(
                "field_name", m.fieldName(),
                "field_label", m.label()
        )).collect(Collectors.toList()));
        resolvedPlan.put("dimension", dimension);
        resolvedPlan.put("chart_type", chartType);
        resolvedPlan.put("aggregation", agg.name().toLowerCase());
        resolvedPlan.put("company_names", companyFilter);

        String answer = summarize(question, ctx, periods, metrics, table, agg, companyFilter);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("answer", answer);
        result.put("plan", resolvedPlan);
        result.put("chart", chart);
        result.put("table", table);
        StringBuilder scopeNote = new StringBuilder("报表：" + ctx.template.getName()
                + " ｜ 周期：" + String.join("、", periods)
                + " ｜ 指标：" + metrics.stream().map(Metric::label).collect(Collectors.joining("、")));
        if (!companyFilter.isEmpty()) {
            scopeNote.append(" ｜ 机构：").append(String.join("、", companyFilter));
        }
        if (agg != Agg.SUM) {
            scopeNote.append(" ｜ 聚合：").append(agg.cn());
        }
        scopeNote.append(" ｜ 仅统计已提交并通过接收的数据");
        result.put("scope_note", scopeNote.toString());
        return result;
    }

    // ---- 上下文组装 ----

    /** 当前用户可问数的报表清单（模板 + 数值指标 + 已有周期） */
    private List<TemplateContext> buildContexts(AuthUser user) {
        List<ReportTemplate> templates = templateMapper.findForUser(
                user.getCompanyId(), user.getRole(), user.getCompanyLevel());
        List<ReportTemplate> usable = templates.stream()
                .filter(t -> "published".equals(t.getStatus()))
                .limit(MAX_TEMPLATES_IN_PROMPT)
                .collect(Collectors.toList());
        if (usable.isEmpty()) {
            return List.of();
        }

        List<Long> templateIds = usable.stream().map(ReportTemplate::getId).collect(Collectors.toList());
        Map<Long, List<ReportTemplateField>> fieldsByTemplate = templateMapper.findFieldsByTemplateIds(templateIds)
                .stream()
                .filter(f -> "active".equals(f.getStatus()))
                .collect(Collectors.groupingBy(ReportTemplateField::getTemplateId));
        // 一次 SQL 批量取全部模板的去重周期，避免逐模板查询造成 N+1
        Map<Long, List<String>> periodsByTemplate = new HashMap<>();
        for (Map<String, Object> row : assignmentMapper.findPeriodLabelsByTemplateIds(templateIds)) {
            Long tid = ((Number) row.get("template_id")).longValue();
            periodsByTemplate.computeIfAbsent(tid, k -> new ArrayList<>())
                    .add(str(row.get("period_label")));
        }

        List<TemplateContext> contexts = new ArrayList<>();
        for (ReportTemplate t : usable) {
            List<ReportTemplateField> fields = fieldsByTemplate.getOrDefault(t.getId(), List.of());
            // 汇总区数值字段是首选指标；明细/交叉表的数值字段按机构逐行累计，明细台账另外提供「记录数」
            List<Metric> metrics = new ArrayList<>();
            fields.stream()
                    .filter(f -> "summary".equals(f.getDataType()) && "number".equals(f.getFieldType()))
                    .forEach(f -> metrics.add(new Metric(f.getFieldName(), f.getFieldLabel(), MetricSource.SUMMARY)));
            List<ReportTemplateField> detailNumbers = fields.stream()
                    .filter(f -> ("detail".equals(f.getDataType()) || "matrix".equals(f.getDataType()))
                            && "number".equals(f.getFieldType()))
                    .collect(Collectors.toList());
            boolean hasDetailArea = fields.stream()
                    .anyMatch(f -> "detail".equals(f.getDataType()) || "matrix".equals(f.getDataType()));
            if (hasDetailArea) {
                metrics.add(new Metric(RECORD_COUNT_FIELD, "记录数", MetricSource.ROW_COUNT));
            }
            detailNumbers.forEach(f -> metrics.add(new Metric(f.getFieldName(), f.getFieldLabel(),
                    MetricSource.DETAIL, looksLikeIdentifier(f))));

            Set<String> metricFieldNames = metrics.stream()
                    .map(Metric::fieldName).collect(Collectors.toSet());
            List<ReportTemplateField> others = fields.stream()
                    .filter(f -> !metricFieldNames.contains(f.getFieldName()))
                    .collect(Collectors.toList());
            List<String> periods = periodsByTemplate.getOrDefault(t.getId(), List.of()).stream()
                    .filter(p -> p != null && !p.isBlank())
                    .distinct()
                    .sorted(Comparator.reverseOrder())
                    .limit(MAX_PERIODS_IN_PROMPT)
                    .collect(Collectors.toList());
            contexts.add(new TemplateContext(t, metrics, others, periods));
        }
        return contexts;
    }

    private List<Map<String, String>> buildPlanMessages(String question, List<Map<String, String>> history,
                                                        List<TemplateContext> contexts) {
        StringBuilder catalog = new StringBuilder();
        for (TemplateContext c : contexts) {
            catalog.append("- 模板ID=").append(c.template.getId())
                    .append(" 名称=").append(c.template.getName());
            if (c.template.getPeriodType() != null) {
                catalog.append(" 周期类型=").append(c.template.getPeriodType());
            }
            catalog.append('\n');
            catalog.append("  可用指标: ").append(c.metrics.isEmpty() ? "（无数值指标）"
                    : c.metrics.stream().map(Metric::promptHint)
                    .collect(Collectors.joining("、"))).append('\n');
            if (!c.others.isEmpty()) {
                catalog.append("  其他字段: ").append(c.others.stream().limit(15)
                        .map(ReportTemplateField::getFieldLabel).collect(Collectors.joining("、"))).append('\n');
            }
            catalog.append("  已有周期: ").append(c.periods.isEmpty() ? "（尚未下发）"
                    : String.join("、", c.periods)).append('\n');
        }

        String systemPrompt = """
                你是企业报表系统的数据查询助手。用户用自然语言提问，你需要把问题解析成 JSON 查询计划。

                当前用户可查询的报表清单：
                """ + catalog + """

                请只输出一个 JSON 对象，字段如下：
                - template_id: 整数，必须来自上面清单
                - period_labels: 字符串数组，必须原样来自该模板的「已有周期」；用户未指定时取最近 1 个周期；问趋势/多期对比时可取多个（最多 12 个）
                - metric_field_names: 字符串数组，必须来自该模板的「可用指标」字段名；用户未指定时留空数组表示全部
                - dimension: "company" 表示按机构横向对比，"period" 表示按周期看趋势
                - aggregation: "sum" | "avg" | "max" | "min"；默认 sum；用户问「平均/均值」用 avg，「最高/最大」用 max，「最低/最小」用 min
                - company_names: 字符串数组；用户点名了具体机构（如「北京分公司」「上海」）时填写机构名，否则留空数组表示全部机构
                - chart_type: "bar" | "line" | "pie" | "table"；趋势用 line，机构对比用 bar，占比用 pie，无需图表用 table
                - title: 简短中文图表标题
                - unanswerable_reason: 若问题与报表数据无关、或所需报表/指标不在清单中，填写一句中文说明；否则为 null

                注意：不要编造清单外的模板、指标或周期；不要输出 JSON 以外的任何文字。
                """;

        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt));
        if (history != null) {
            List<Map<String, String>> recent = history.size() > MAX_HISTORY_MESSAGES
                    ? history.subList(history.size() - MAX_HISTORY_MESSAGES, history.size())
                    : history;
            for (Map<String, String> h : recent) {
                String role = h.get("role");
                String content = h.get("content");
                if (content == null || content.isBlank()) continue;
                if (!"user".equals(role) && !"assistant".equals(role)) continue;
                messages.add(Map.of("role", role, "content", truncate(content, 500)));
            }
        }
        messages.add(Map.of("role", "user", "content", question));
        return messages;
    }

    // ---- 结果组装 ----

    /** 机构维度表格：周期 × 机构 × 指标 */
    private Map<String, Object> buildCompanyTable(List<PeriodData> periodDataList, List<Metric> metrics,
                                                  Agg agg, List<String> companyFilter) {
        boolean multiPeriod = periodDataList.size() > 1;
        List<String> columns = new ArrayList<>();
        if (multiPeriod) columns.add("周期");
        columns.add("机构");
        metrics.forEach(m -> columns.add(m.companyColumn(agg)));

        List<List<String>> rows = new ArrayList<>();
        for (PeriodData pd : periodDataList) {
            for (Map<String, Object> company : pd.companyData()) {
                if (!matchesCompany(str(company.get("company_name")), companyFilter)) continue;
                List<String> row = new ArrayList<>();
                if (multiPeriod) row.add(pd.period);
                row.add(str(company.get("company_name")));
                boolean submitted = Boolean.TRUE.equals(company.get("has_submitted"));
                for (Metric m : metrics) {
                    row.add(submitted ? formatNumber(companyValue(pd, company, m, agg)) : "-");
                }
                rows.add(row);
            }
        }
        Map<String, Object> table = new LinkedHashMap<>();
        table.put("columns", columns);
        table.put("rows", rows);
        return table;
    }

    /** 周期维度表格：周期 × 指标聚合值 */
    private Map<String, Object> buildPeriodTable(List<PeriodData> periodDataList, List<Metric> metrics,
                                                 Agg agg, List<String> companyFilter) {
        List<String> columns = new ArrayList<>();
        columns.add("周期");
        metrics.forEach(m -> columns.add(m.periodColumn(agg)));
        columns.add("已提交机构数");

        List<List<String>> rows = new ArrayList<>();
        for (PeriodData pd : periodDataList) {
            List<String> row = new ArrayList<>();
            row.add(pd.period);
            for (Metric m : metrics) {
                row.add(formatNumber(periodTotal(pd, m, agg, companyFilter)));
            }
            row.add(String.valueOf(pd.submittedCount()));
            rows.add(row);
        }
        Map<String, Object> table = new LinkedHashMap<>();
        table.put("columns", columns);
        table.put("rows", rows);
        return table;
    }

    /** 某机构在某周期的指标值：汇总取汇总区，明细按该机构明细行聚合 */
    private double companyValue(PeriodData pd, Map<String, Object> companyRow, Metric metric, Agg agg) {
        return switch (metric.source()) {
            case SUMMARY -> parseDouble(valuesOf(companyRow).get(metric.fieldName()));
            case DETAIL -> agg.apply(pd.detailValues(str(companyRow.get("company_name")), metric.fieldName()));
            case ROW_COUNT -> pd.detailRowCount(str(companyRow.get("company_name")));
        };
    }

    /**
     * 某周期的指标聚合值。
     * 汇总指标在「机构」粒度上聚合（平均=机构平均），明细指标在「明细行」粒度上聚合（平均=单行平均）。
     */
    private double periodTotal(PeriodData pd, Metric metric, Agg agg, List<String> companyFilter) {
        return switch (metric.source()) {
            case SUMMARY -> {
                if (agg == Agg.SUM && companyFilter.isEmpty()) {
                    yield pd.total(metric.fieldName());
                }
                List<Double> values = pd.companyData().stream()
                        .filter(c -> Boolean.TRUE.equals(c.get("has_submitted")))
                        .filter(c -> matchesCompany(str(c.get("company_name")), companyFilter))
                        .map(c -> parseDouble(valuesOf(c).get(metric.fieldName())))
                        .collect(Collectors.toList());
                yield agg.apply(values);
            }
            case DETAIL -> {
                if (agg == Agg.SUM && companyFilter.isEmpty()) {
                    yield pd.detailTotal(metric.fieldName());
                }
                yield agg.apply(pd.detailValues(companyFilter, metric.fieldName(), this::matchesCompany));
            }
            case ROW_COUNT -> pd.detailRowCount(companyFilter, this::matchesCompany);
        };
    }

    /** 机构名模糊匹配：空筛选放行全部；「北京」可命中「北京分公司」 */
    private boolean matchesCompany(String companyName, List<String> filter) {
        if (filter.isEmpty()) {
            return true;
        }
        return filter.stream().anyMatch(f -> companyName.contains(f) || f.contains(companyName));
    }

    private Map<String, Object> buildCompanyChart(List<PeriodData> periodDataList, List<Metric> metrics,
                                                  String chartType, String title, Agg agg, List<String> companyFilter) {
        List<String> categories = new ArrayList<>(new LinkedHashSet<>(periodDataList.stream()
                .flatMap(pd -> pd.companyData().stream())
                .map(c -> str(c.get("company_name")))
                .filter(name -> matchesCompany(name, companyFilter))
                .collect(Collectors.toList())));

        List<Map<String, Object>> series = new ArrayList<>();
        boolean multiPeriod = periodDataList.size() > 1;
        for (PeriodData pd : periodDataList) {
            Map<String, Map<String, Object>> byCompany = pd.companyData().stream()
                    .collect(Collectors.toMap(c -> str(c.get("company_name")), c -> c, (a, b) -> a, LinkedHashMap::new));
            for (Metric m : metrics) {
                List<Double> data = new ArrayList<>();
                for (String category : categories) {
                    Map<String, Object> company = byCompany.get(category);
                    data.add(company == null ? 0.0 : companyValue(pd, company, m, agg));
                }
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("name", multiPeriod ? pd.period + " " + m.label() : m.label());
                s.put("data", data);
                series.add(s);
            }
        }
        return chart(chartType, title, categories, series);
    }

    private Map<String, Object> buildPeriodChart(List<PeriodData> periodDataList, List<Metric> metrics,
                                                 String chartType, String title, Agg agg, List<String> companyFilter) {
        // 周期趋势按时间正序展示，便于阅读
        List<PeriodData> ordered = new ArrayList<>(periodDataList);
        ordered.sort(Comparator.comparing(pd -> pd.period));
        List<String> categories = ordered.stream().map(pd -> pd.period).collect(Collectors.toList());

        List<Map<String, Object>> series = new ArrayList<>();
        for (Metric m : metrics) {
            List<Double> data = ordered.stream().map(pd -> periodTotal(pd, m, agg, companyFilter))
                    .collect(Collectors.toList());
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("name", m.label());
            s.put("data", data);
            series.add(s);
        }
        return chart(chartType, title, categories, series);
    }

    private Map<String, Object> chart(String type, String title, List<String> categories,
                                      List<Map<String, Object>> series) {
        Map<String, Object> chart = new LinkedHashMap<>();
        chart.put("type", type);
        chart.put("title", title);
        chart.put("categories", categories);
        chart.put("series", series);
        return chart;
    }

    /** 让模型基于查出的数据生成结论；调用失败时降级为规则文案，不影响数据返回 */
    private String summarize(String question, TemplateContext ctx, List<String> periods,
                             List<Metric> metrics, Map<String, Object> table,
                             Agg agg, List<String> companyFilter) {
        String dataText = tableToText(table);
        StringBuilder userPrompt = new StringBuilder();
        userPrompt.append("用户问题：").append(question).append("\n\n")
                .append("报表：").append(ctx.template.getName()).append('\n')
                .append("周期：").append(String.join("、", periods)).append('\n')
                .append("指标：").append(metrics.stream().map(Metric::label).collect(Collectors.joining("、"))).append('\n');
        if (agg != Agg.SUM) {
            userPrompt.append("聚合方式：").append(agg.cn()).append('\n');
        }
        if (!companyFilter.isEmpty()) {
            userPrompt.append("机构范围：").append(String.join("、", companyFilter)).append('\n');
        }
        userPrompt.append("查询结果（“-”表示该机构未提交）：\n").append(dataText);
        String systemPrompt = """
                你是企业报表数据分析助手。请基于给定的查询结果，用 2 到 4 句简洁中文回答用户问题。
                要求：直接给出结论与关键数字（合计、最高/最低机构、环比变化等）；不要编造数据；不要罗列全部明细；不要使用 Markdown 表格。
                """;
        try {
            String answer = aiClient.chat(AiClient.messages(systemPrompt, userPrompt.toString()), false);
            if (answer != null && !answer.isBlank()) {
                return answer.trim();
            }
        } catch (DomainException e) {
            log.warn("生成结论失败，降级为规则文案: {}", e.getMessage());
        }
        int rowCount = rowsOf(table).size();
        return "已按「" + ctx.template.getName() + "」查询到 " + rowCount + " 条数据，详见下方图表与表格。";
    }

    private String tableToText(Map<String, Object> table) {
        List<String> columns = columnsOf(table);
        List<List<String>> rows = rowsOf(table);
        StringBuilder sb = new StringBuilder();
        // 用竖线分隔：数值已带千分位逗号，不能再用逗号当分隔符
        sb.append(String.join(" | ", columns)).append('\n');
        int limit = Math.min(rows.size(), MAX_ROWS_FOR_SUMMARY);
        for (int i = 0; i < limit; i++) {
            sb.append(String.join(" | ", rows.get(i))).append('\n');
        }
        if (rows.size() > limit) {
            sb.append("（其余 ").append(rows.size() - limit).append(" 行已省略）\n");
        }
        return sb.toString();
    }

    // ---- helpers ----

    private Map<String, Object> textOnly(String answer, List<TemplateContext> contexts) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("answer", answer);
        result.put("plan", null);
        result.put("chart", null);
        result.put("table", null);
        result.put("scope_note", contexts.isEmpty() ? null
                : "可问数的报表：" + contexts.stream().map(c -> c.template.getName()).collect(Collectors.joining("、")));
        return result;
    }

    private String scopeHint(List<TemplateContext> contexts) {
        if (contexts.isEmpty()) {
            return "";
        }
        return "当前可问数的报表有：" + contexts.stream().map(c -> c.template.getName())
                .collect(Collectors.joining("、")) + "。";
    }

    /** 模型可能在 JSON 外包裹说明文字或代码块，这里做一次宽松提取 */
    private JsonNode parseJsonLoose(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(raw);
        } catch (Exception ignored) {
            // 继续尝试截取首个 JSON 对象
        }
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return objectMapper.readTree(raw.substring(start, end + 1));
            } catch (Exception ignored) {
                // 落到返回 null
            }
        }
        return null;
    }

    private String normalizeChartType(String type) {
        if (type == null) return "bar";
        return switch (type) {
            case "line", "pie", "table" -> type;
            default -> "bar";
        };
    }

    private String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isTextual() ? v.asText() : null;
    }

    private List<String> stringList(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<String> list = new ArrayList<>();
        node.forEach(n -> {
            if (n.isTextual() && !n.asText().isBlank()) {
                list.add(n.asText());
            }
        });
        return list;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> valuesOf(Map<String, Object> companyRow) {
        Object values = companyRow.get("values");
        return values instanceof Map ? (Map<String, Object>) values : Collections.emptyMap();
    }

    @SuppressWarnings("unchecked")
    private List<String> columnsOf(Map<String, Object> table) {
        Object columns = table.get("columns");
        return columns instanceof List ? (List<String>) columns : List.of();
    }

    @SuppressWarnings("unchecked")
    private List<List<String>> rowsOf(Map<String, Object> table) {
        Object rows = table.get("rows");
        return rows instanceof List ? (List<List<String>>) rows : List.of();
    }

    private double parseDouble(Object value) {
        if (value == null) return 0;
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** 整数去掉小数尾巴，其余保留两位；千分位分组，便于模型与前端阅读大数 */
    private String formatNumber(double value) {
        if (value == Math.rint(value) && !Double.isInfinite(value)) {
            return String.format(Locale.ROOT, "%,d", (long) value);
        }
        return String.format(Locale.ROOT, "%,.2f", value);
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String truncate(String text, int max) {
        return text.length() > max ? text.substring(0, max) : text;
    }

    /** 单个模板的问数上下文 */
    private record TemplateContext(ReportTemplate template,
                                   List<Metric> metrics,
                                   List<ReportTemplateField> others,
                                   List<String> periods) {
    }

    /** 指标取值来源：汇总区数值字段 / 明细区数值字段逐行累计 / 明细行数 */
    private enum MetricSource { SUMMARY, DETAIL, ROW_COUNT }

    /** 聚合方式：合计 / 平均 / 最高 / 最低 */
    private enum Agg {
        SUM("合计"), AVG("平均"), MAX("最高"), MIN("最低");

        private final String cn;

        Agg(String cn) {
            this.cn = cn;
        }

        String cn() {
            return cn;
        }

        static Agg parse(String raw) {
            if (raw == null) return SUM;
            return switch (raw.trim().toLowerCase()) {
                case "avg", "average", "mean" -> AVG;
                case "max" -> MAX;
                case "min" -> MIN;
                default -> SUM;
            };
        }

        double apply(List<Double> values) {
            if (values.isEmpty()) return 0;
            return switch (this) {
                case SUM -> values.stream().mapToDouble(Double::doubleValue).sum();
                case AVG -> values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
                case MAX -> values.stream().mapToDouble(Double::doubleValue).max().orElse(0);
                case MIN -> values.stream().mapToDouble(Double::doubleValue).min().orElse(0);
            };
        }
    }

    /** 一个可问数的指标 */
    private record Metric(String fieldName, String label, MetricSource source, boolean identifierLike) {

        Metric(String fieldName, String label, MetricSource source) {
            this(fieldName, label, source, false);
        }

        /** 机构维度列名：明细指标为该机构明细行的聚合值 */
        String companyColumn(Agg agg) {
            return source == MetricSource.SUMMARY ? label : periodColumn(agg);
        }

        /** 周期维度列名：均为全机构聚合值 */
        String periodColumn(Agg agg) {
            return source == MetricSource.ROW_COUNT ? label : label + "（" + agg.cn() + "）";
        }

        String promptHint() {
            if (identifierLike) {
                return fieldName + "(" + label + "，标识类字段，求和无意义，除非用户明确要求否则不要选)";
            }
            return switch (source) {
                case SUMMARY -> fieldName + "(" + label + ")";
                case DETAIL -> fieldName + "(" + label + "，明细逐行合计)";
                case ROW_COUNT -> fieldName + "(" + label + "，明细行数，如台数/条数)";
            };
        }
    }

    /** 车牌号、发动机号一类的标识字段虽存为数值，但求和无意义，默认不作为指标 */
    private static boolean looksLikeIdentifier(ReportTemplateField field) {
        String name = field.getFieldName() == null ? "" : field.getFieldName().toLowerCase();
        String label = field.getFieldLabel() == null ? "" : field.getFieldLabel();
        return name.endsWith("_no") || name.endsWith("_code") || name.endsWith("_id")
                || name.equals("no") || name.equals("code") || name.equals("id")
                || label.contains("号") || label.contains("编码") || label.contains("代码");
    }

    /** 单个周期的汇总取数结果 */
    private static final class PeriodData {
        private final String period;
        private final Map<String, Object> aggregation;
        /** 明细行按机构分组的索引，懒加载 */
        private Map<String, List<Map<String, Object>>> detailIndex;

        PeriodData(String period, Map<String, Object> aggregation) {
            this.period = period;
            this.aggregation = aggregation;
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> companyData() {
            Object data = aggregation.get("company_data");
            return data instanceof List ? (List<Map<String, Object>>) data : List.of();
        }

        @SuppressWarnings("unchecked")
        double total(String fieldName) {
            Object summary = aggregation.get("summary");
            if (!(summary instanceof Map)) return 0;
            Object metric = ((Map<String, Object>) summary).get(fieldName);
            if (!(metric instanceof Map)) return 0;
            Object total = ((Map<String, Object>) metric).get("total");
            if (total == null) return 0;
            try {
                return Double.parseDouble(String.valueOf(total));
            } catch (NumberFormatException e) {
                return 0;
            }
        }

        /** 明细/交叉表数值字段的全机构合计 */
        @SuppressWarnings("unchecked")
        double detailTotal(String fieldName) {
            Object detailSummary = aggregation.get("detail_summary");
            if (!(detailSummary instanceof Map)) return 0;
            Object metric = ((Map<String, Object>) detailSummary).get(fieldName);
            if (!(metric instanceof Map)) return 0;
            return num(((Map<String, Object>) metric).get("total"));
        }

        /** 指定机构明细行中某数值字段的取值列表（供 sum/avg/max/min 聚合） */
        List<Double> detailValues(String companyName, String fieldName) {
            return detailRowsOf(companyName).stream()
                    .map(row -> num(row.get(fieldName)))
                    .collect(Collectors.toList());
        }

        /** 按机构筛选后全部明细行中某数值字段的取值列表 */
        List<Double> detailValues(List<String> companyFilter, String fieldName,
                                  BiPredicate<String, List<String>> matcher) {
            return detailRows().stream()
                    .filter(row -> matcher.test(row.get("company_name") == null ? ""
                            : String.valueOf(row.get("company_name")), companyFilter))
                    .map(row -> num(row.get(fieldName)))
                    .collect(Collectors.toList());
        }

        /** 指定机构的明细行数 */
        int detailRowCount(String companyName) {
            return detailRowsOf(companyName).size();
        }

        /** 按机构筛选后的明细行数 */
        int detailRowCount(List<String> companyFilter, BiPredicate<String, List<String>> matcher) {
            return (int) detailRows().stream()
                    .filter(row -> matcher.test(row.get("company_name") == null ? ""
                            : String.valueOf(row.get("company_name")), companyFilter))
                    .count();
        }

        private List<Map<String, Object>> detailRowsOf(String companyName) {
            if (detailIndex == null) {
                detailIndex = detailRows().stream().collect(Collectors.groupingBy(
                        r -> r.get("company_name") == null ? "" : String.valueOf(r.get("company_name")),
                        LinkedHashMap::new, Collectors.toList()));
            }
            return detailIndex.getOrDefault(companyName == null ? "" : companyName, List.of());
        }

        @SuppressWarnings("unchecked")
        private List<Map<String, Object>> detailRows() {
            Object rows = aggregation.get("detail_rows");
            return rows instanceof List ? (List<Map<String, Object>>) rows : List.of();
        }

        private static double num(Object value) {
            if (value == null) return 0;
            try {
                return Double.parseDouble(String.valueOf(value));
            } catch (NumberFormatException e) {
                return 0;
            }
        }

        int submittedCount() {
            return (int) companyData().stream().filter(c -> Boolean.TRUE.equals(c.get("has_submitted"))).count();
        }
    }
}
