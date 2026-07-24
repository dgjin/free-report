package com.freereport.controller;

import com.freereport.dto.UpdateOrganizationRoleRequest;
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

    @PutMapping("/{id}/organization-role")
    public Map<String, Object> updateUserOrganizationRole(@PathVariable Long id,
                                                           @Valid @RequestBody UpdateOrganizationRoleRequest req) {
        securityUtils.requireSuperAdmin();
        return userService.updateUserOrganizationRole(id, req.getCompanyId(), req.getRole());
    }
}
