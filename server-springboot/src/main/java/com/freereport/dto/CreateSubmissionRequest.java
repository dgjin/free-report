package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 创建/更新填报提交请求体。
 * 分公司填报人员保存填报数据，可选保存为草稿或直接提交。
 */
@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class CreateSubmissionRequest {
    /** 关联的下发任务 ID（必填） */
    @NotNull
    private Long assignmentId;
    /** 汇总区数据，key 为字段 ID，value 为填写值 */
    private Map<String, Object> summary;
    /** 明细区数据，每个元素为一行明细，key 为字段 ID */
    private List<Map<String, Object>> details;
    /** 提交备注（可选） */
    private String comment;
    /** 操作类型："draft" 保存草稿 | "submit" 直接提交（必填） */
    @NotNull
    private String action;
}
