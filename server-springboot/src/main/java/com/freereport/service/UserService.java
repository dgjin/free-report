package com.freereport.service;

import com.freereport.entity.Company;
import com.freereport.entity.User;
import com.freereport.exception.DomainException;
import com.freereport.mapper.CompanyMapper;
import com.freereport.mapper.UserMapper;
import com.freereport.security.JwtAuthFilter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 用户服务：用户列表、更新机构与角色。
 */
@Service
public class UserService {

    private final UserMapper userMapper;
    private final CompanyMapper companyMapper;
    private final JwtAuthFilter jwtAuthFilter;

    public UserService(UserMapper userMapper, CompanyMapper companyMapper, JwtAuthFilter jwtAuthFilter) {
        this.userMapper = userMapper;
        this.companyMapper = companyMapper;
        this.jwtAuthFilter = jwtAuthFilter;
    }

    /**
     * 返回所有用户（不含密码哈希）。
     */
    public List<Map<String, Object>> getUsers() {
        return userMapper.findAll().stream().map(this::toMap).collect(Collectors.toList());
    }

    /**
     * 更新用户机构和角色：不能修改超级管理员；目标机构必须有效；
     * department_report_admin 必须属于 department 级别机构。
     */
    @Transactional
    public Map<String, Object> updateUserOrganizationRole(Long id, Long companyId, String role) {
        User existing = userMapper.findById(id);
        if (existing == null) {
            throw new DomainException("用户不存在", 404);
        }
        if ("super_admin".equals(existing.getRole())) {
            throw new DomainException("不能修改超级管理员的机构或角色", 403);
        }
        Company company = companyMapper.findById(companyId);
        if (company == null || !"active".equals(company.getStatus())) {
            throw new DomainException("目标机构不存在或已停用", 400);
        }
        if ("department_report_admin".equals(role) && !"department".equals(company.getLevel())) {
            throw new DomainException("报表管理员必须属于总部部门", 400);
        }
        userMapper.updateUserOrganizationRole(id, companyId, role);
        // 清除认证缓存，使下次请求重新加载机构/角色信息
        jwtAuthFilter.invalidateCache(id);
        return toMap(userMapper.findById(id));
    }

    private Map<String, Object> toMap(User u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("username", u.getUsername());
        m.put("display_name", u.getDisplayName());
        m.put("company_id", u.getCompanyId());
        m.put("role", u.getRole());
        m.put("status", u.getStatus());
        m.put("created_at", u.getCreatedAt());
        return m;
    }
}
