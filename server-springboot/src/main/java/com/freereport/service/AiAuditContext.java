package com.freereport.service;

import java.util.List;

/**
 * 智能问数审计上下文：记录本次请求暴露给 LLM 的模板/指标范围，
 * 由 AiQueryService 在计划解析后构建，传给 AiQueryAuditor 写入审计日志。
 */
record AiAuditContext(List<Long> exposedTemplateIds,
                      int exposedMetricCount,
                      Long selectedTemplateId) {
}
