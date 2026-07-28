package com.freereport.service;

import org.springframework.stereotype.Service;

import java.time.LocalDate;

/**
 * 周期标签与下发日计算：
 * - monthly   → 「yyyy年MM月」，每月 issue_day 日下发
 * - quarterly → 「yyyy年Qn」，每季度首月 issue_day 日下发
 * - yearly    → 「yyyy年」，每年 issue_month 月 issue_day 日下发
 * 标签格式与历史数据保持一致；daily/weekly/custom 不支持自动下发。
 */
@Service
public class PeriodLabelService {

    /**
     * 是否支持自动下发的周期类型。
     */
    public boolean isSchedulable(String periodType) {
        return "monthly".equals(periodType) || "quarterly".equals(periodType) || "yearly".equals(periodType);
    }

    /**
     * 参考日期所在周期的标签（与种子数据格式一致）。
     */
    public String currentPeriodLabel(String periodType, LocalDate ref) {
        switch (periodType) {
            case "monthly":
                return String.format("%d年%02d月", ref.getYear(), ref.getMonthValue());
            case "quarterly":
                return String.format("%d年Q%d", ref.getYear(), (ref.getMonthValue() - 1) / 3 + 1);
            case "yearly":
                return String.format("%d年", ref.getYear());
            default:
                throw new IllegalArgumentException("该周期类型不支持自动下发: " + periodType);
        }
    }

    /**
     * 参考日期所在周期的应下发日。
     * issue_day 限定 1-28，避免小月/闰月越界。
     */
    public LocalDate computeIssueDate(String periodType, Integer issueMonth, int issueDay, LocalDate ref) {
        int day = Math.min(Math.max(issueDay, 1), 28);
        switch (periodType) {
            case "monthly":
                return LocalDate.of(ref.getYear(), ref.getMonthValue(), day);
            case "quarterly": {
                int quarterFirstMonth = ((ref.getMonthValue() - 1) / 3) * 3 + 1;
                return LocalDate.of(ref.getYear(), quarterFirstMonth, day);
            }
            case "yearly": {
                int month = issueMonth == null ? 1 : Math.min(Math.max(issueMonth, 1), 12);
                return LocalDate.of(ref.getYear(), month, day);
            }
            default:
                throw new IllegalArgumentException("该周期类型不支持自动下发: " + periodType);
        }
    }
}
