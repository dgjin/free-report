package com.freereport.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.freereport.config.AiProperties;
import com.freereport.exception.DomainException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * OpenAI 兼容 chat completions 客户端（JDK 内置 HttpClient，不引入额外依赖）。
 * DeepSeek / Ollama / 自建网关均可通过配置切换。
 */
@Slf4j
@Service
public class AiClient {

    private final AiProperties aiProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public AiClient(AiProperties aiProperties, ObjectMapper objectMapper) {
        this.aiProperties = aiProperties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * 智能问数是否可用（未启用或未配置 Key 时前端隐藏入口）。
     */
    public boolean isAvailable() {
        return aiProperties.isEnabled()
                && aiProperties.getApiKey() != null && !aiProperties.getApiKey().isBlank()
                && aiProperties.getBaseUrl() != null && !aiProperties.getBaseUrl().isBlank();
    }

    /**
     * 发起一次对话补全调用，返回模型的文本内容。
     *
     * @param messages 形如 [{role: system|user|assistant, content: ...}]
     * @param jsonMode 是否要求模型输出 JSON 对象
     */
    public String chat(List<Map<String, String>> messages, boolean jsonMode) {
        if (!isAvailable()) {
            throw new DomainException("智能问数未配置，请联系系统管理员", 503);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", aiProperties.getModel());
        body.put("messages", messages);
        body.put("temperature", jsonMode ? 0 : 0.3);
        body.put("stream", false);
        if (jsonMode) {
            body.put("response_format", Map.of("type", "json_object"));
        }
        // 思考型模型（如 qwen3）默认思维链很长，配置后可显著降低单次问数耗时
        String reasoningEffort = aiProperties.getReasoningEffort();
        if (reasoningEffort != null && !reasoningEffort.isBlank()) {
            body.put("reasoning_effort", reasoningEffort.trim());
        }

        String payload;
        try {
            payload = objectMapper.writeValueAsString(body);
        } catch (Exception e) {
            throw new DomainException("AI 请求构造失败", 500);
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(joinUrl(aiProperties.getBaseUrl(), "/chat/completions")))
                .timeout(Duration.ofSeconds(Math.max(5, aiProperties.getTimeoutSeconds())))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + aiProperties.getApiKey())
                .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DomainException("AI 服务暂时不可用，请稍后重试", 503);
        } catch (Exception e) {
            log.error("调用 AI 服务失败: {}", e.getMessage());
            throw new DomainException("AI 服务暂时不可用，请稍后重试", 503);
        }

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            log.error("AI 服务返回异常状态 {}: {}", response.statusCode(), truncate(response.body()));
            throw new DomainException("AI 服务暂时不可用，请稍后重试", 503);
        }

        try {
            JsonNode root = objectMapper.readTree(response.body());
            JsonNode content = root.path("choices").path(0).path("message").path("content");
            if (content.isMissingNode() || content.isNull()) {
                log.error("AI 服务响应缺少 content: {}", truncate(response.body()));
                throw new DomainException("AI 服务返回内容异常，请稍后重试", 503);
            }
            return content.asText();
        } catch (DomainException e) {
            throw e;
        } catch (Exception e) {
            log.error("解析 AI 服务响应失败: {}", e.getMessage());
            throw new DomainException("AI 服务返回内容异常，请稍后重试", 503);
        }
    }

    /** 构造消息列表的便捷方法 */
    public static List<Map<String, String>> messages(String systemPrompt, String userPrompt) {
        List<Map<String, String>> list = new ArrayList<>();
        list.add(Map.of("role", "system", "content", systemPrompt));
        list.add(Map.of("role", "user", "content", userPrompt));
        return list;
    }

    /**
     * 流式对话补全：以 OpenAI SSE 协议调用模型，每收到一个 token 即通过 onChunk 回调推送，
     * 让前端实现打字机效果，无需等待整段结论生成完毕。
     *
     * @param messages 对话消息列表
     * @param onChunk  每收到一个文本片段时调用（通常 1~3 个字符）
     * @return 拼接后的完整文本（用于审计/降级场景）
     */
    public String streamChat(List<Map<String, String>> messages, Consumer<String> onChunk) {
        if (!isAvailable()) {
            throw new DomainException("智能问数未配置，请联系系统管理员", 503);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", aiProperties.getModel());
        body.put("messages", messages);
        body.put("temperature", 0.3);
        body.put("stream", true);
        String reasoningEffort = aiProperties.getReasoningEffort();
        if (reasoningEffort != null && !reasoningEffort.isBlank()) {
            body.put("reasoning_effort", reasoningEffort.trim());
        }

        String payload;
        try {
            payload = objectMapper.writeValueAsString(body);
        } catch (Exception e) {
            throw new DomainException("AI 请求构造失败", 500);
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(joinUrl(aiProperties.getBaseUrl(), "/chat/completions")))
                .timeout(Duration.ofSeconds(Math.max(5, aiProperties.getTimeoutSeconds())))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + aiProperties.getApiKey())
                .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                .build();

        HttpResponse<InputStream> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DomainException("AI 服务暂时不可用，请稍后重试", 503);
        } catch (Exception e) {
            log.error("调用 AI 流式服务失败: {}", e.getMessage());
            throw new DomainException("AI 服务暂时不可用，请稍后重试", 503);
        }

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            log.error("AI 流式服务返回异常状态 {}", response.statusCode());
            throw new DomainException("AI 服务暂时不可用，请稍后重试", 503);
        }

        // 同步读取 SSE 流：InputStream 由底层 HTTP 连接实时填充，readLine() 会阻塞直到新数据到达
        StringBuilder fullText = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (!trimmed.startsWith("data: ")) continue;
                String data = trimmed.substring(6);
                if ("[DONE]".equals(data)) break;
                try {
                    int idx = data.indexOf("\"content\":");
                    if (idx < 0) continue;
                    int start = data.indexOf('"', idx + 10);
                    if (start < 0) continue;
                    int end = findClosingQuote(data, start + 1);
                    if (end < 0) continue;
                    String token = unescapeJson(data.substring(start + 1, end));
                    if (!token.isEmpty()) {
                        fullText.append(token);
                        onChunk.accept(token);
                    }
                } catch (Exception ignored) {
                    // 单行解析异常不影响后续行
                }
            }
        } catch (Exception e) {
            log.warn("读取 AI 流式响应时异常: {}", e.getMessage());
        }

        return fullText.toString();
    }

    /** 查找 JSON 字符串中未转义的结束引号位置 */
    private static int findClosingQuote(String s, int from) {
        for (int i = from; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' && s.charAt(i - 1) != '\\') return i;
        }
        return -1;
    }

    /** 简易 JSON 转义还原：\\n → 换行，\\" → 引号，\\\\ → 反斜杠 */
    private static String unescapeJson(String s) {
        if (s.indexOf('\\') < 0) return s;
        return s.replace("\\n", "\n").replace("\\t", "\t").replace("\\\"", "\"").replace("\\\\", "\\");
    }

    private String joinUrl(String base, String path) {
        String b = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        return b + path;
    }

    private String truncate(String text) {
        if (text == null) return "";
        return text.length() > 500 ? text.substring(0, 500) + "..." : text;
    }
}
