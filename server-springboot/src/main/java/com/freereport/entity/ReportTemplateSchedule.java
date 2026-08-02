package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 报表模板定时下发配置实体，对应 report_template_schedule 表。
 * 定义模板的自动下发规则，包括下发频率、截止日期偏移量、目标分公司等。
 */
@Data
public class ReportTemplateSchedule {
    private Long id;
    /** 关联的报表模板 ID */
    private Long templateId;
    /** 是否启用自动下发（TINYINT(1)） */
    private Integer enabled;
    /** 仅年报：每年第几月下发（1-12） */
    private Integer issueMonth;
    /** 月报=每月N日；季报=每季首月N日；年报=issue_month月N日 */
    private Integer issueDay;
    /** 下发后 N 天为填报截止日 */
    private Integer deadlineOffsetDays;
    /** 目标分公司 ID 列表（JSON 数组字符串，如 [2,3,4]） */
    private String targetCompanyIds;
    /** 最近一次自动下发的期次标签 */
    private String lastPeriodLabel;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
