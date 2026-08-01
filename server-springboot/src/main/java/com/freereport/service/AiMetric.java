package com.freereport.service;

/** 一个可问数的指标 */
record AiMetric(String fieldName, String label, Source source, boolean identifierLike) {

    /** 指标取值来源：汇总区数值字段 / 明细区数值字段逐行累计 / 明细行数 */
    enum Source { SUMMARY, DETAIL, ROW_COUNT }

    AiMetric(String fieldName, String label, Source source) {
        this(fieldName, label, source, false);
    }

    /** 机构维度列名：明细指标为该机构明细行的聚合值 */
    String companyColumn(AiAgg agg) {
        return source == Source.SUMMARY ? label : periodColumn(agg);
    }

    /** 周期维度列名：均为全机构聚合值 */
    String periodColumn(AiAgg agg) {
        return source == Source.ROW_COUNT ? label : label + "（" + agg.cn() + "）";
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
