package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 用户登录请求体。
 * 前端提交用户名和密码，后端验证通过后返回 JWT Token。
 */
@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class LoginRequest {
    /** 登录用户名（必填） */
    @NotBlank
    private String username;
    /** 登录密码（必填，明文传输，后端加密比对） */
    @NotBlank
    private String password;
}
