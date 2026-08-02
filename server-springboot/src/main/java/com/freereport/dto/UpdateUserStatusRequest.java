package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 更新用户状态请求体。
 * 超级管理员用于启用或停用用户账号。
 */
@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class UpdateUserStatusRequest {
    /** 用户状态：active(启用) / inactive(停用)（必填） */
    @NotBlank
    private String status;
}
