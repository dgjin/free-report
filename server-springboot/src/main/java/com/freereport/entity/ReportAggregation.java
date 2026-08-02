package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 报表聚合结果实体，对应 report_aggregation 表。
 * 存储某个模板在某期次下所有分公司的汇总聚合数据。
 */
@Data
public class ReportAggregation {
    private Long id;
    /** 关联的报表模板 ID */
    private Long templateId;
    /** 关联的下发任务 ID */
    private Long assignmentId;
    /** 聚合数据（JSON 字符串，包含各分公司的汇总指标） */
    private String aggregatedData;
    /** 应报分公司总数 */
    private Integer branchCount;
    /** 已提交分公司数 */
    private Integer submittedCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
