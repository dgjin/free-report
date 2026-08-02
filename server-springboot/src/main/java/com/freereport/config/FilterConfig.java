package com.freereport.config;

import com.freereport.security.JwtAuthFilter;
import com.freereport.security.TraceIdFilter;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 过滤器注册配置。
 * 配置 TraceIdFilter 和 JwtAuthFilter 的执行顺序和 URL 匹配规则。
 * TraceIdFilter 必须在最前面，确保后续所有日志均携带 traceId。
 */
@Configuration
public class FilterConfig {

    /**
     * 注册 TraceIdFilter，确保每个请求都分配唯一 traceId。
     * Order=0，保证在所有其他 Filter 之前执行。
     */
    @Bean
    public FilterRegistrationBean<TraceIdFilter> traceIdFilterRegistration(TraceIdFilter filter) {
        FilterRegistrationBean<TraceIdFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(filter);
        registration.addUrlPatterns("/api/*");
        registration.setOrder(0); // traceId 在最前，确保后续 Filter/Service 日志均携带 traceId
        return registration;
    }

    /**
     * 注册 JwtAuthFilter，对 /api/* 请求进行 JWT 认证。
     * Order=1，在 TraceIdFilter 之后、业务逻辑之前执行。
     */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> jwtFilterRegistration(JwtAuthFilter filter) {
        FilterRegistrationBean<JwtAuthFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(filter);
        registration.addUrlPatterns("/api/*");
        registration.setOrder(1);
        return registration;
    }
}
