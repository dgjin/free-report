package com.freereport.service;

import com.freereport.entity.ReportTemplate;
import com.freereport.entity.ReportTemplateField;

import java.util.List;

/** 单个模板的问数上下文 */
record AiTemplateContext(ReportTemplate template,
                         List<AiMetric> metrics,
                         List<ReportTemplateField> groupableFields,
                         List<ReportTemplateField> others,
                         List<String> periods) {
}
