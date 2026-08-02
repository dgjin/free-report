package com.freereport.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC 配置。
 * 配置跨域访问 (CORS) 规则，允许前端开发服务器跨域调用 API。
 * 通过 cors.allowed-origins 配置项动态设置允许的源地址。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    /** 允许跨域的源地址列表，多个地址用逗号分隔，默认为本地开发地址 */
    @Value("${cors.allowed-origins:http://localhost:5173,http://localhost:3000}")
    private String allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins.split(","))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                // 暴露滑动过期续签头 + 请求追踪头，跨域场景下前端 fetch 才能读取
                .exposedHeaders("X-Refreshed-Token", "X-Trace-Id")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
