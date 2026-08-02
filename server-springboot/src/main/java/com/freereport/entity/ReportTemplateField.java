package com.freereport.entity;

import lombok.Data;

@Data
public class ReportTemplateField {
    private Long id;
    private Long templateId;
    private String fieldName;
    private String fieldLabel;
    private String fieldType; // text, number, date, select, textarea
    private String dataType; // summary, detail, matrix
    private String fieldConfig; // JSON string
    private Integer sortOrder;
    private String status; // active, inactive
    /** 是否敏感字段（默认 false） */
    private Boolean sensitive = false;
}
