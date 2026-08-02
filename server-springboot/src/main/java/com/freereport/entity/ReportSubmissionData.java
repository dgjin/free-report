package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 填报数据明细实体，对应 report_submission_data 表。
 * 存储填报提交中每个字段的具体值，支持汇总区和明细区。
 */
@Data
public class ReportSubmissionData {
    private Long id;
    /** 关联的填报提交 ID */
    private Long submissionId;
    /** 关联的模板字段 ID */
    private Long fieldId;
    /** 行索引：0 表示汇总区，大于 0 表示明细区第 N 行 */
    private Integer rowIndex;
    /** 字段值（文本形式存储） */
    private String value;
    private LocalDateTime createdAt;
}
