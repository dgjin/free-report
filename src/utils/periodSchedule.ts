/**
 * 周期标签与应下发日计算（前端镜像后端 PeriodLabelService 规则）。
 * 仅 monthly/quarterly/yearly 支持自动下发；daily/weekly/custom 保持手动下发。
 */

export type SchedulablePeriodType = 'monthly' | 'quarterly' | 'yearly';

export function isSchedulablePeriodType(periodType: string): periodType is SchedulablePeriodType {
  return periodType === 'monthly' || periodType === 'quarterly' || periodType === 'yearly';
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 当前周期标签：monthly→yyyy年MM月；quarterly→yyyy年Qn；yearly→yyyy年。
 * 其余类型回退为月度标签（与种子数据格式一致）。
 */
export function currentPeriodLabel(periodType: string, ref: Date = new Date()): string {
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1;
  switch (periodType) {
    case 'monthly':
      return `${y}年${pad2(m)}月`;
    case 'quarterly':
      return `${y}年Q${Math.floor((m - 1) / 3) + 1}`;
    case 'yearly':
      return `${y}年`;
    default:
      return `${y}年${pad2(m)}月`;
  }
}

/**
 * 本期应下发日（issue_day 钳制 1-28）：
 * - monthly：当月 issueDay 日
 * - quarterly：季度首月 issueDay 日
 * - yearly：issueMonth 月 issueDay 日（issueMonth 非法时回退 1 月）
 * 不支持的周期类型返回 null。
 */
export function computeIssueDate(
  periodType: string,
  issueDay: number,
  issueMonth: number | null | undefined,
  ref: Date = new Date(),
): Date | null {
  // 与后端一致：issue_day/issue_month 越界时钳制到合法区间（非回退默认值）
  const day = Math.min(28, Math.max(1, Math.trunc(issueDay || 0)));
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1;
  switch (periodType) {
    case 'monthly':
      return new Date(y, m - 1, day);
    case 'quarterly':
      return new Date(y, Math.floor((m - 1) / 3) * 3, day);
    case 'yearly': {
      const im = issueMonth == null ? 1 : Math.min(12, Math.max(1, Math.trunc(issueMonth)));
      return new Date(y, im - 1, day);
    }
    default:
      return null;
  }
}

/** 下发时间的人类可读描述：每月N日 / 每季首月N日 / 每年M月N日 */
export function describeIssueRule(
  periodType: string,
  issueDay: number,
  issueMonth?: number | null,
): string {
  switch (periodType) {
    case 'monthly':
      return `每月 ${issueDay} 日`;
    case 'quarterly':
      return `每季首月 ${issueDay} 日`;
    case 'yearly':
      return `每年 ${issueMonth ?? 1} 月 ${issueDay} 日`;
    default:
      return '不支持自动下发';
  }
}
