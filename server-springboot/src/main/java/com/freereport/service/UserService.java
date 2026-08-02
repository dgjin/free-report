package com.freereport.service;

import com.freereport.entity.Company;
import com.freereport.entity.User;
import com.freereport.exception.DomainException;
import com.freereport.mapper.CompanyMapper;
import com.freereport.mapper.UserMapper;
import com.freereport.security.JwtAuthFilter;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
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
    private final BCryptPasswordEncoder passwordEncoder;

    private static final String DEFAULT_PASSWORD = "123456";

    public UserService(UserMapper userMapper, CompanyMapper companyMapper,
                      JwtAuthFilter jwtAuthFilter, BCryptPasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.companyMapper = companyMapper;
        this.jwtAuthFilter = jwtAuthFilter;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * 返回所有用户（含机构名称）。
     */
    public List<Map<String, Object>> getUsers() {
        return userMapper.findAll().stream().map(u -> {
            Map<String, Object> m = toMap(u);
            Company company = companyMapper.findById(u.getCompanyId());
            if (company != null) {
                m.put("company_name", company.getName());
                m.put("company_level", company.getLevel());
            }
            return m;
        }).collect(Collectors.toList());
    }

    /**
     * 查询指定机构下的用户。
     */
    public List<Map<String, Object>> getUsersByCompanyId(Long companyId) {
        return userMapper.findByCompanyId(companyId).stream().map(u -> {
            Map<String, Object> m = toMap(u);
            Company company = companyMapper.findById(u.getCompanyId());
            if (company != null) {
                m.put("company_name", company.getName());
            }
            return m;
        }).collect(Collectors.toList());
    }

    /**
     * 创建用户：默认密码 123456，校验用户名唯一、机构有效。
     */
    @Transactional
    public Map<String, Object> createUser(String username, String displayName, Long companyId, String role) {
        if (userMapper.findByUsername(username) != null) {
            throw new DomainException("用户名已存在", 400);
        }
        Company company = companyMapper.findById(companyId);
        if (company == null || !"active".equals(company.getStatus())) {
            throw new DomainException("目标机构不存在或已停用", 400);
        }
        validateRoleCompany(role, company);
        String hash = passwordEncoder.encode(DEFAULT_PASSWORD);
        userMapper.createUser(username, hash, displayName, companyId, role);
        User created = userMapper.findByUsername(username);
        return toMap(created);
    }

    /**
     * 重置密码为默认密码 123456。
     */
    @Transactional
    public Map<String, Object> resetPassword(Long id) {
        User existing = userMapper.findById(id);
        if (existing == null) {
            throw new DomainException("用户不存在", 404);
        }
        if ("super_admin".equals(existing.getRole())) {
            throw new DomainException("不能修改超级管理员", 403);
        }
        userMapper.updatePassword(id, passwordEncoder.encode(DEFAULT_PASSWORD));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "密码已重置为默认密码 " + DEFAULT_PASSWORD);
        return result;
    }

    /**
     * 启用/停用用户。
     */
    @Transactional
    public Map<String, Object> toggleStatus(Long id, String status) {
        User existing = userMapper.findById(id);
        if (existing == null) {
            throw new DomainException("用户不存在", 404);
        }
        if ("super_admin".equals(existing.getRole())) {
            throw new DomainException("不能修改超级管理员状态", 403);
        }
        userMapper.updateStatus(id, status);
        jwtAuthFilter.invalidateCache(id);
        Map<String, Object> result = toMap(userMapper.findById(id));
        return result;
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
        validateRoleCompany(role, company);
        userMapper.updateUserOrganizationRole(id, companyId, role);
        // 清除认证缓存，使下次请求重新加载机构/角色信息
        jwtAuthFilter.invalidateCache(id);
        return toMap(userMapper.findById(id));
    }

    /**
     * 角色与机构层级匹配校验。
     * - super_admin 不能通过管理页面创建/修改
     * - department_report_admin 仅允许部门级别
     * - branch_admin 仅允许分公司级别
     * - handler / reviewer / approver 允许在部门或分公司（总部业务部门也有经办/复核/审批需求）
     */
    private void validateRoleCompany(String role, Company company) {
        if ("super_admin".equals(role)) {
            throw new DomainException("不能创建超级管理员", 400);
        }
        if ("department_report_admin".equals(role) && !"department".equals(company.getLevel())) {
            throw new DomainException("报表管理员必须属于总部部门", 400);
        }
        if ("branch_admin".equals(role) && !"branch".equals(company.getLevel())) {
            throw new DomainException("分公司管理员必须属于分公司", 400);
        }
        if (("handler".equals(role) || "reviewer".equals(role) || "approver".equals(role))
                && "headquarter".equals(company.getLevel())) {
            throw new DomainException("经办人/复核人/审批人不能属于总部", 400);
        }
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
