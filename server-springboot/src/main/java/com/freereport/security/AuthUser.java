package com.freereport.security;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class AuthUser {
    private Long id;
    private String username;
    private String displayName;
    private Long companyId;
    private String companyName;
    private String companyCode;
    private String companyLevel; // headquarter, department, branch
    private String role; // super_admin, department_report_admin, branch_admin, handler, reviewer, approver
}
