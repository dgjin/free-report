import type { DataType, ReportTemplateField } from '../types';

export const DEFAULT_FIELD_DATA_TYPE: DataType = 'detail';

export function getInitialTemplateFields(): Partial<ReportTemplateField>[] {
  return [];
}
