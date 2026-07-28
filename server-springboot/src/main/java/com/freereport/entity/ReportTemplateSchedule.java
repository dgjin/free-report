package com.freereport.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportTemplateSchedule {
    private Long id;
    private Long templateId;
    private Integer enabled; // TINYINT(1)
    private Integer issueMonth; // 仅年报：每年第几月下发（1-12）
    private Integer issueDay; // 月报=每月N日；季报=每季首月N日；年报=issue_month月N日
    private Integer deadlineOffsetDays; // 下发后 N 天为填报截止日
    private String targetCompanyIds; // JSON 数组字符串，如 [2,3,4]
    private String lastPeriodLabel;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
