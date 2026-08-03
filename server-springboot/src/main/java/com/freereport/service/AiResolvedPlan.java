package com.freereport.service;

import java.util.List;

/**
 * 经白名单校验与默认值回退后的查询计划：
 * 模板、周期、指标均已确认落在当前用户可见范围内，可直接用于取数与结果构建。
 *
 * matrixDimension 在 dimension 为 matrix_row / matrix_column 时非空，
 * 携带交叉表的行选项与列标签，供结果构建器按行或列分组统计。
 */
record AiResolvedPlan(AiTemplateContext ctx,
                      List<String> periods,
                      List<AiMetric> metrics,
                      String dimension,
                      String groupByField,
                      String groupByFieldLabel,
                      String chartType,
                      AiAgg agg,
                      List<String> requestedCompanies,
                      String title,
                      AiMatrixDimension matrixDimension) {
}
