import type { AggregationResponse, ReportTemplateField } from '../types';

export type AggregationTab = 'institutions' | 'details' | 'matrix' | 'progress';

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
