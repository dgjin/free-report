import type { FieldConfig, ReportTemplateField } from '../types';
import type { MatrixGroup } from './aggregationView';

/**
 * 数据校验纯函数（供填报提交、数据初始化导入、明细导入与单元测试共用）。
 * 基础校验：必填、number 数字与 min/max 范围、date 格式（YYYY-MM-DD）、select 值须在选项内；
 * 跨字段校验（汇总 number 字段）：sum_of（等于其他汇总字段之和）、
 * detail_sum_of（等于某明细/交叉表数字列合计），浮点比较容差 0.005。
 */

export interface ValidationIssue {
  scope: 'summary' | 'detail' | 'matrix' | 'cross';
  field_id: number;
  /** 明细/交叉表错误所在行（明细为 1 基行号，交叉表为行选项下标） */
  row?: number;
  message: string;
}

/** 跨字段求和比较容差 */
export const SUM_TOLERANCE = 0.005;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 解析 field_config：沿用现有 JSON 容错习惯（string 则 try-parse，失败视为无配置） */
export function parseFieldConfig(field: ReportTemplateField): FieldConfig {
  const raw = field.field_config;
  if (typeof raw !== 'string') return raw || {};
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

/**
 * 单值校验（不含必填）：number 必须可解析为数字且落在 min/max；
 * date 匹配 YYYY-MM-DD 且是合法日期；select 值须在 options 内；text/textarea 不限。
 * 空值视为合法（必填由调用方单独判断）。返回错误文案或 null。
 */
export function validateFieldValue(
  field: Pick<ReportTemplateField, 'field_type' | 'field_label'>,
  value: string,
  config: FieldConfig,
): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;

  if (field.field_type === 'number') {
    const num = Number(text);
    if (!Number.isFinite(num)) {
      return `「${field.field_label}」值「${text}」不是有效数字`;
    }
    if (typeof config.min === 'number' && num < config.min) {
      return `「${field.field_label}」值 ${text} 小于最小值 ${config.min}`;
    }
    if (typeof config.max === 'number' && num > config.max) {
      return `「${field.field_label}」值 ${text} 大于最大值 ${config.max}`;
    }
    return null;
  }

  if (field.field_type === 'date') {
    if (!DATE_PATTERN.test(text) || Number.isNaN(new Date(`${text}T00:00:00`).getTime())) {
      return `「${field.field_label}」值「${text}」不是有效日期（格式须为 YYYY-MM-DD）`;
    }
    return null;
  }

  if (field.field_type === 'select') {
    const options = config.options || [];
    if (options.length > 0 && !options.includes(text)) {
      return `「${field.field_label}」值「${text}」不在可选项内`;
    }
    return null;
  }

  return null;
}

/** 行内任一字段有非空值即视为非空行（空占位行跳过校验） */
function isEmptyRow(row: Record<string, string> | null | undefined): boolean {
  if (!row) return true;
  return Object.values(row).every((v) => String(v ?? '').trim() === '');
}

/** 解析数值：空/非法返回 null */
function toNumber(value: string | undefined): number | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

/**
 * 整单提交校验：
 * - 汇总字段：required 空值报错 + 单值校验 + 跨字段规则（sum_of / detail_sum_of）
 * - 明细行：跳过空行；非空行逐字段单值校验 + required 检查，错误带行号
 * - 交叉表单元格：仅对已填值做单值校验（固定行允许留空），错误按行选项名定位
 * 跨字段规则引用不到的字段 id 直接忽略（防御式，被引用字段可能已停用/删除）。
 */
