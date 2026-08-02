package com.freereport.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 任务撤回请求体。
 * 部门报表管理员撤回已下发但未完成的填报任务时提交。
 */
@Data
public class RecallRequest {
    /** 撤回原因（必填），说明撤回理由 */
    @NotBlank
    private String reason;
}
