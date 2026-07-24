package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ApprovalRecord {
    private Long id;
    private Long submissionId;
    private String approvalLevel; // handler, reviewer, approver
    private Long approverId;
    private String status; // pending, approved, rejected
    private String comment;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
