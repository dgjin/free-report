package com.freereport.entity;

import lombok.Data;

/**
 * 报表模板字段实体，对应 report_template_field 表。
 * 定义模板中的每个填报字段，包括字段名称、类型、所属数据区等。
 */
@Data
public class ReportTemplateField {
    private Long id;
    /** 关联的报表模板 ID */
    private Long templateId;
    /** 字段标识名（英文，如 vehicle_count） */
    private String fieldName;
    /** 字段显示标签（中文，如 "车辆数量"） */
    private String fieldLabel;
    /** 字段输入类型：text / number / date / select / textarea */
    private String fieldType;
    /** 数据区域类型：summary(汇总区) / detail(明细区) / matrix(矩阵区) */
    private String dataType;
    /** 字段扩展配置（JSON 字符串，如 select 选项、校验规则等） */
    private String fieldConfig;
    /** 排序序号 */
    private Integer sortOrder;
    /** 字段状态：active(启用) / inactive(停用) */
    private String status;
    /** 是否敏感字段（默认 false），敏感字段在智能问数中不可查询 */
    private Boolean sensitive = false;
}
