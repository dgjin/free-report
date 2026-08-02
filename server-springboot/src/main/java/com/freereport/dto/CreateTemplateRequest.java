package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 创建报表模板请求体。
 * 部门报表管理员用于定义新的报表模板，包含基本信息和字段配置。
 */
@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class CreateTemplateRequest {
    /** 模板名称（必填） */
    @NotBlank
    private String name;
    /** 模板描述（可选） */
    private String description;
    /** 报表周期类型：daily / weekly / monthly / quarterly / yearly / custom（必填） */
    @NotBlank
    private String periodType;
    /** 字段定义列表，每项包含 fieldName、fieldLabel、fieldType、dataType 等属性 */
    private List<Map<String, Object>> fields;
}
