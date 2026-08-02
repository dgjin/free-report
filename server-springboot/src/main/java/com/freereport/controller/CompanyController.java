package com.freereport.controller;

import com.freereport.dto.CreateCompanyRequest;
import com.freereport.dto.UpdateCompanyRequest;
import com.freereport.security.AuthUser;
import com.freereport.security.SecurityUtils;
import com.freereport.service.CompanyService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 机构管理控制器。
 * 提供组织树的查询、机构的增删改查以及启用/停用操作。
 * 写操作仅限超级管理员。
 */
@RestController
@RequestMapping("/api/companies")
public class CompanyController {

    private final CompanyService companyService;
    private final SecurityUtils securityUtils;

    public CompanyController(CompanyService companyService, SecurityUtils securityUtils) {
        this.companyService = companyService;
        this.securityUtils = securityUtils;
    }

    /** 获取完整的组织机构树（总部 → 部门 → 分公司） */
    @GetMapping
    public Map<String, Object> getCompanyTree() {
        return companyService.getCompanyHierarchy();
    }

    /** 获取所有分公司列表（扁平列表，用于下拉选择） */
    @GetMapping("/branches")
    public List<Map<String, Object>> getBranches() {
        return companyService.getBranches();
    }

    /** 获取当前用户可见的下发目标分公司列表（根据角色和机构权限过滤） */
    @GetMapping("/targets")
    public List<Map<String, Object>> getTargets() {
        AuthUser user = securityUtils.getCurrentUser();
        return companyService.getAssignmentTargets(user);
    }

    /** 创建新机构（仅超级管理员） */
    @PostMapping
    public Map<String, Object> createCompany(@Valid @RequestBody CreateCompanyRequest req) {
        securityUtils.requireSuperAdmin();
        return companyService.createCompany(req.getName(), req.getCode(), req.getParentId(), req.getLevel());
    }

    /** 更新机构信息（仅超级管理员） */
    @PutMapping("/{id}")
    public Map<String, Object> updateCompany(@PathVariable Long id, @Valid @RequestBody UpdateCompanyRequest req) {
        securityUtils.requireSuperAdmin();
        return companyService.updateCompany(id, req.getName(), req.getCode(), req.getAddress(), req.getContact(), req.getPhone());
    }

    /** 停用机构（仅超级管理员），停用后不可被分配新任务 */
    @PutMapping("/{id}/disable")
    public Map<String, Object> disableCompany(@PathVariable Long id) {
        securityUtils.requireSuperAdmin();
        return companyService.disableCompany(id);
    }

    /** 启用机构（仅超级管理员） */
    @PutMapping("/{id}/enable")
    public Map<String, Object> enableCompany(@PathVariable Long id) {
        securityUtils.requireSuperAdmin();
        return companyService.enableCompany(id);
    }
}