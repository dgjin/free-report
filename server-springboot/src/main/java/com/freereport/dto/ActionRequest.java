package com.freereport.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 审批/签收操作请求体。
 * 用于审批流程（通过/驳回）和签收流程（签收/退回）中的动作提交。
 */
@Data
public class ActionRequest {
    /** 操作类型，如 approved / rejected / received / returned */
    @NotBlank
    private String action;
    /** 操作备注（可选），用于说明审批意见或退回原因 */
    private String comment;
}
