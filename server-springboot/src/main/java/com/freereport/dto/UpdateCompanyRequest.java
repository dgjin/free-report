package com.freereport.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 更新机构信息请求体。
 * 仅超级管理员可操作，用于修改机构的基本信息。
 */
@Data
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class UpdateCompanyRequest {
    /** 机构名称（必填） */
    @NotBlank
    private String name;
    /** 机构编码（必填，全局唯一） */
    @NotBlank
    private String code;
    /** 机构地址（可选） */
    private String address;
    /** 联系人姓名（可选） */
    private String contact;
    /** 联系电话（可选） */
    private String phone;
}
