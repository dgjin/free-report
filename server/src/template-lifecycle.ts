import type { ReportTemplate } from './types';
import { DomainError } from './db';

type TemplateStatus = ReportTemplate['status'];

export function setTemplateEnabledStatus(status: TemplateStatus, enabled: boolean): TemplateStatus {
  return enabled ? 'published' : 'archived';
}

export function assertTemplateWritable(status: TemplateStatus): void {
  if (status !== 'published') throw new DomainError('报表模板已停用，不能编辑或下发', 409);
}
