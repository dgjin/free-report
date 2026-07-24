package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportSubmission {
    private Long id;
    private Long assignmentId;
    private Integer version;
    private Long submittedByCompanyId;
    private Long submittedBy;
    private String status; // draft, pending_review, pending_approval, pending_receipt, received, returned, approved, rejected
    private String comment;
    private LocalDateTime submittedAt;
    private LocalDateTime createdAt;
}
