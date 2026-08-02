package com.freereport.service;

import com.freereport.entity.Company;
import com.freereport.exception.DomainException;
import com.freereport.mapper.CompanyMapper;
import com.freereport.security.AuthUser;
import com.freereport.security.JwtAuthFilter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 机构服务：机构层级、可下发目标、创建与停用。
 */
@Service
public class CompanyService {

    private final CompanyMapper companyMapper;
    private final JwtAuthFilter jwtAuthFilter;

    public CompanyService(CompanyMapper companyMapper, JwtAuthFilter jwtAuthFilter) {
        this.companyMapper = companyMapper;
        this.jwtAuthFilter = jwtAuthFilter;
    }

    /**
     * 返回完整三级机构树（总部→部门→分公司），递归构建 children。
     */
    public Map<String, Object> getCompanyHierarchy() {
        List<Company> all = companyMapper.findAll();
        // 找到总部根节点
        Company root = all.stream()
                .filter(c -> "headquarter".equals(c.getLevel()))
                .findFirst()
                .orElse(null);
        if (root == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("id", null);
            empty.put("name", null);
            empty.put("children", new ArrayList<>());
            return empty;
        }
        return buildTree(root, all);
    }

    /**
     * 递归构建机构树节点。
     */
    private Map<String, Object> buildTree(Company node, List<Company> all) {
        Map<String, Object> m = toMap(node);
        List<Map<String, Object>> children = all.stream()
                .filter(c -> node.getId().equals(c.getParentId()))
                .sorted((a, b) -> {
                    int orderA = "department".equals(a.getLevel()) ? 0 : 1;
                    int orderB = "department".equals(b.getLevel()) ? 0 : 1;
                    if (orderA != orderB) return orderA - orderB;
                    return a.getName().compareTo(b.getName());
                })
                .map(c -> buildTree(c, all))
                .collect(Collectors.toList());
        m.put("children", children);
        return m;
    }

    /**
     * 返回活跃分公司列表。
     */
    public List<Map<String, Object>> getBranches() {
        return companyMapper.findBranches().stream().map(this::toMap).collect(Collectors.toList());
    }

    /**
     * 根据用户级别返回可下发目标机构（超级管理员可见全部，其他用户排除本机构）。
     */
    public List<Map<String, Object>> getAssignmentTargets(AuthUser user) {
        Long excludeId = "super_admin".equals(user.getRole()) ? null : user.getCompanyId();
        return companyMapper.findAssignmentTargets(excludeId).stream().map(this::toMap).collect(Collectors.toList());
    }

    /**
     * 创建机构：父机构必须是启用中的机构（总部下可加部门/分公司，部门下可加分公司）。
     */
    @Transactional
    public Map<String, Object> createCompany(String name, String code, Long parentId, String level) {
        Company parent = parentId == null ? null : companyMapper.findById(parentId);
        if (parent == null || !"active".equals(parent.getStatus())) {
            throw new DomainException("父机构不存在或已停用", 400);
        }
        // 校验层级关系：部门只能挂在总部下，分公司可挂在总部或部门下
        if ("department".equals(level) && !"headquarter".equals(parent.getLevel())) {
            throw new DomainException("部门必须挂在总部下", 400);
        }
        if ("branch".equals(level) && !"headquarter".equals(parent.getLevel()) && !"department".equals(parent.getLevel())) {
            throw new DomainException("分公司必须挂在总部或部门下", 400);
        }
        // code 唯一性校验
        if (companyMapper.findByCode(code) != null) {
            throw new DomainException("机构编码已存在", 400);
        }
        int affected = companyMapper.createCompany(name, code, parentId, level);
        if (affected == 0) {
            throw new DomainException("机构创建失败", 500);
        }
        Company created = companyMapper.findAll().stream()
                .filter(c -> name.equals(c.getName())
                        && parentId.equals(c.getParentId())
                        && level.equals(c.getLevel()))
                .findFirst()
                .orElseThrow(() -> new DomainException("机构创建后查询失败", 500));
        return toMap(created);
    }

    /**
     * 编辑机构基本信息：code 唯一性校验（排除自身）。
     */
    @Transactional
    public Map<String, Object> updateCompany(Long id, String name, String code, String address, String contact, String phone) {
        Company existing = companyMapper.findById(id);
        if (existing == null) {
            throw new DomainException("机构不存在", 404);
        }
        if (!existing.getCode().equals(code)) {
            if (companyMapper.findByCodeExcludeId(code, id) != null) {
                throw new DomainException("机构编码已存在", 400);
            }
        }
        companyMapper.updateCompany(id, name, code, address, contact, phone);
        return toMap(companyMapper.findById(id));
    }

    /**
     * 启用机构。
     */
    @Transactional
    public Map<String, Object> enableCompany(Long id) {
        Company existing = companyMapper.findById(id);
        if (existing == null) {
            throw new DomainException("机构不存在", 404);
        }
        if ("headquarter".equals(existing.getLevel())) {
            throw new DomainException("总部不可操作", 400);
        }
        companyMapper.enableCompany(id);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "机构已启用");
        return result;
    }

    /**
     * 停用机构：先检查是否有未完成任务或活跃用户。
     */
    @Transactional
    public Map<String, Object> disableCompany(Long id) {
        int active = companyMapper.countActiveAssignments(id);
        if (active > 0) {
            throw new DomainException("该机构仍有未完成任务，暂不能停用", 409);
        }
        int activeUsers = companyMapper.countUsersByCompanyId(id);
        if (activeUsers > 0) {
            throw new DomainException("该机构下仍有活跃用户，请先停用或迁移用户", 409);
        }
        companyMapper.disableCompany(id);
        jwtAuthFilter.invalidateCacheByCompanyId(id);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "机构已停用");
        return result;
    }

    private Map<String, Object> toMap(Company c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getName());
        m.put("code", c.getCode());
        m.put("parent_id", c.getParentId());
        m.put("level", c.getLevel());
        m.put("address", c.getAddress());
        m.put("contact", c.getContact());
        m.put("phone", c.getPhone());
        m.put("status", c.getStatus());
        m.put("created_at", c.getCreatedAt());
        m.put("updated_at", c.getUpdatedAt());
        return m;
    }
}
