package com.freereport.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.freereport.entity.ReportTemplateField;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 智能问数计划解析：构建 LLM 计划阶段的 prompt、宽松解析模型输出的 JSON、
 * 并对模板/指标/周期/分组字段做白名单校验与默认值回退，产出可直接取数的查询计划。
 */
@Slf4j
@Component
public class AiPlanResolver {

    /** 单次查询最多涉及的周期数，防止 prompt 与响应体过大 */
    private static final int MAX_PERIODS = 12;
    /** 单次查询最多涉及的指标数 */
    private static final int MAX_METRICS = 6;
    /** 用户未指定指标时默认采用的指标数 */
    private static final int DEFAULT_METRICS = 3;
    /** 携带的历史对话轮次上限 */
    private static final int MAX_HISTORY_MESSAGES = 6;

    private final ObjectMapper objectMapper;

    public AiPlanResolver(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 构建计划阶段的 LLM 消息：system prompt（含报表清单）+ 最近对话 + 用户问题 */
    public List<Map<String, String>> buildPlanMessages(String question, List<Map<String, String>> history,
                                                       List<AiTemplateContext> contexts) {
        StringBuilder catalog = new StringBuilder();
        for (AiTemplateContext c : contexts) {
            catalog.append("- 模板ID=").append(c.template().getId())
                    .append(" 名称=").append(c.template().getName());
            if (c.template().getPeriodType() != null) {
                catalog.append(" 周期类型=").append(c.template().getPeriodType());
            }
            catalog.append('\n');
            catalog.append("  可用指标: ").append(c.metrics().isEmpty() ? "（无数值指标）"
                    : c.metrics().stream().map(AiMetric::promptHint)
                    .collect(Collectors.joining("、"))).append('\n');
            if (!c.groupableFields().isEmpty()) {
                catalog.append("  可分组字段: ").append(c.groupableFields().stream()
                        .map(f -> f.getFieldName() + "(" + f.getFieldLabel() + ")")
                        .collect(Collectors.joining("、"))).append('\n');
            }
            if (!c.others().isEmpty()) {
                catalog.append("  其他字段: ").append(c.others().stream().limit(15)
                        .map(ReportTemplateField::getFieldLabel).collect(Collectors.joining("、"))).append('\n');
            }
            catalog.append("  已有周期: ").append(c.periods().isEmpty() ? "（尚未下发）"
                    : String.join("、", c.periods())).append('\n');
        }

        String systemPrompt = """
                你是企业报表系统的数据查询助手。用户用自然语言提问，你需要把问题解析成 JSON 查询计划。

                当前用户可查询的报表清单：
                """ + catalog + """

                请只输出一个 JSON 对象，字段如下：
                - template_id: 整数，必须来自上面清单
                - period_labels: 字符串数组，必须原样来自该模板的「已有周期」；用户未指定时取最近 1 个周期；问趋势/多期对比时可取多个（最多 12 个）
                - metric_field_names: 字符串数组，必须来自该模板的「可用指标」字段名；用户未指定时留空数组表示全部
                - dimension: "company" 表示按上报机构横向对比，"period" 表示按周期看趋势，"field" 表示按某个明细字段分组统计
                - group_by_field: 当 dimension="field" 时必填，填写要分组的字段名（必须来自「可分组字段」列出的字段名）；否则为 null
                  使用规则：用户说「按XX统计/按XX分析/按XX分组」时，若XX与「可分组字段」中某个字段的标签匹配，必须用 dimension="field" 且 group_by_field 填对应字段名
                  注意：「机构名称」这类字段是明细数据中的列，与上报机构(company)不同；按它分组时应选 dimension="field"
                - aggregation: "sum" | "avg" | "max" | "min"; 默认 sum; 用户问「平均/均值」用 avg，「最高/最大」用 max，「最低/最小」用 min
                - company_names: 字符串数组；用户点名了具体机构（如「北京分公司」「上海」）时填写机构名，否则留空数组表示全部机构
                - chart_type: "bar" | "line" | "pie" | "table"; 趋势用 line，机构对比用 bar，占比用 pie，分组对比用 bar，无需图表用 table
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

    /**
     * 解析模型输出的 JSON 计划并做白名单校验与默认值回退。
     * 返回文本答案时表示该问题无法/无需取数（含原因文案），主流程直接返回给用户。
     */
    public PlanResult resolve(String planJson, List<AiTemplateContext> contexts) {
        JsonNode plan = parseJsonLoose(planJson);
        if (plan == null) {
            log.warn("查询计划解析失败，原始响应: {}", planJson);
            return PlanResult.text("没能理解这个问题，请换一种说法，例如「2026年07月各机构的总收入是多少」。" + scopeHint(contexts));
        }

        String unanswerable = text(plan, "unanswerable_reason");
        if (unanswerable != null && !unanswerable.isBlank() && !"null".equalsIgnoreCase(unanswerable)) {
            return PlanResult.text(unanswerable + scopeHint(contexts));
        }

        // ---- 计划校验：模板、指标、周期必须落在当前用户可见范围内 ----
        Long templateId = plan.path("template_id").isNumber() ? plan.path("template_id").asLong() : null;
        AiTemplateContext ctx = contexts.stream()
                .filter(c -> c.template().getId().equals(templateId))
                .findFirst().orElse(null);
        if (ctx == null) {
            return PlanResult.text("没能定位到您要查询的报表。" + scopeHint(contexts));
        }
        if (ctx.periods().isEmpty()) {
            return PlanResult.text("报表「" + ctx.template().getName() + "」还没有下发任务，暂无可查询的数据周期。");
        }

        List<String> periods = stringList(plan.path("period_labels")).stream()
                .filter(ctx.periods()::contains)
                .distinct()
                .limit(MAX_PERIODS)
                .collect(Collectors.toList());
        if (periods.isEmpty()) {
            periods = List.of(ctx.periods().get(0));
        }

        List<AiMetric> metrics = stringList(plan.path("metric_field_names")).stream()
                .map(name -> ctx.metrics().stream()
                        .filter(m -> name.equals(m.fieldName()) || name.equals(m.label()))
                        .findFirst().orElse(null))
                .filter(m -> m != null)
                .distinct()
                .limit(MAX_METRICS)
                .collect(Collectors.toList());
        if (metrics.isEmpty()) {
            // 用户未指定指标：默认取前若干个可求和指标，避免把标识类字段与量级悬殊的指标混进同一张图
            metrics = ctx.metrics().stream()
                    .filter(m -> !m.identifierLike())
                    .limit(DEFAULT_METRICS)
                    .collect(Collectors.toList());
        }
        if (metrics.isEmpty()) {
            return PlanResult.text("报表「" + ctx.template().getName() + "」没有可统计的数值指标，暂时无法问数。");
        }

        String dimension = parseDimension(text(plan, "dimension"));
        // 按字段分组：模型给出 group_by_field，可能输出字段名或字段标签，统一解析为字段名
        String rawGroupByField = "field".equals(dimension) ? text(plan, "group_by_field") : null;
        final String groupByField = rawGroupByField == null || rawGroupByField.isBlank() ? null
                : ctx.groupableFields().stream()
                        .filter(f -> rawGroupByField.equals(f.getFieldName()) || rawGroupByField.equals(f.getFieldLabel()))
                        .map(ReportTemplateField::getFieldName)
                        .findFirst().orElse(null);
        if ("field".equals(dimension) && groupByField == null) {
            dimension = "company";
        }
        String groupByFieldLabel = groupByField != null
                ? ctx.groupableFields().stream()
                        .filter(f -> groupByField.equals(f.getFieldName()))
                        .map(ReportTemplateField::getFieldLabel).findFirst().orElse(groupByField)
                : null;
        String chartType = normalizeChartType(text(plan, "chart_type"));
        AiAgg agg = AiAgg.parse(text(plan, "aggregation"));
        // 机构筛选：模型给出的机构名在取数后与真实机构名模糊匹配，全都对不上时忽略筛选而不是返回空结果
        List<String> requestedCompanies = stringList(plan.path("company_names")).stream()
                .distinct().limit(20).collect(Collectors.toList());
        String title = text(plan, "title");
        if (title == null || title.isBlank()) {
            title = ctx.template().getName();
        }

        return PlanResult.plan(new AiResolvedPlan(ctx, periods, metrics, dimension,
                groupByField, groupByFieldLabel, chartType, agg, requestedCompanies, title));
    }

    /** 回传给前端的已解析计划（companyFilter 为取数后确认的有效机构筛选） */
    public Map<String, Object> toResponseMap(AiResolvedPlan plan, List<String> companyFilter) {
        Map<String, Object> resolvedPlan = new LinkedHashMap<>();
        resolvedPlan.put("template_id", plan.ctx().template().getId());
        resolvedPlan.put("template_name", plan.ctx().template().getName());
        resolvedPlan.put("period_labels", plan.periods());
        resolvedPlan.put("metrics", plan.metrics().stream().map(m -> Map.of(
                "field_name", m.fieldName(),
                "field_label", m.label()
        )).collect(Collectors.toList()));
        resolvedPlan.put("dimension", plan.dimension());
        resolvedPlan.put("chart_type", plan.chartType());
        resolvedPlan.put("aggregation", plan.agg().name().toLowerCase());
        resolvedPlan.put("company_names", companyFilter);
        if (plan.groupByField() != null) {
            resolvedPlan.put("group_by_field", plan.groupByField());
            resolvedPlan.put("group_by_field_label", plan.groupByFieldLabel());
        }
        return resolvedPlan;
    }

    /** 计划解析结果：要么给出最终查询计划，要么给出直接回给用户的文本答案 */
    public record PlanResult(AiResolvedPlan plan, String textAnswer) {

        static PlanResult plan(AiResolvedPlan plan) {
            return new PlanResult(plan, null);
        }

        static PlanResult text(String answer) {
            return new PlanResult(null, answer);
        }

        public boolean isText() {
            return plan == null;
        }
    }

    private String scopeHint(List<AiTemplateContext> contexts) {
        if (contexts.isEmpty()) {
            return "";
        }
        return "当前可问数的报表有：" + contexts.stream().map(c -> c.template().getName())
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

    /** 解析维度：company / period / field */
    private String parseDimension(String raw) {
        if ("period".equals(raw)) return "period";
        if ("field".equals(raw)) return "field";
        return "company";
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

    private String truncate(String text, int max) {
        return text.length() > max ? text.substring(0, max) : text;
    }
}
