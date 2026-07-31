import type { AggregationResponse, ReportTemplateField } from '../types';

export type AggregationTab = 'institutions' | 'details' | 'matrix' | 'progress';

export interface MatrixGroup {
  rowLabel: string;
  rowOptions: string[];
  columns: ReportTemplateField[];
}

/**
 * 交叉表分组：取自 matrix_fields（data_type='matrix'），按 field_config.matrix.row_label 归组。
 * 容错：field_config 非法 JSON 或缺少行维度定义（row_label）的字段被跳过，不影响其余列。
 */
export function buildMatrixGroups(matrixFields: ReportTemplateField[] | undefined): MatrixGroup[] {
  const groups: MatrixGroup[] = [];
  const groupMap = new Map<string, number>();

  (matrixFields || []).forEach((field) => {
    let config: any = {};
    try {
      config = typeof field.field_config === 'string'
        ? JSON.parse(field.field_config || '{}')
        : field.field_config || {};
    } catch {
      return;
    }
    const matrix = config.matrix;
    if (!matrix || !matrix.row_label) return;

    const key = matrix.row_label;
    if (!groupMap.has(key)) {
      groupMap.set(key, groups.length);
      groups.push({ rowLabel: key, rowOptions: matrix.row_options || [], columns: [] });
    }
    groups[groupMap.get(key)!].columns.push(field);
  });

  return groups;
}

/**
 * 交叉表取值索引：按 company_id + 库内真实 row_index 定位单元格所在行。
 * 使用 company_id（而非机构名）作键，保证同名机构不会互相串数据。
 */
export function buildMatrixRowIndex(
  detailRows: Array<Record<string, any>> | undefined,
): Map<string, Record<string, any>> {
  const idx = new Map<string, Record<string, any>>();
  (detailRows || []).forEach((r) => {
    idx.set(`${r.company_id}#${r.row_index}`, r);
  });
  return idx;
}

export interface MetricCard {
  fieldName: string;
  fieldLabel: string;
  total: number;
  average: number;
  count: number;
}

/** Filter institution rows by search query (matches name and code). */
export function filterInstitutionRows(
  companyData: AggregationResponse['company_data'],
  query: string,
): AggregationResponse['company_data'] {
  if (!query.trim()) return companyData;
  const q = query.trim().toLowerCase();
  return companyData.filter(
    (c) =>
      c.company_name?.toLowerCase().includes(q) ||
      c.company_code?.toLowerCase().includes(q),
  );
}

/** Filter detail rows by search query. */
export function filterDetailRows(
  detailRows: Record<string, any>[],
  query: string,
): Record<string, any>[] {
  if (!query.trim()) return detailRows;
  const q = query.trim().toLowerCase();
  return detailRows.filter((r) =>
    Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
  );
}

/** Count institutions that have not submitted yet. */
export function getUncountedInstitutionCount(companyData: AggregationResponse['company_data']): number {
  return companyData.filter((c) => !c.has_submitted).length;
}

/** Build metric cards from summary fields and aggregation data. */
export function buildMetricCards(
  summaryFields: ReportTemplateField[],
  summary: AggregationResponse['summary'],
): MetricCard[] {
  return summaryFields.map((f) => {
    const s = summary[f.field_name];
    return {
      fieldName: f.field_name,
      fieldLabel: f.field_label,
      total: s?.total ?? 0,
      average: s?.average ?? 0,
      count: s?.count ?? 0,
    };
  });
}

/** Get progress data grouped by institution from company_data. */
export function buildProgressData(companyData: AggregationResponse['company_data']): Array<{
  companyId: number;
  companyName: string;
  submissionStatus: string;
  version: number;
  assignmentStatus: string;
}> {
  return companyData.map((c) => ({
    companyId: c.company_id,
    companyName: c.company_name,
    submissionStatus: c.submission_status,
    version: c.submission_version,
    assignmentStatus: c.assignment_status,
  }));
}
