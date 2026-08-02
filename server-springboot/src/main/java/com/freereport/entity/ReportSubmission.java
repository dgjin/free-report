package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 填报提交实体，对应 report_submission 表。
 * 表示分公司针对某个下发任务的一次填报提交记录，支持版本控制。
 */
@Data
public class ReportSubmission {
    private Long id;
    /** 关联的下发任务 ID */
    private Long assignmentId;
    /** 提交版本号，每次重新提交递增 */
    private Integer version;
    /** 提交方分公司 ID */
    private Long submittedByCompanyId;
    /** 提交人用户 ID */
    private Long submittedBy;
    /** 提交状态：draft / pending_review / pending_approval / pending_receipt / received / returned / approved / rejected */
    private String status;
    /** 提交备注 */
    private String comment;
    private LocalDateTime submittedAt;
    private LocalDateTime createdAt;
}
