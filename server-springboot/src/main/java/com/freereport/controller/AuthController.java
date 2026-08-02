package com.freereport.controller;

import com.freereport.dto.LoginRequest;
import com.freereport.dto.LoginResponse;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 认证控制器。
 * 提供用户登录和当前用户信息获取接口，不需要 JWT 认证即可访问登录接口。
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final SecurityUtils securityUtils;

    public AuthController(AuthService authService, SecurityUtils securityUtils) {
        this.authService = authService;
        this.securityUtils = securityUtils;
    }

    /**
     * 用户登录：验证用户名和密码，成功后返回 JWT Token 和用户信息。
     *
     * @param request 登录请求（用户名 + 密码）
     * @return 包含 token 和用户信息的响应
     */
    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request.getUsername(), request.getPassword());
    }

    /**
     * 获取当前登录用户信息（用于前端初始化或刷新登录状态）。
     *
     * @return 包含当前用户对象的响应
     */
    @GetMapping("/me")
    public Map<String, Object> me() {
        AuthUser user = securityUtils.getCurrentUser();
        return Map.of("user", user);
    }
}
