package com.freereport.entity;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 填报任务下发实体，对应 report_assignment 表。
 * 表示部门报表管理员将模板下发给某个分公司的某期次填报任务。
 */
@Data
public class ReportAssignment {
    private Long id;
    /** 关联的报表模板 ID */
    private Long templateId;
    /** 任务下发的目标分公司 ID */
    private Long assignedToCompanyId;
    /** 任务标题 */
    private String title;
    /** 期次标签，如 "2026年07月" */
    private String periodLabel;
    /** 是否一次性下发（TINYINT(1)，1=一次性，不进入自动下发周期） */
    private Integer isOneTime;
    /** 填报截止日期 */
    private LocalDate deadline;
    /** 任务状态：pending / filling / submitted / pending_receipt / received / returned / approved / aggregated / rejected / recalled */
    private String status;
    /** 下发人用户 ID */
    private Long assignedBy;
    /** 发起下发的部门机构 ID */
    private Long issuerDepartmentId;
    private LocalDateTime createdAt;
}
