package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 审批记录实体，对应 approval_record 表。
 * 记录填报提交在审批流程中每个节点的审批动作与结果。
 */
@Data
public class ApprovalRecord {
    private Long id;
    /** 关联的填报提交 ID */
    private Long submissionId;
    /** 审批层级：handler(经办) / reviewer(审核) / approver(审批) */
    private String approvalLevel;
    /** 审批人用户 ID */
    private Long approverId;
    /** 审批状态：pending(待审) / approved(通过) / rejected(驳回) */
    private String status;
    /** 审批意见 */
    private String comment;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
