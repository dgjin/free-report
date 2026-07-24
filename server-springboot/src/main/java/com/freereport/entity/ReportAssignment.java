package com.freereport.entity;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class ReportAssignment {
    private Long id;
    private Long templateId;
    private Long assignedToCompanyId;
    private String title;
    private String periodLabel;
    private Integer isOneTime; // TINYINT(1)
    private LocalDate deadline;
    private String status; // pending, filling, submitted, pending_receipt, received, returned, approved, aggregated, rejected, recalled
    private Long assignedBy;
    private Long issuerDepartmentId;
    private LocalDateTime createdAt;
}
