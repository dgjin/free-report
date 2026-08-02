package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

/**
 * 模板下发请求体。
 * 部门报表管理员将模板下发给一个或多个分公司，生成填报任务。
 */
@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class AssignTemplateRequest {
    /** 目标分公司 ID 列表（必填，不能为空） */
    @NotEmpty
    private List<Long> companyIds;
    /** 任务标题（必填） */
    @NotBlank
    private String title;
    /** 期次标签，如 "2026年07月"（必填） */
    @NotBlank
    private String periodLabel;
    /** 截止日期，格式 YYYY-MM-DD（可选，为空时使用模板配置的默认截止日） */
    private String deadline;
    /** 是否一次性下发（可选，默认 false）。为 true 时不会进入自动下发周期 */
    private Boolean isOneTime;
}
