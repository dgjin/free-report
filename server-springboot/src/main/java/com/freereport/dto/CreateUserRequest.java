package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 创建用户请求体。
 * 仅超级管理员可操作，用于在指定机构下新建用户账号。
 */
@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class CreateUserRequest {
    /** 登录用户名（必填，全局唯一） */
    @NotBlank
    private String username;
    /** 用户显示名称（必填） */
    @NotBlank
    private String displayName;
    /** 所属机构 ID（必填） */
    @NotNull
    private Long companyId;
    /** 角色：super_admin / department_report_admin / branch_admin / handler / reviewer / approver（必填） */
    @NotBlank
    private String role;
}
