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

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final SecurityUtils securityUtils;

    public UserController(UserService userService, SecurityUtils securityUtils) {
        this.userService = userService;
        this.securityUtils = securityUtils;
    }

    @GetMapping
    public List<Map<String, Object>> getAllUsers() {
        securityUtils.requireSuperAdmin();
        return userService.getUsers();
    }

    @GetMapping("/by-company/{companyId}")
    public List<Map<String, Object>> getUsersByCompany(@PathVariable Long companyId) {
        securityUtils.requireSuperAdmin();
        return userService.getUsersByCompanyId(companyId);
    }

    @PostMapping
    public Map<String, Object> createUser(@Valid @RequestBody CreateUserRequest req) {
        securityUtils.requireSuperAdmin();
        return userService.createUser(req.getUsername(), req.getDisplayName(), req.getCompanyId(), req.getRole());
    }

    @PutMapping("/{id}/organization-role")
    public Map<String, Object> updateUserOrganizationRole(@PathVariable Long id,
                                                           @Valid @RequestBody UpdateOrganizationRoleRequest req) {
        securityUtils.requireSuperAdmin();
        return userService.updateUserOrganizationRole(id, req.getCompanyId(), req.getRole());
    }

    @PutMapping("/{id}/password")
    public Map<String, Object> resetPassword(@PathVariable Long id) {
        securityUtils.requireSuperAdmin();
        return userService.resetPassword(id);
    }

    @PutMapping("/{id}/status")
    public Map<String, Object> updateUserStatus(@PathVariable Long id,
                                                @Valid @RequestBody UpdateUserStatusRequest req) {
        securityUtils.requireSuperAdmin();
        return userService.toggleStatus(id, req.getStatus());
    }
}
