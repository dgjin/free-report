package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 智能问数请求体。
 * 前端将用户的自然语言问题及最近对话历史提交到后端，由 AiQueryService 处理并返回 SSE 流。
 */
@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class AiQueryRequest {
    /** 用户的自然语言问题（必填，最大 500 字） */
    @NotBlank(message = "问题不能为空")
    @Size(max = 500, message = "问题长度不能超过 500 字")
    private String question;

    /** 最近若干轮对话历史，用于支持追问上下文。每项包含 role(user|assistant) 和 content */
    private List<Map<String, String>> history;
}
