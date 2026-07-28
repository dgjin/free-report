import type { DataType, DataImportRowPayload } from '../types';

/**
 * 数据初始化导入的 Excel 列映射与行组装（纯函数，供导入弹窗与单元测试共用）。
 * Excel 约定：首列为「分公司编码」，其余列对应模板汇总/明细字段标签；
 * 同一家分公司有多条明细时连续多行填写，汇总列仅在首行填写。
 */

export interface ImportFieldRef {
  id: number;
  field_label: string;
  data_type: DataType;
}

/** 列映射目标：'company' = 分公司编码列；'ignore' = 忽略该列；数字 = 映射到模板字段 ID */
export type ColumnTarget = 'company' | 'ignore' | number;

const COMPANY_HEADER_NAMES = ['分公司编码', '机构编码', '公司编码'];

/**
 * 根据表头自动匹配模板字段：首列默认公司编码列；其余列按字段标签精确匹配，
 * 同一字段最多被一列占用；无法匹配的列默认忽略。
 */
export function autoMapColumns(headers: string[], fields: ImportFieldRef[]): ColumnTarget[] {
  const usedFieldIds = new Set<number>();
  return headers.map((h, idx) => {
    const label = String(h ?? '').trim();
    if (idx === 0 || COMPANY_HEADER_NAMES.includes(label)) {
      return 'company';
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
 * - 整行空白跳过；公司编码缺失（且无依循行）记录为行级错误
 */
export function buildImportRows(
  dataRows: string[][],
  mappings: ColumnTarget[],
  fieldsById: Map<number, ImportFieldRef>,
): { rows: DataImportRowPayload[]; errors: string[] } {
  const rows: DataImportRowPayload[] = [];
  const errors: string[] = [];
  const companyIdx = mappings.findIndex((m) => m === 'company');
  let current: DataImportRowPayload | null = null;

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

    const detail: Record<string, string> = {};
    mappings.forEach((m, ci) => {
      if (m === 'company' || m === 'ignore') return;
      const field = fieldsById.get(m);
      if (!field) return;
      const value = String(cells[ci] ?? '').trim();
      if (!value) return;
      if (field.data_type === 'summary') {
        const key = String(m);
        if (!(key in current!.summary)) {
          current!.summary[key] = value;
        }
      } else {
        detail[String(m)] = value;
      }
    });
    if (Object.keys(detail).length > 0) {
      current.details.push(detail);
    }
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push('未解析到有效数据行');
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
