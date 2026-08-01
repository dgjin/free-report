package com.freereport.service;

import java.util.List;

/** 聚合方式：合计 / 平均 / 最高 / 最低 */
enum AiAgg {
    SUM("合计"), AVG("平均"), MAX("最高"), MIN("最低");

    private final String cn;

    AiAgg(String cn) {
        this.cn = cn;
    }

    String cn() {
        return cn;
    }

    static AiAgg parse(String raw) {
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
