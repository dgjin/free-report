package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 模板审批实体，对应 template_approval 表。
 * 记录报表模板发布前的审批流程，包含提交人、审批人、审批状态等。
 */
@Data
public class TemplateApproval {
    private Long id;
    /** 关联的报表模板 ID */
    private Long templateId;
    /** 提交审批的用户 ID */
    private Long submittedBy;
    /** 审批人用户 ID */
    private Long reviewedBy;
    /** 审批状态：pending(待审) / approved(通过) / rejected(驳回) */
    private String status;
    /** 审批意见 */
    private String comment;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /* ---- 联表查询扩展字段（非表列，仅用于查询展示） ---- */
    /** 模板名称（联表查询） */
    private String templateName;
    /** 归属部门名称（联表查询） */
    private String departmentName;
    /** 提交人姓名（联表查询） */
    private String submittedByName;
}
