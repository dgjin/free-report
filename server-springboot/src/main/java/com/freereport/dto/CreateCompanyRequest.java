package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 创建机构请求体。
 * 仅超级管理员可操作，用于在组织树中新增机构节点。
 */
@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class CreateCompanyRequest {
    /** 机构名称（必填） */
    @NotBlank
    private String name;
    /** 机构编码（必填，全局唯一） */
    @NotBlank
    private String code;
    /** 上级机构 ID（可选，为空时创建顶级机构） */
    private Long parentId;
    /** 机构层级：headquarter(总部) / department(部门) / branch(分公司)（必填） */
    @NotBlank
    private String level;
}
