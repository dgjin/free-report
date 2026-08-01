package com.freereport.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiPredicate;
import java.util.stream.Collectors;

/** 单个周期的汇总取数结果 */
final class AiPeriodData {
    private final String period;
    private final Map<String, Object> aggregation;
    /** 明细行按机构分组的索引，懒加载 */
    private Map<String, List<Map<String, Object>>> detailIndex;

    AiPeriodData(String period, Map<String, Object> aggregation) {
        this.period = period;
        this.aggregation = aggregation;
    }

    String period() {
        return period;
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

    /** 按指定字段值分组明细行（用于按字段分组统计，如按品牌/类型分组） */
    Map<String, List<Map<String, Object>>> detailRowsGroupedBy(String fieldName) {
        return detailRows().stream()
                .collect(Collectors.groupingBy(
                        r -> {
                            Object v = r.get(fieldName);
                            return v == null || String.valueOf(v).trim().isEmpty()
                                    ? "(未填写)" : String.valueOf(v).trim();
                        },
                        LinkedHashMap::new, Collectors.toList()));
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
