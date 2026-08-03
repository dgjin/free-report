package com.freereport.service;

import java.util.List;

/**
 * 交叉表维度信息：描述一个矩阵区域的行/列结构，供智能问数按行或列维度统计分析。
 *
 * @param rowLabel    行维度标签（如「品牌」）
 * @param rowOptions  行选项列表（如 [品牌A, 品牌B]），row_index=1 对应 rowOptions[0]
 * @param columnLabels 列标签列表（如 [1月销售额, 2月销售额]），每个标签对应一个 matrix 数值字段
 */
record AiMatrixDimension(String rowLabel, List<String> rowOptions, List<String> columnLabels) {
}
