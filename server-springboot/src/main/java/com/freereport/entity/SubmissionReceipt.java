package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class SubmissionReceipt {
    private Long id;
    private Long submissionId;
    private Long issuerDepartmentId;
    private Long receivedBy;
    private String action; // received, returned
    private String comment;
    private LocalDateTime createdAt;
}
