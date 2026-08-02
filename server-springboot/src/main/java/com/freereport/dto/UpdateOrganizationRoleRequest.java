package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 更新用户组织角色请求体。
 * 超级管理员用于调整用户的所属机构和角色。
 */
@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class UpdateOrganizationRoleRequest {
    /** 目标机构 ID（必填） */
    @NotNull
    private Long companyId;
    /** 新角色：super_admin / department_report_admin / branch_admin / handler / reviewer / approver（必填） */
    @NotBlank
    private String role;
}
