package com.freereport.service;

import com.freereport.exception.DomainException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/**
 * 智能问数结果构建：按机构/周期/字段分组三种维度生成表格与图表数据，
 * 并让模型基于查出的数据生成文字结论（失败时降级为规则文案，不影响数据返回）。
 */
@Slf4j
@Component
public class AiResultBuilder {

    /** 交给模型总结的数据行上限 */
    private static final int MAX_ROWS_FOR_SUMMARY = 50;

    private final AiClient aiClient;

    public AiResultBuilder(AiClient aiClient) {
        this.aiClient = aiClient;
    }

    /** 机构筛选在真实机构名上做模糊匹配校验，全都对不上时忽略筛选而不是返回空结果 */
    public List<String> effectiveCompanyFilter(List<AiPeriodData> periodDataList, List<String> requestedCompanies) {
        boolean filterMatched = periodDataList.stream()
                .flatMap(pd -> pd.companyData().stream())
                .anyMatch(c -> matchesCompany(str(c.get("company_name")), requestedCompanies));
        return (!requestedCompanies.isEmpty() && filterMatched) ? requestedCompanies : List.of();
    }

    /** 按维度分派构建表格 */
    public Map<String, Object> buildTable(List<AiPeriodData> periodDataList, AiResolvedPlan plan,
                                          List<String> companyFilter) {
        if ("field".equals(plan.dimension()) && plan.groupByField() != null) {
            return buildFieldGroupTable(periodDataList, plan.groupByField(), plan.groupByFieldLabel(),
                    plan.metrics(), plan.agg());
        } else if ("period".equals(plan.dimension())) {
            return buildPeriodTable(periodDataList, plan.metrics(), plan.agg(), companyFilter);
        } else {
            return buildCompanyTable(periodDataList, plan.metrics(), plan.agg(), companyFilter);
        }
    }

    /** 按维度分派构建图表 */
    public Map<String, Object> buildChart(List<AiPeriodData> periodDataList, AiResolvedPlan plan,
                                          List<String> companyFilter) {
        if ("field".equals(plan.dimension()) && plan.groupByField() != null) {
            return buildFieldGroupChart(periodDataList, plan.groupByField(), plan.groupByFieldLabel(),
                    plan.metrics(), plan.chartType(), plan.title(), plan.agg());
        } else if ("period".equals(plan.dimension())) {
            return buildPeriodChart(periodDataList, plan.metrics(), plan.chartType(), plan.title(),
                    plan.agg(), companyFilter);
        } else {
            return buildCompanyChart(periodDataList, plan.metrics(), plan.chartType(), plan.title(),
                    plan.agg(), companyFilter);
        }
    }

    /** 让模型基于查出的数据生成结论；调用失败时降级为规则文案，不影响数据返回 */
    public String summarize(String question, AiResolvedPlan plan, Map<String, Object> table,
                            List<String> companyFilter) {
        List<Map<String, String>> messages = buildSummaryMessages(question, plan, table, companyFilter);
        try {
            String answer = aiClient.chat(messages, false);
            if (answer != null && !answer.isBlank()) {
                return answer.trim();
            }
        } catch (DomainException e) {
            log.warn("生成结论失败，降级为规则文案: {}", e.getMessage());
        }
        int rowCount = rowsOf(table).size();
        return "已按「" + plan.ctx().template().getName() + "」查询到 " + rowCount + " 条数据，详见下方图表与表格。";
    }

    /**
     * 流式生成结论：每收到一个 token 即通过 onChunk 回调推送给调用方。
     * 调用方负责将 chunk 写入 SSE emitter。失败时降级为规则文案。
     *
     * @return 最终完整的结论文本（用于审计/完整响应）
     */
    public String summarizeStream(String question, AiResolvedPlan plan, Map<String, Object> table,
                                  List<String> companyFilter, Consumer<String> onChunk) {
        List<Map<String, String>> messages = buildSummaryMessages(question, plan, table, companyFilter);
        try {
            String answer = aiClient.streamChat(messages, onChunk);
            if (answer != null && !answer.isBlank()) {
                return answer.trim();
            }
        } catch (DomainException e) {
            log.warn("流式生成结论失败，降级为规则文案: {}", e.getMessage());
        }
        int rowCount = rowsOf(table).size();
        String fallback = "已按「" + plan.ctx().template().getName() + "」查询到 " + rowCount + " 条数据，详见下方图表与表格。";
        onChunk.accept(fallback);
        return fallback;
    }

