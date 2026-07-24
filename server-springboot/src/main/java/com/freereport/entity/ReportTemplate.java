package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportTemplate {
    private Long id;
    private String name;
    private String description;
    private String periodType; // daily, weekly, monthly, quarterly, yearly, custom
    private String status; // draft, published, archived
    private Long createdBy;
    private Long ownerDepartmentId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
