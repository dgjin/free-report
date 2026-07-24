package com.freereport.service;

import com.freereport.dto.LoginResponse;
import com.freereport.entity.Company;
import com.freereport.entity.User;
import com.freereport.exception.DomainException;
import com.freereport.mapper.CompanyMapper;
import com.freereport.mapper.UserMapper;
import com.freereport.security.AuthUser;
import com.freereport.security.JwtTokenProvider;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * 认证服务：登录、获取当前用户。
 */
@Service
public class AuthService {

    private final UserMapper userMapper;
    private final CompanyMapper companyMapper;
    private final JwtTokenProvider jwtTokenProvider;
    private final BCryptPasswordEncoder passwordEncoder;

    public AuthService(UserMapper userMapper, CompanyMapper companyMapper,
                       JwtTokenProvider jwtTokenProvider, BCryptPasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.companyMapper = companyMapper;
        this.jwtTokenProvider = jwtTokenProvider;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * 登录：校验用户名密码（大小写不敏感）与账号状态，生成 JWT。
     */
    public LoginResponse login(String username, String password) {
        User user = userMapper.findByUsername(username);
        if (user == null) {
            throw new DomainException("用户名或密码错误", 401);
        }
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new DomainException("用户名或密码错误", 401);
        }
        if (!"active".equals(user.getStatus())) {
            throw new DomainException("账号已被停用，请联系管理员", 403);
        }
        Company company = companyMapper.findById(user.getCompanyId());
        AuthUser authUser = toAuthUser(user, company);
        String token = jwtTokenProvider.generateToken(authUser);
        return new LoginResponse(token, authUser);
    }

    /**
     * 获取当前登录用户信息。
     */
    public AuthUser getMe(AuthUser currentUser) {
        return currentUser;
    }

    private AuthUser toAuthUser(User user, Company company) {
        AuthUser authUser = new AuthUser();
        authUser.setId(user.getId());
        authUser.setUsername(user.getUsername());
        authUser.setDisplayName(user.getDisplayName());
        authUser.setCompanyId(user.getCompanyId());
        authUser.setRole(user.getRole());
        if (company != null) {
            authUser.setCompanyName(company.getName());
            authUser.setCompanyCode(company.getCode());
            authUser.setCompanyLevel(company.getLevel());
        }
        return authUser;
    }
}
