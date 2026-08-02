package com.freereport.security;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;

/**
 * 请求追踪 Filter：为每个 HTTP 请求生成唯一 traceId 并写入 MDC，
 * 便于日志关联、问题排查和审计追溯。
 * <p>
 * - 如果上游已通过 X-Trace-Id 头传递 traceId（如网关/负载均衡），则复用而非重新生成
 * - 响应头 X-Trace-Id 回传，前端可用于错误上报
 * - 请求结束后清理 MDC，防止线程复用导致 traceId 泄漏
 */
@Component
public class TraceIdFilter implements Filter {

    private static final String TRACE_ID_KEY = "traceId";
    private static final String TRACE_ID_HEADER = "X-Trace-Id";

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        // 优先使用上游传递的 traceId（网关/负载均衡场景），否则生成新的
        String traceId = request.getHeader(TRACE_ID_HEADER);
        if (traceId == null || traceId.isBlank()) {
            traceId = generateTraceId();
        }

        MDC.put(TRACE_ID_KEY, traceId);
        response.setHeader(TRACE_ID_HEADER, traceId);

        try {
            chain.doFilter(req, res);
        } finally {
            MDC.remove(TRACE_ID_KEY);
        }
    }

    /**
     * 生成短格式 traceId：取 UUID 前 8 位 + 后 4 位，共 12 字符，
     * 兼顾唯一性和日志可读性（完整 UUID 36 字符过于冗长）。
     */
    private String generateTraceId() {
        String uuid = UUID.randomUUID().toString().replace("-", "");
        return uuid.substring(0, 8) + uuid.substring(28);
    }
}
