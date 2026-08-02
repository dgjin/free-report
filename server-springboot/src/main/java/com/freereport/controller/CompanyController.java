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

@RestController
@RequestMapping("/api/companies")
public class CompanyController {

    private final CompanyService companyService;
    private final SecurityUtils securityUtils;

    public CompanyController(CompanyService companyService, SecurityUtils securityUtils) {
        this.companyService = companyService;
        this.securityUtils = securityUtils;
    }

    @GetMapping
    public Map<String, Object> getCompanyTree() {
        return companyService.getCompanyHierarchy();
    }

    @GetMapping("/branches")
    public List<Map<String, Object>> getBranches() {
        return companyService.getBranches();
    }

    @GetMapping("/targets")
    public List<Map<String, Object>> getTargets() {
        AuthUser user = securityUtils.getCurrentUser();
        return companyService.getAssignmentTargets(user);
    }

    @PostMapping
    public Map<String, Object> createCompany(@Valid @RequestBody CreateCompanyRequest req) {
        securityUtils.requireSuperAdmin();
        return companyService.createCompany(req.getName(), req.getCode(), req.getParentId(), req.getLevel());
    }

    @PutMapping("/{id}")
    public Map<String, Object> updateCompany(@PathVariable Long id, @Valid @RequestBody UpdateCompanyRequest req) {
        securityUtils.requireSuperAdmin();
        return companyService.updateCompany(id, req.getName(), req.getCode(), req.getAddress(), req.getContact(), req.getPhone());
    }

    @PutMapping("/{id}/disable")
    public Map<String, Object> disableCompany(@PathVariable Long id) {
        securityUtils.requireSuperAdmin();
        return companyService.disableCompany(id);
    }

    @PutMapping("/{id}/enable")
    public Map<String, Object> enableCompany(@PathVariable Long id) {
        securityUtils.requireSuperAdmin();
        return companyService.enableCompany(id);
    }
}