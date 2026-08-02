package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import com.freereport.security.AuthUser;

/**
 * 登录成功响应体。
 * 包含 JWT Token 和当前用户信息，前端据此初始化登录状态。
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class LoginResponse {
    /** JWT 认证令牌，后续请求通过 Authorization 头携带 */
    private String token;
    /** 当前登录用户信息（含 ID、用户名、角色、机构等） */
    private AuthUser user;
}