    /** 构建总结阶段的对话消息列表（非流式与流式共用） */
    private List<Map<String, String>> buildSummaryMessages(String question, AiResolvedPlan plan,
                                                           Map<String, Object> table, List<String> companyFilter) {
        AiTemplateContext ctx = plan.ctx();
        String dataText = tableToText(table);
        StringBuilder userPrompt = new StringBuilder();
        userPrompt.append("用户问题：").append(question).append("\n\n")
                .append("报表：").append(ctx.template().getName()).append('\n')
                .append("周期：").append(String.join("、", plan.periods())).append('\n')
                .append("指标：").append(plan.metrics().stream().map(AiMetric::label).collect(Collectors.joining("、"))).append('\n');
        if (plan.groupByFieldLabel() != null) {
            userPrompt.append("分组字段：").append(plan.groupByFieldLabel()).append('\n');
        }
        if (plan.agg() != AiAgg.SUM) {
            userPrompt.append("聚合方式：").append(plan.agg().cn()).append('\n');
        }
        if (!companyFilter.isEmpty()) {
            userPrompt.append("机构范围：").append(String.join("、", companyFilter)).append('\n');
        }
        userPrompt.append("查询结果（“-”表示该机构未提交）：\n").append(dataText);
        String systemPrompt = """
                你是企业报表数据分析助手。请基于给定的查询结果，用 2 到 4 句简洁中文回答用户问题。
                要求：直接给出结论与关键数字（合计、最高/最低机构、环比变化等）；不要编造数据；不要罗列全部明细；不要使用 Markdown 表格。
                """;
        return AiClient.messages(systemPrompt, userPrompt.toString());
    }

    // ---- 表格构建 ----

