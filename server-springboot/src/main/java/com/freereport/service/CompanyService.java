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
     * 返回总部 + 分公司层级结构。
     */
    public Map<String, Object> getCompanyHierarchy() {
        List<Company> all = companyMapper.findAll();
        Company headquarter = null;
        List<Company> branches = new ArrayList<>();
        for (Company c : all) {
            if ("headquarter".equals(c.getLevel())) {
                if (headquarter == null) {
                    headquarter = c;
                }
            } else if ("branch".equals(c.getLevel())) {
                branches.add(c);
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        if (headquarter != null) {
            result.putAll(toMap(headquarter));
        } else {
            result.put("id", null);
            result.put("name", null);
            result.put("code", null);
            result.put("level", null);
        }
        result.put("children", branches.stream().map(this::toMap).collect(Collectors.toList()));
        return result;
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
     * 创建机构：父机构必须是启用中的总部。
     */
    @Transactional
    public Map<String, Object> createCompany(String name, String code, Long parentId, String level) {
        Company parent = parentId == null ? null : companyMapper.findById(parentId);
        if (parent == null || !"headquarter".equals(parent.getLevel()) || !"active".equals(parent.getStatus())) {
            throw new DomainException("父机构必须是启用中的总部", 400);
        }
        // createCompany 使用 @Param 注解，无法将生成的 id 回填到实体，
        // 需通过 useGeneratedKeys 返回的行数判断成功后重新查询完整记录
        int affected = companyMapper.createCompany(name, code, parentId, level);
        if (affected == 0) {
            throw new DomainException("机构创建失败", 500);
        }
        // 通过 name + parentId 定位刚创建的机构，避免依赖回填的 id
        Company created = companyMapper.findAll().stream()
                .filter(c -> name.equals(c.getName())
                        && (parentId == null ? c.getParentId() == null : parentId.equals(c.getParentId()))
                        && level.equals(c.getLevel()))
                .findFirst()
                .orElseThrow(() -> new DomainException("机构创建后查询失败", 500));
        return toMap(created);
    }

    /**
     * 停用机构：先检查是否有未完成任务。
     */
    @Transactional
    public Map<String, Object> disableCompany(Long id) {
        int active = companyMapper.countActiveAssignments(id);
        if (active > 0) {
            throw new DomainException("该机构仍有未完成任务，暂不能停用", 409);
        }
        companyMapper.disableCompany(id);
        // 失效该机构下所有用户的认证缓存，确保下次请求重新加载机构状态
        jwtAuthFilter.invalidateCacheByCompanyId(id);
        // 返回非空 body，避免前端解析空响应报错
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
