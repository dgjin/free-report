package com.freereport.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 智能问数的大模型服务配置（OpenAI 兼容协议）。
 * 生产环境指向 DeepSeek，测试环境可指向本地 Ollama，仅切换配置无需改代码。
 */
@Data
@Component
@ConfigurationProperties(prefix = "ai")
public class AiProperties {

    /** 是否启用智能问数 */
    private boolean enabled = true;

    /** OpenAI 兼容服务的基础地址，如 https://api.deepseek.com/v1 */
    private String baseUrl = "https://api.deepseek.com/v1";

    /** API Key，仅存于后端，不下发浏览器 */
    private String apiKey = "";

    /** 模型名称 */
    private String model = "deepseek-chat";

    /** 单次调用超时（秒） */
    private int timeoutSeconds = 60;

    /**
     * 思考强度，仅对支持思维链的模型有效（如 Ollama 的 qwen3 系列：none/low/medium/high）。
     * 留空表示不下发该参数，由服务端默认值决定。
     */
    private String reasoningEffort = "";
}
