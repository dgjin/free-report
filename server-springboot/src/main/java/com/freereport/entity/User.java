package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class User {
    private Long id;
    private String username;
    private String passwordHash;
    private String displayName;
    private Long companyId;
    private String role; // super_admin, department_report_admin, branch_admin, handler, reviewer, approver
    private String status; // active, inactive
    private LocalDateTime createdAt;
}
