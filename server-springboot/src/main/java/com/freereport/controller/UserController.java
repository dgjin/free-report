package com.freereport.controller;

import com.freereport.dto.CreateUserRequest;
import com.freereport.dto.UpdateOrganizationRoleRequest;
import com.freereport.dto.UpdateUserStatusRequest;
import com.freereport.security.SecurityUtils;
import com.freereport.service.UserService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 用户管理控制器。
 * 提供用户的增删改查、角色调整、密码重置、状态切换等操作。
 * 所有接口仅限超级管理员访问。
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final SecurityUtils securityUtils;

    public UserController(UserService userService, SecurityUtils securityUtils) {
        this.userService = userService;
        this.securityUtils = securityUtils;
    }

    /** 获取全部用户列表 */
    @GetMapping
    public List<Map<String, Object>> getAllUsers() {
        securityUtils.requireSuperAdmin();
        return userService.getUsers();
    }

    /** 按机构 ID 查询该机构下的用户列表 */
    @GetMapping("/by-company/{companyId}")
    public List<Map<String, Object>> getUsersByCompany(@PathVariable Long companyId) {
        securityUtils.requireSuperAdmin();
        return userService.getUsersByCompanyId(companyId);
    }

    /** 创建新用户，密码默认生成并返回 */
    @PostMapping
    public Map<String, Object> createUser(@Valid @RequestBody CreateUserRequest req) {
        securityUtils.requireSuperAdmin();
        return userService.createUser(req.getUsername(), req.getDisplayName(), req.getCompanyId(), req.getRole());
    }

    /** 调整用户的所属机构和角色 */
    @PutMapping("/{id}/organization-role")
    public Map<String, Object> updateUserOrganizationRole(@PathVariable Long id,
                                                           @Valid @RequestBody UpdateOrganizationRoleRequest req) {
        securityUtils.requireSuperAdmin();
        return userService.updateUserOrganizationRole(id, req.getCompanyId(), req.getRole());
    }

    /** 重置用户密码为新的随机密码并返回 */
    @PutMapping("/{id}/password")
    public Map<String, Object> resetPassword(@PathVariable Long id) {
        securityUtils.requireSuperAdmin();
        return userService.resetPassword(id);
    }

    /** 切换用户状态（启用 / 停用） */
    @PutMapping("/{id}/status")
    public Map<String, Object> updateUserStatus(@PathVariable Long id,
                                                @Valid @RequestBody UpdateUserStatusRequest req) {
        securityUtils.requireSuperAdmin();
        return userService.toggleStatus(id, req.getStatus());
    }
}
