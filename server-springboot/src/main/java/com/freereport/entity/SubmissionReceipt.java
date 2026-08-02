package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 签收记录实体，对应 submission_receipt 表。
 * 记录部门报表管理员对已审批通过的填报结果的签收/退回操作。
 */
@Data
public class SubmissionReceipt {
    private Long id;
    /** 关联的填报提交 ID */
    private Long submissionId;
    /** 执行签收的部门机构 ID */
    private Long issuerDepartmentId;
    /** 签收人用户 ID */
    private Long receivedBy;
    /** 签收动作：received(签收) / returned(退回) */
    private String action;
    /** 签收意见或退回原因 */
    private String comment;
    private LocalDateTime createdAt;
}
