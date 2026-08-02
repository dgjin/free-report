package com.freereport.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.freereport.entity.User;
import com.freereport.mapper.UserMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class JwtAuthFilter implements Filter {
    private final JwtTokenProvider jwtTokenProvider;
    private final UserMapper userMapper;
    private final ObjectMapper objectMapper;

    // Auth cache: 30s TTL to avoid DB queries on every request
    private static final long CACHE_TTL_MS = 30_000;
    private static final int MAX_CACHE_SIZE = 10_000;
    /** 滑动过期：token 临近过期时通过该响应头下发新 token，前端无感替换 */
    private static final String REFRESHED_TOKEN_HEADER = "X-Refreshed-Token";
    private final Map<Long, CacheEntry> cache = new ConcurrentHashMap<>();

    record CacheEntry(AuthUser authUser, long expiresAt) {}

    public JwtAuthFilter(JwtTokenProvider jwtTokenProvider, UserMapper userMapper, ObjectMapper objectMapper) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.userMapper = userMapper;
        this.objectMapper = objectMapper;
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;
        String path = request.getRequestURI();

        // CORS 预检请求直接放行，浏览器 OPTIONS 不携带 Authorization 头
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(req, res);
            return;
        }

        // Skip auth for login and health check
        if (path.equals("/api/auth/login") || path.equals("/api/health")) {
            chain.doFilter(req, res);
            return;
        }

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            writeError(response, 401, "未提供认证 Token 或格式错误");
            return;
        }

        String token = authHeader.substring(7);
        if (!jwtTokenProvider.validateToken(token)) {
            writeError(response, 401, "Token 无效或已过期，请重新登录");
            return;
        }

        AuthUser authUser = jwtTokenProvider.getAuthUserFromToken(token);

        // 滑动过期：剩余有效期低于阈值时签发新 token，前端无感替换，避免活跃使用中突然掉线。
        // 须在 chain.doFilter 之前写入响应头，防止响应提交后头部无法修改。
        if (jwtTokenProvider.needsRenewal(token)) {
            response.setHeader(REFRESHED_TOKEN_HEADER, jwtTokenProvider.generateToken(authUser));
        }

        // Check cache
        CacheEntry cached = cache.get(authUser.getId());
        if (cached != null && System.currentTimeMillis() < cached.expiresAt()) {
            request.setAttribute("authUser", cached.authUser());
            chain.doFilter(req, res);
            return;
        }

        // Verify user is still active
        User user = userMapper.findById(authUser.getId());
        if (user == null || !"active".equals(user.getStatus())) {
            writeError(response, 401, "账号不存在或已停用，请重新登录");
            return;
        }

        // Refresh company info from DB
        var company = userMapper.findCompanyById(user.getCompanyId());
        if (company != null) {
            authUser.setCompanyName(company.getName());
            authUser.setCompanyCode(company.getCode());
            authUser.setCompanyLevel(company.getLevel());
        }

        cache.put(authUser.getId(), new CacheEntry(authUser, System.currentTimeMillis() + CACHE_TTL_MS));

        // 定期清理过期条目，防止缓存无限增长
        if (cache.size() > MAX_CACHE_SIZE) {
            long now = System.currentTimeMillis();
            cache.entrySet().removeIf(e -> now >= e.getValue().expiresAt());
        }
        request.setAttribute("authUser", authUser);
        chain.doFilter(req, res);
    }

    private void writeError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), Map.of("error", message));
    }

    public void invalidateCache(Long userId) {
        if (userId != null) cache.remove(userId);
        else cache.clear();
    }

    /**
     * 失效指定机构下所有用户的认证缓存（用于机构停用等场景）。
     */
    public void invalidateCacheByCompanyId(Long companyId) {
        if (companyId == null) return;
        List<Long> userIds = userMapper.findIdsByCompanyId(companyId);
        for (Long uid : userIds) {
            cache.remove(uid);
        }
    }
}
