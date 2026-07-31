import type { DataType, DataImportRowPayload, FieldConfig, FieldType } from '../types';
import { validateFieldValue, SUM_TOLERANCE } from './dataValidation';

/**
 * 数据初始化导入的 Excel 列映射与行组装（纯函数，供导入弹窗与单元测试共用）。
 * Excel 约定：首列为「分公司编码」，其余列对应模板汇总/明细字段标签；
 * 同一家分公司有多条明细时连续多行填写，汇总列仅在首行填写。
 * 交叉表模板：需将一列映射为「行维度列」（值为行选项文本），交叉表列值按行选项
 * 定位到固定行（details[行选项序号]，与填报页 row_index 语义一致）。
 */

export interface ImportFieldRef {
  id: number;
  field_label: string;
  data_type: DataType;
  /** 可选：提供后启用值校验（number/date/select/min/max） */
  field_type?: FieldType;
  config?: FieldConfig;
}

/** 交叉表组引用：行维度标签、行选项及该组的列字段 id */
export interface ImportMatrixGroupRef {
  rowLabel: string;
  rowOptions: string[];
  fieldIds: number[];
}

/**
 * 列映射目标：'company' = 分公司编码列；'ignore' = 忽略该列；
 * 'matrix_row_N' = 第 N 组交叉表的行维度列；数字 = 映射到模板字段 ID
 */
export type ColumnTarget = 'company' | 'ignore' | number | `matrix_row_${number}`;

/** 解析行维度列映射：'matrix_row_0' → 0；非行维度列返回 null */
export function parseMatrixRowTarget(target: ColumnTarget): number | null {
  if (typeof target === 'string' && target.startsWith('matrix_row_')) {
    const idx = Number(target.slice('matrix_row_'.length));
    return Number.isInteger(idx) && idx >= 0 ? idx : null;
  }
  return null;
}

const COMPANY_HEADER_NAMES = ['分公司编码', '机构编码', '公司编码'];

/**
 * 根据表头自动匹配模板字段：首列默认公司编码列；表头等于交叉表行维度标签的列
 * 映射为行维度列；其余列按字段标签精确匹配，同一字段最多被一列占用；无法匹配的列默认忽略。
 */
export function autoMapColumns(
  headers: string[],
  fields: ImportFieldRef[],
  matrixGroups: ImportMatrixGroupRef[] = [],
): ColumnTarget[] {
  const usedFieldIds = new Set<number>();
  const usedGroups = new Set<number>();
  return headers.map((h, idx) => {
    const label = String(h ?? '').trim();
    if (idx === 0 || COMPANY_HEADER_NAMES.includes(label)) {
      return 'company';
    }
    const gi = matrixGroups.findIndex((g, i) => g.rowLabel.trim() === label && !usedGroups.has(i));
    if (gi >= 0) {
      usedGroups.add(gi);
      return `matrix_row_${gi}` as ColumnTarget;
    }
    const hit = fields.find((f) => f.field_label.trim() === label && !usedFieldIds.has(f.id));
    if (hit) {
      usedFieldIds.add(hit.id);
      return hit.id;
    }
    return 'ignore';
  });
}

/**
 * 按列映射将 Excel 数据行组装为导入行：
 * - 公司编码列留空表示沿用上一行的公司（支持多明细行连续填写）
 * - 每个公司首行开启一条导入行；汇总字段取该公司第一个非空值
 * - 明细字段：任一明细单元格非空即为当前公司追加一条明细行
 * - 交叉表字段：按行维度列的值定位到 details[行选项序号]（固定行，不追加）；
 *   行选项无效、缺失或同公司重复时记行级错误
 * - 整行空白跳过；公司编码缺失（且无依循行）记录为行级错误
 * - 单元格写入前做值校验（number/date/select/min/max，需 fieldRefs 提供 field_type）；
 *   strict 模式（archive 归档）组装完成后再按公司行检查必填与跨字段规则
 */
