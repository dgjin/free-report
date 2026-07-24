package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class AssignmentRecall {
    private Long id;
    private Long assignmentId;
    private Long recalledBy;
    private Long issuerDepartmentId;
    private String reason;
    private LocalDateTime createdAt;
}
