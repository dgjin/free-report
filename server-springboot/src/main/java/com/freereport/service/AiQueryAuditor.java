package com.freereport.service;

import com.freereport.exception.DomainException;
import com.freereport.security.AuthUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Deque;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * 智能问数执行保护：单用户并发限 1（LLM 调用慢且贵，防止重复点击打爆服务）+ 审计日志。
 */
@Slf4j
@Component
public class AiQueryAuditor {

    /** 正在执行问数的用户 ID 集合，单用户并发限 1 */
    private final Set<Long> inFlightUsers = ConcurrentHashMap.newKeySet();

    /** 每用户每小时调用次数限制（滑动窗口） */
    private final Map<Long, Deque<Long>> userCallTimestamps = new ConcurrentHashMap<>();
    private static final int MAX_CALLS_PER_HOUR = 20;
    private static final long WINDOW_MS = 3600_000L;

    /**
     * 在并发闸门与审计日志内执行一次问数动作。
     *
     * @param user        当前用户
     * @param question    自然语言问题（仅用于审计，截断到 200 字）
     * @param auditCtxRef 审计上下文引用容器（长度 1 的数组），由 action 内部填充
     * @param action      问数主流程
     */
    public Map<String, Object> execute(AuthUser user, String question, AiAuditContext[] auditCtxRef,
                                        Supplier<Map<String, Object>> action) {
        if (!inFlightUsers.add(user.getId())) {
            throw new DomainException("您有一条问数请求正在处理中，请等它完成后再提问", 429);
        }
        if (!checkRateLimit(user.getId())) {
            inFlightUsers.remove(user.getId());
            throw new DomainException("您本小时的问数次数已达上限（" + MAX_CALLS_PER_HOUR + "次），请稍后再试", 429);
        }
        long startedAt = System.currentTimeMillis();
        String outcome = "error";
        String scope = "-";
        try {
            Map<String, Object> result = action.get();
            Object plan = result.get("plan");
            outcome = plan != null ? "answered" : "no_data";
            if (plan instanceof Map<?, ?> p) {
                scope = "template=" + p.get("template_id") + " periods=" + p.get("period_labels");
            }
            return result;
        } finally {
            inFlightUsers.remove(user.getId());
            AiAuditContext ac = auditCtxRef != null ? auditCtxRef[0] : null;
            log.info("[AI_QUERY_AUDIT] user={}({}) role={} outcome={} costMs={} scope={} "
                            + "templates_exposed={} metrics_exposed={} selected_template={} question={}",
                    user.getId(), user.getUsername(), user.getRole(), outcome,
                    System.currentTimeMillis() - startedAt, scope,
                    ac != null ? ac.exposedTemplateIds() : "-",
                    ac != null ? ac.exposedMetricCount() : "-",
                    ac != null ? ac.selectedTemplateId() : "-",
                    truncate(str(question), 200));
        }
    }

    /**
     * 流式问数执行：与 execute 相同的并发闸门与审计日志，但通过 onResult 回调传出最终结果。
     * 适用于 SSE 场景：结果在流关闭后通过回调传出，审计日志在 finally 中统一记录。
     */
    public void executeStream(AuthUser user, String question, AiAuditContext[] auditCtxRef,
                               Consumer<Consumer<Map<String, Object>>> action) {
        if (!inFlightUsers.add(user.getId())) {
            throw new DomainException("您有一条问数请求正在处理中，请等它完成后再提问", 429);
        }
        if (!checkRateLimit(user.getId())) {
            inFlightUsers.remove(user.getId());
            throw new DomainException("您本小时的问数次数已达上限（" + MAX_CALLS_PER_HOUR + "次），请稍后再试", 429);
        }
        long startedAt = System.currentTimeMillis();
        String[] auditInfo = {"error", "-"}; // [outcome, scope]
        try {
            action.accept(result -> {
                Object plan = result.get("plan");
                auditInfo[0] = plan != null ? "answered" : "no_data";
                if (plan instanceof Map<?, ?> p) {
                    auditInfo[1] = "template=" + p.get("template_id") + " periods=" + p.get("period_labels");
                }
            });
        } finally {
            inFlightUsers.remove(user.getId());
            AiAuditContext ac = auditCtxRef != null ? auditCtxRef[0] : null;
            log.info("[AI_QUERY_AUDIT] user={}({}) role={} outcome={} costMs={} scope={} "
                            + "templates_exposed={} metrics_exposed={} selected_template={} question={} stream=true",
                    user.getId(), user.getUsername(), user.getRole(), auditInfo[0],
                    System.currentTimeMillis() - startedAt, auditInfo[1],
                    ac != null ? ac.exposedTemplateIds() : "-",
                    ac != null ? ac.exposedMetricCount() : "-",
                    ac != null ? ac.selectedTemplateId() : "-",
                    truncate(str(question), 200));
        }
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String truncate(String text, int max) {
        return text.length() > max ? text.substring(0, max) : text;
    }

    /** 滑动窗口频率限制：每用户每小时最多 MAX_CALLS_PER_HOUR 次调用 */
    private boolean checkRateLimit(Long userId) {
        Deque<Long> timestamps = userCallTimestamps.computeIfAbsent(userId, k -> new ConcurrentLinkedDeque<>());
        long now = System.currentTimeMillis();
        while (!timestamps.isEmpty() && now - timestamps.peekFirst() > WINDOW_MS) {
            timestamps.pollFirst();
        }
        if (timestamps.size() >= MAX_CALLS_PER_HOUR) {
            return false;
        }
        timestamps.addLast(now);
        return true;
    }
}
