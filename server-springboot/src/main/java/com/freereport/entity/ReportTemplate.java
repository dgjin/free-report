package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 报表模板实体，对应 report_template 表。
 * 定义报表的基本信息和周期配置，是字段、下发、填报、聚合的核心关联实体。
 */
@Data
public class ReportTemplate {
    private Long id;
    /** 模板名称 */
    private String name;
    /** 模板描述 */
    private String description;
    /** 报表周期类型：daily / weekly / monthly / quarterly / yearly / custom */
    private String periodType;
    /** 模板状态：draft(草稿) / published(已发布) / archived(已归档) */
    private String status;
    /** 创建人用户 ID */
    private Long createdBy;
    /** 归属部门机构 ID */
    private Long ownerDepartmentId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 是否在智能问数中可用（默认 true） */
    private Boolean aiQueryEnabled = true;
}