    /** 机构维度表格：周期 × 机构 × 指标 */
    private Map<String, Object> buildCompanyTable(List<AiPeriodData> periodDataList, List<AiMetric> metrics,
                                                  AiAgg agg, List<String> companyFilter) {
        boolean multiPeriod = periodDataList.size() > 1;
        List<String> columns = new ArrayList<>();
        if (multiPeriod) columns.add("周期");
        columns.add("机构");
        metrics.forEach(m -> columns.add(m.companyColumn(agg)));

        List<List<String>> rows = new ArrayList<>();
        for (AiPeriodData pd : periodDataList) {
            for (Map<String, Object> company : pd.companyData()) {
                if (!matchesCompany(str(company.get("company_name")), companyFilter)) continue;
                List<String> row = new ArrayList<>();
                if (multiPeriod) row.add(pd.period());
                row.add(str(company.get("company_name")));
                boolean submitted = Boolean.TRUE.equals(company.get("has_submitted"));
                for (AiMetric m : metrics) {
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
    private Map<String, Object> buildPeriodTable(List<AiPeriodData> periodDataList, List<AiMetric> metrics,
                                                 AiAgg agg, List<String> companyFilter) {
        List<String> columns = new ArrayList<>();
        columns.add("周期");
        metrics.forEach(m -> columns.add(m.periodColumn(agg)));
        columns.add("已提交机构数");

        List<List<String>> rows = new ArrayList<>();
        for (AiPeriodData pd : periodDataList) {
            List<String> row = new ArrayList<>();
            row.add(pd.period());
            for (AiMetric m : metrics) {
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

    /** 按明细字段分组的表格：分组值 × 指标聚合值 */
    private Map<String, Object> buildFieldGroupTable(List<AiPeriodData> periodDataList,
                                                     String groupByField, String groupByFieldLabel,
                                                     List<AiMetric> metrics, AiAgg agg) {
        boolean multiPeriod = periodDataList.size() > 1;
        List<String> columns = new ArrayList<>();
        if (multiPeriod) columns.add("周期");
        columns.add(groupByFieldLabel);
        metrics.forEach(m -> columns.add(m.periodColumn(agg)));

        List<List<String>> rows = new ArrayList<>();
        for (AiPeriodData pd : periodDataList) {
            Map<String, List<Map<String, Object>>> groups = pd.detailRowsGroupedBy(groupByField);
            // 按第一个指标的聚合值降序排列，使关键分组排在前面
            List<Map.Entry<String, List<Map<String, Object>>>> sorted = new ArrayList<>(groups.entrySet());
            if (!metrics.isEmpty()) {
                AiMetric first = metrics.get(0);
                sorted.sort((a, b) -> {
                    double va = first.source() == AiMetric.Source.ROW_COUNT
                            ? a.getValue().size()
                            : agg.apply(a.getValue().stream()
                                    .map(r -> parseDouble(r.get(first.fieldName())))
                                    .collect(Collectors.toList()));
                    double vb = first.source() == AiMetric.Source.ROW_COUNT
                            ? b.getValue().size()
                            : agg.apply(b.getValue().stream()
                                    .map(r -> parseDouble(r.get(first.fieldName())))
                                    .collect(Collectors.toList()));
                    return Double.compare(vb, va);
                });
            }
            for (Map.Entry<String, List<Map<String, Object>>> entry : sorted) {
                List<String> row = new ArrayList<>();
                if (multiPeriod) row.add(pd.period());
                row.add(entry.getKey());
                for (AiMetric m : metrics) {
                    if (m.source() == AiMetric.Source.ROW_COUNT) {
                        row.add(String.valueOf(entry.getValue().size()));
                    } else {
                        List<Double> values = entry.getValue().stream()
                                .map(r -> parseDouble(r.get(m.fieldName())))
                                .collect(Collectors.toList());
                        row.add(formatNumber(agg.apply(values)));
                    }
                }
                rows.add(row);
            }
        }
        Map<String, Object> table = new LinkedHashMap<>();
        table.put("columns", columns);
        table.put("rows", rows);
        return table;
    }

    // ---- 图表构建 ----

    private Map<String, Object> buildCompanyChart(List<AiPeriodData> periodDataList, List<AiMetric> metrics,
                                                  String chartType, String title, AiAgg agg,
                                                  List<String> companyFilter) {
        List<String> categories = new ArrayList<>(new LinkedHashSet<>(periodDataList.stream()
                .flatMap(pd -> pd.companyData().stream())
                .map(c -> str(c.get("company_name")))
                .filter(name -> matchesCompany(name, companyFilter))
                .collect(Collectors.toList())));

        List<Map<String, Object>> series = new ArrayList<>();
        boolean multiPeriod = periodDataList.size() > 1;
        for (AiPeriodData pd : periodDataList) {
            Map<String, Map<String, Object>> byCompany = pd.companyData().stream()
                    .collect(Collectors.toMap(c -> str(c.get("company_name")), c -> c, (a, b) -> a, LinkedHashMap::new));
            for (AiMetric m : metrics) {
                List<Double> data = new ArrayList<>();
                for (String category : categories) {
                    Map<String, Object> company = byCompany.get(category);
                    data.add(company == null ? 0.0 : companyValue(pd, company, m, agg));
                }
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("name", multiPeriod ? pd.period() + " " + m.label() : m.label());
                s.put("data", data);
                series.add(s);
            }
        }
        return chart(chartType, title, categories, series);
    }

    private Map<String, Object> buildPeriodChart(List<AiPeriodData> periodDataList, List<AiMetric> metrics,
                                                 String chartType, String title, AiAgg agg,
                                                 List<String> companyFilter) {
        // 周期趋势按时间正序展示，便于阅读
        List<AiPeriodData> ordered = new ArrayList<>(periodDataList);
        ordered.sort(Comparator.comparing(AiPeriodData::period));
        List<String> categories = ordered.stream().map(AiPeriodData::period).collect(Collectors.toList());

        List<Map<String, Object>> series = new ArrayList<>();
        for (AiMetric m : metrics) {
            List<Double> data = ordered.stream().map(pd -> periodTotal(pd, m, agg, companyFilter))
                    .collect(Collectors.toList());
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("name", m.label());
            s.put("data", data);
            series.add(s);
        }
        return chart(chartType, title, categories, series);
    }

    /** 按明细字段分组的图表 */
    private Map<String, Object> buildFieldGroupChart(List<AiPeriodData> periodDataList,
                                                     String groupByField, String groupByFieldLabel,
                                                     List<AiMetric> metrics, String chartType,
                                                     String title, AiAgg agg) {
        // 收集所有分组值（按首次出现的顺序，保持稳定）
        List<String> categories = new ArrayList<>(new LinkedHashSet<>(periodDataList.stream()
                .flatMap(pd -> pd.detailRowsGroupedBy(groupByField).keySet().stream())
                .collect(Collectors.toList())));

        List<Map<String, Object>> series = new ArrayList<>();
        boolean multiPeriod = periodDataList.size() > 1;
        for (AiPeriodData pd : periodDataList) {
            Map<String, List<Map<String, Object>>> groups = pd.detailRowsGroupedBy(groupByField);
            for (AiMetric m : metrics) {
                List<Double> data = new ArrayList<>();
                for (String cat : categories) {
                    List<Map<String, Object>> groupRows = groups.get(cat);
                    if (groupRows == null) {
                        data.add(0.0);
                    } else if (m.source() == AiMetric.Source.ROW_COUNT) {
                        data.add((double) groupRows.size());
                    } else {
                        List<Double> values = groupRows.stream()
                                .map(r -> parseDouble(r.get(m.fieldName())))
                                .collect(Collectors.toList());
                        data.add(agg.apply(values));
                    }
                }
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("name", multiPeriod ? pd.period() + " " + m.label() : m.label());
                s.put("data", data);
                series.add(s);
            }
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

    // ---- 取值 ----

    /** 某机构在某周期的指标值：汇总取汇总区，明细按该机构明细行聚合 */
    private double companyValue(AiPeriodData pd, Map<String, Object> companyRow, AiMetric metric, AiAgg agg) {
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
    private double periodTotal(AiPeriodData pd, AiMetric metric, AiAgg agg, List<String> companyFilter) {
        return switch (metric.source()) {
            case SUMMARY -> {
                if (agg == AiAgg.SUM && companyFilter.isEmpty()) {
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
                if (agg == AiAgg.SUM && companyFilter.isEmpty()) {
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

    // ---- helpers ----

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
}
