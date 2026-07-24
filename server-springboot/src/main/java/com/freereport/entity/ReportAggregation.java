package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportAggregation {
    private Long id;
    private Long templateId;
    private Long assignmentId;
    private String aggregatedData; // JSON string
    private Integer branchCount;
    private Integer submittedCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
