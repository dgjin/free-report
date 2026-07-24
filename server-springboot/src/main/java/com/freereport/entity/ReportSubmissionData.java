package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportSubmissionData {
    private Long id;
    private Long submissionId;
    private Long fieldId;
    private Integer rowIndex; // 0 = summary, >0 = detail row
    private String value;
    private LocalDateTime createdAt;
}