export function validateSubmission(
  fields: ReportTemplateField[],
  summary: Record<string, string>,
  details: Array<Record<string, string>>,
  matrixGroups: MatrixGroup[] = [],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const summaryFields = fields.filter((f) => f.data_type === 'summary');
  const detailFields = fields.filter((f) => f.data_type === 'detail');
  const configById = new Map(fields.map((f) => [f.id, parseFieldConfig(f)]));

  // ---- 汇总字段 ----
  for (const f of summaryFields) {
    const config = configById.get(f.id) || {};
    const value = String(summary[f.id] ?? '').trim();
    if (config.required && !value) {
      issues.push({ scope: 'summary', field_id: f.id, message: `「${f.field_label}」为必填项` });
      continue;
    }
    const err = validateFieldValue(f, value, config);
    if (err) {
      issues.push({ scope: 'summary', field_id: f.id, message: err });
    }
  }

  // ---- 明细行 ----
  const detailIds = new Set(detailFields.map((f) => f.id));
  details.forEach((row, i) => {
    if (isEmptyRow(row)) return;
    // 交叉表固定行上可能只有 matrix 值：仅当该行含明细字段值或存在必填明细字段时才按明细行校验
    const hasDetailValue = Object.entries(row).some(
      ([k, v]) => detailIds.has(Number(k)) && String(v ?? '').trim() !== '',
    );
    for (const f of detailFields) {
      const config = configById.get(f.id) || {};
      const value = String(row[f.id] ?? '').trim();
      if (config.required && !value) {
        if (hasDetailValue) {
          issues.push({
            scope: 'detail',
            field_id: f.id,
            row: i + 1,
            message: `明细第 ${i + 1} 行：「${f.field_label}」为必填项`,
          });
        }
        continue;
      }
      const err = validateFieldValue(f, value, config);
      if (err) {
        issues.push({ scope: 'detail', field_id: f.id, row: i + 1, message: `明细第 ${i + 1} 行：${err}` });
      }
    }
  });

  // ---- 交叉表单元格（仅已填值做类型/范围校验，不做必填） ----
  for (const group of matrixGroups) {
    group.rowOptions.forEach((rowOpt, rowIdx) => {
      const row = details[rowIdx];
      if (!row) return;
      for (const col of group.columns) {
        const value = String(row[col.id] ?? '').trim();
        if (!value) continue;
        const config = configById.get(col.id) || {};
        const err = validateFieldValue(col, value, config);
        if (err) {
          issues.push({
            scope: 'matrix',
            field_id: col.id,
            row: rowIdx,
            message: `交叉表 ${group.rowLabel}-${rowOpt}：${err}`,
          });
        }
      }
    });
  }

  // ---- 跨字段规则（汇总 number 字段） ----
  const summaryById = new Map(summaryFields.map((f) => [f.id, f]));
  const numberColumnIds = new Set(
    fields
      .filter((f) => (f.data_type === 'detail' || f.data_type === 'matrix') && f.field_type === 'number')
      .map((f) => f.id),
  );
  for (const f of summaryFields) {
    if (f.field_type !== 'number') continue;
    const config = configById.get(f.id) || {};
    const rule = config.validation;
    if (!rule) continue;
    const actual = toNumber(summary[f.id]);
    if (actual === null) continue; // 空值/非法值已由基础校验覆盖

    if (Array.isArray(rule.sum_of) && rule.sum_of.length > 0) {
      const refs = rule.sum_of.filter((id) => summaryById.has(id));
      if (refs.length === 0) continue; // 引用字段全部失效则忽略规则
      const expected = refs.reduce((sum, id) => sum + (toNumber(summary[id]) ?? 0), 0);
      if (Math.abs(actual - expected) > SUM_TOLERANCE) {
        const labels = refs.map((id) => summaryById.get(id)!.field_label).join('+');
        issues.push({
          scope: 'cross',
          field_id: f.id,
          message: `「${f.field_label}」(${actual}) 应等于 ${labels} 之和 (${expected})`,
        });
      }
    } else if (typeof rule.detail_sum_of === 'number') {
      if (!numberColumnIds.has(rule.detail_sum_of)) continue; // 引用列失效则忽略
      const refField = fields.find((x) => x.id === rule.detail_sum_of)!;
      const expected = details.reduce((sum, row) => sum + (toNumber(row?.[rule.detail_sum_of!]) ?? 0), 0);
      if (Math.abs(actual - expected) > SUM_TOLERANCE) {
        issues.push({
          scope: 'cross',
          field_id: f.id,
          message: `「${f.field_label}」(${actual}) 应等于「${refField.field_label}」列合计 (${expected})`,
        });
      }
    }
  }

  return issues;
}
