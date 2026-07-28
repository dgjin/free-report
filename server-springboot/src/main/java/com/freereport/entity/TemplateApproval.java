package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TemplateApproval {
    private Long id;
    private Long templateId;
    private Long submittedBy;
    private Long reviewedBy;
    private String status; // pending, approved, rejected
    private String comment;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // 联表查询扩展字段（非表列）
    private String templateName;
    private String departmentName;
    private String submittedByName;
}