export function buildImportRows(
  dataRows: string[][],
  mappings: ColumnTarget[],
  fieldsById: Map<number, ImportFieldRef>,
  matrixGroups: ImportMatrixGroupRef[] = [],
  options: { strict?: boolean } = {},
): { rows: DataImportRowPayload[]; errors: string[] } {
  const rows: DataImportRowPayload[] = [];
  const errors: string[] = [];
  const companyIdx = mappings.findIndex((m) => m === 'company');
  let current: DataImportRowPayload | null = null;

  /** 单元格值校验：未提供 field_type 的引用跳过（向后兼容） */
  const checkValue = (field: ImportFieldRef, value: string, excelRowNo: number) => {
    if (!field.field_type) return;
    const err = validateFieldValue(
      { field_type: field.field_type, field_label: field.field_label },
      value,
      field.config || {},
    );
    if (err) errors.push(`第 ${excelRowNo} 行：${err}`);
  };

  // 交叉表定位索引：fieldId → 组号；每组行选项文本 → 行下标
  const fieldGroupIdx = new Map<number, number>();
  matrixGroups.forEach((g, gi) => g.fieldIds.forEach((id) => fieldGroupIdx.set(id, gi)));
  const optionIdxByGroup = matrixGroups.map(
    (g) => new Map(g.rowOptions.map((opt, i) => [opt.trim(), i])),
  );
  // 已占用的行选项（防止同公司同组重复行静默覆盖）：`公司序号#组号#行下标`
  const usedMatrixRows = new Set<string>();

  /** 确保当前导入行的 details 至少有 n 行（交叉表固定行占位） */
  const ensureDetailRows = (row: DataImportRowPayload, n: number) => {
    while (row.details.length < n) row.details.push({});
  };

  dataRows.forEach((cells, i) => {
    const excelRowNo = i + 2; // 表头占第 1 行
    if (!cells || cells.every((c) => String(c ?? '').trim() === '')) {
      return;
    }

    const code = companyIdx >= 0 ? String(cells[companyIdx] ?? '').trim() : '';
    if (code) {
      current = { company_code: code, summary: {}, details: [] };
      rows.push(current);
    }
    if (!current) {
      errors.push(`第 ${excelRowNo} 行：缺少分公司编码`);
      return;
    }

    // 解析本行的行维度值：组号 → 行下标
    const matrixRowPos = new Map<number, number>();
    let matrixRowInvalid = false;
    mappings.forEach((m, ci) => {
      const gi = parseMatrixRowTarget(m);
      if (gi === null || gi >= matrixGroups.length) return;
      const optText = String(cells[ci] ?? '').trim();
      if (!optText) return;
      const pos = optionIdxByGroup[gi].get(optText);
      if (pos === undefined) {
        errors.push(`第 ${excelRowNo} 行：行维度值「${optText}」不在「${matrixGroups[gi].rowLabel}」的行选项中`);
        matrixRowInvalid = true;
        return;
      }
      const key = `${rows.length - 1}#${gi}#${pos}`;
      if (usedMatrixRows.has(key)) {
        errors.push(`第 ${excelRowNo} 行：行维度值「${optText}」在该公司中重复出现`);
        matrixRowInvalid = true;
        return;
      }
      usedMatrixRows.add(key);
      matrixRowPos.set(gi, pos);
    });

    const detail: Record<string, string> = {};
    let matrixMissingRow = false;
    mappings.forEach((m, ci) => {
      if (typeof m !== 'number') return;
      const field = fieldsById.get(m);
      if (!field) return;
      const value = String(cells[ci] ?? '').trim();
      if (!value) return;
      checkValue(field, value, excelRowNo);
      if (field.data_type === 'summary') {
        const key = String(m);
        if (!(key in current!.summary)) {
          current!.summary[key] = value;
        }
      } else if (field.data_type === 'matrix') {
        const gi = fieldGroupIdx.get(m);
        const pos = gi !== undefined ? matrixRowPos.get(gi) : undefined;
        if (gi === undefined || pos === undefined) {
          if (!matrixRowInvalid && !matrixMissingRow) {
            errors.push(`第 ${excelRowNo} 行：交叉表列「${field.field_label}」缺少行维度值，无法定位到行`);
            matrixMissingRow = true;
          }
          return;
        }
        ensureDetailRows(current!, pos + 1);
        current!.details[pos][String(m)] = value;
      } else {
        detail[String(m)] = value;
      }
    });
    if (Object.keys(detail).length > 0) {
      // 本行同时定位到交叉表行时，明细值写入同一固定行（与填报页同行共存语义一致）
      const anchor = matrixRowPos.size > 0 ? Math.min(...matrixRowPos.values()) : null;
      if (anchor !== null) {
        ensureDetailRows(current, anchor + 1);
        Object.assign(current.details[anchor], detail);
      } else {
        current.details.push(detail);
      }
    }
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push('未解析到有效数据行');
  }

  // strict 模式（archive 归档）：按提交标准对每个公司行检查必填与跨字段规则
  if (options.strict) {
    const refs = [...fieldsById.values()];
    const summaryRefs = refs.filter((f) => f.data_type === 'summary');
    const detailRefs = refs.filter((f) => f.data_type === 'detail');
    const numberColumnIds = new Set(
      refs
        .filter((f) => (f.data_type === 'detail' || f.data_type === 'matrix') && f.field_type === 'number')
        .map((f) => f.id),
    );
    const toNum = (value: string | undefined): number | null => {
      const text = String(value ?? '').trim();
      if (!text) return null;
      const num = Number(text);
      return Number.isFinite(num) ? num : null;
    };

    for (const row of rows) {
      // 必填：汇总字段
      for (const f of summaryRefs) {
        if (f.config?.required && !String(row.summary[String(f.id)] ?? '').trim()) {
          errors.push(`公司 ${row.company_code}：「${f.field_label}」为必填项`);
        }
      }
      // 必填：非空明细行（交叉表固定行仅含 matrix 值时不按明细行检查）
      row.details.forEach((d, di) => {
        const hasDetailValue = detailRefs.some((f) => String(d[String(f.id)] ?? '').trim() !== '');
        if (!hasDetailValue) return;
        for (const f of detailRefs) {
          if (f.config?.required && !String(d[String(f.id)] ?? '').trim()) {
            errors.push(`公司 ${row.company_code}：明细第 ${di + 1} 行「${f.field_label}」为必填项`);
          }
        }
      });
      // 跨字段规则（汇总 number 字段；引用失效字段的规则忽略）
      for (const f of summaryRefs) {
        if (f.field_type !== 'number') continue;
        const rule = f.config?.validation;
        if (!rule) continue;
        const actual = toNum(row.summary[String(f.id)]);
        if (actual === null) continue;
        if (Array.isArray(rule.sum_of) && rule.sum_of.length > 0) {
          const validRefs = rule.sum_of.filter((id) => fieldsById.get(id)?.data_type === 'summary');
          if (validRefs.length === 0) continue;
          const expected = validRefs.reduce((sum, id) => sum + (toNum(row.summary[String(id)]) ?? 0), 0);
          if (Math.abs(actual - expected) > SUM_TOLERANCE) {
            const labels = validRefs.map((id) => fieldsById.get(id)!.field_label).join('+');
            errors.push(
              `公司 ${row.company_code}：「${f.field_label}」(${actual}) 应等于 ${labels} 之和 (${expected})`,
            );
          }
        } else if (typeof rule.detail_sum_of === 'number' && numberColumnIds.has(rule.detail_sum_of)) {
          const refField = fieldsById.get(rule.detail_sum_of)!;
          const expected = row.details.reduce(
            (sum, d) => sum + (toNum(d[String(rule.detail_sum_of!)]) ?? 0),
            0,
          );
          if (Math.abs(actual - expected) > SUM_TOLERANCE) {
            errors.push(
              `公司 ${row.company_code}：「${f.field_label}」(${actual}) 应等于「${refField.field_label}」列合计 (${expected})`,
            );
          }
        }
      }
    }
  }

  return { rows, errors };
}

/** 提交前校验：必须映射了公司编码列且至少映射一个数据字段列 */
export function validateMappings(mappings: ColumnTarget[]): string | null {
  if (!mappings.includes('company')) {
    return '请将其中一列映射为「分公司编码」';
  }
  if (!mappings.some((m) => typeof m === 'number')) {
    return '请至少将一列映射到模板字段';
  }
  return null;
}
