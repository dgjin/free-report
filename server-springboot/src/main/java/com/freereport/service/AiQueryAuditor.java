package com.freereport.service;

import com.freereport.exception.DomainException;
import com.freereport.security.AuthUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
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

    /**
     * 在并发闸门与审计日志内执行一次问数动作。
     *
     * @param user     当前用户
     * @param question 自然语言问题（仅用于审计，截断到 200 字）
     * @param action   问数主流程
     */
    public Map<String, Object> execute(AuthUser user, String question, Supplier<Map<String, Object>> action) {
        if (!inFlightUsers.add(user.getId())) {
            throw new DomainException("您有一条问数请求正在处理中，请等它完成后再提问", 429);
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
            // 审计日志：谁在什么时候问了什么、命中了哪张表哪些周期、耗时多少
            log.info("[AI_QUERY_AUDIT] user={}({}) role={} outcome={} costMs={} scope={} question={}",
                    user.getId(), user.getUsername(), user.getRole(), outcome,
                    System.currentTimeMillis() - startedAt, scope, truncate(str(question), 200));
        }
    }

    /**
     * 流式问数执行：与 execute 相同的并发闸门与审计日志，但通过 onResult 回调传出最终结果。
     * 适用于 SSE 场景：结果在流关闭后通过回调传出，审计日志在 finally 中统一记录。
     */
    public void executeStream(AuthUser user, String question, Consumer<Consumer<Map<String, Object>>> action) {
        if (!inFlightUsers.add(user.getId())) {
            throw new DomainException("您有一条问数请求正在处理中，请等它完成后再提问", 429);
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
            log.info("[AI_QUERY_AUDIT] user={}({}) role={} outcome={} costMs={} scope={} question={} stream=true",
                    user.getId(), user.getUsername(), user.getRole(), auditInfo[0],
                    System.currentTimeMillis() - startedAt, auditInfo[1], truncate(str(question), 200));
        }
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String truncate(String text, int max) {
        return text.length() > max ? text.substring(0, max) : text;
    }
}
