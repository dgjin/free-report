package com.freereport.service;

import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;
import com.freereport.mapper.AssignmentMapper;
import com.freereport.mapper.TemplateMapper;
import com.freereport.security.AuthUser;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 智能问数上下文组装：当前用户可见的已发布模板 + 数值指标 + 可分组字段 + 已有周期。
 * 字段与周期均按模板批量加载，避免逐模板查询造成 N+1。
 */
@Component
public class AiQueryContextBuilder {

    /** 注入 prompt 的模板上限 */
    private static final int MAX_TEMPLATES_IN_PROMPT = 30;
    /** 每个模板注入 prompt 的周期上限（取最近的） */
    private static final int MAX_PERIODS_IN_PROMPT = 12;
    /** 明细行数这一内置指标的字段名（明细型台账没有汇总字段时也能统计「有多少条/多少台」） */
    private static final String RECORD_COUNT_FIELD = "_record_count";

    private final TemplateMapper templateMapper;
    private final AssignmentMapper assignmentMapper;

    /** 用户上下文缓存：key = userId，5 分钟过期，避免每次问数都重建白名单 */
    private final Cache<Long, List<AiTemplateContext>> contextCache = Caffeine.newBuilder()
            .maximumSize(50)
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .build();

    public AiQueryContextBuilder(TemplateMapper templateMapper, AssignmentMapper assignmentMapper) {
        this.templateMapper = templateMapper;
        this.assignmentMapper = assignmentMapper;
    }

    /** 当前用户可问数的报表清单（模板 + 数值指标 + 已有周期），优先从缓存读取 */
    public List<AiTemplateContext> buildContexts(AuthUser user) {
        List<AiTemplateContext> cached = contextCache.getIfPresent(user.getId());
        if (cached != null) {
            return cached;
        }
        List<AiTemplateContext> contexts = doBuildContexts(user);
        contextCache.put(user.getId(), contexts);
        return contexts;
    }

    /** 模板/字段变更时主动失效缓存 */
    public void invalidateAll() {
        contextCache.invalidateAll();
    }

    private List<AiTemplateContext> doBuildContexts(AuthUser user) {
        List<ReportTemplate> templates = templateMapper.findForUser(
                user.getCompanyId(), user.getRole(), user.getCompanyLevel());
        List<ReportTemplate> usable = templates.stream()
                .filter(t -> "published".equals(t.getStatus()))
                .filter(t -> !Boolean.FALSE.equals(t.getAiQueryEnabled()))
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

        List<AiTemplateContext> contexts = new ArrayList<>();
        for (ReportTemplate t : usable) {
            List<ReportTemplateField> fields = fieldsByTemplate.getOrDefault(t.getId(), List.of());
            // 汇总区数值字段是首选指标；明细/交叉表的数值字段按机构逐行累计，明细台账另外提供「记录数」
            List<AiMetric> metrics = new ArrayList<>();
            fields.stream()
                    .filter(f -> "summary".equals(f.getDataType()) && "number".equals(f.getFieldType()))
                    .filter(f -> !Boolean.TRUE.equals(f.getSensitive()))
                    .forEach(f -> metrics.add(new AiMetric(f.getFieldName(), f.getFieldLabel(), AiMetric.Source.SUMMARY)));
            List<ReportTemplateField> detailNumbers = fields.stream()
                    .filter(f -> ("detail".equals(f.getDataType()) || "matrix".equals(f.getDataType()))
                            && "number".equals(f.getFieldType()))
                    .filter(f -> !Boolean.TRUE.equals(f.getSensitive()))
                    .collect(Collectors.toList());
            boolean hasDetailArea = fields.stream()
                    .anyMatch(f -> "detail".equals(f.getDataType()) || "matrix".equals(f.getDataType()));
            if (hasDetailArea) {
                metrics.add(new AiMetric(RECORD_COUNT_FIELD, "记录数", AiMetric.Source.ROW_COUNT));
            }
            detailNumbers.forEach(f -> metrics.add(new AiMetric(f.getFieldName(), f.getFieldLabel(),
                    AiMetric.Source.DETAIL, looksLikeIdentifier(f))));

            // 明细/交叉表区的文本字段可作为分组维度（如机构名称、品牌、类型等）
            List<ReportTemplateField> groupableFields = fields.stream()
                    .filter(f -> ("detail".equals(f.getDataType()) || "matrix".equals(f.getDataType()))
                            && !"number".equals(f.getFieldType())
                            && "active".equals(f.getStatus()))
                    .filter(f -> !Boolean.TRUE.equals(f.getSensitive()))
                    .collect(Collectors.toList());
            List<String> periods = periodsByTemplate.getOrDefault(t.getId(), List.of()).stream()
                    .filter(p -> p != null && !p.isBlank())
                    .distinct()
                    .sorted(Comparator.reverseOrder())
                    .limit(MAX_PERIODS_IN_PROMPT)
                    .collect(Collectors.toList());
            contexts.add(new AiTemplateContext(t, metrics, groupableFields, periods));
        }
        return contexts;
    }

    /** 车牌号、发动机号一类的标识字段虽存为数值，但求和无意义，默认不作为指标 */
    private static boolean looksLikeIdentifier(ReportTemplateField field) {
        String name = field.getFieldName() == null ? "" : field.getFieldName().toLowerCase();
        String label = field.getFieldLabel() == null ? "" : field.getFieldLabel();
        return name.endsWith("_no") || name.endsWith("_code") || name.endsWith("_id")
                || name.equals("no") || name.equals("code") || name.equals("id")
                || label.contains("号") || label.contains("编码") || label.contains("代码");
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
