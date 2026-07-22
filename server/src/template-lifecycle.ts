import type { ReportTemplate } from './types';
import { DomainError } from './errors';

type TemplateStatus = ReportTemplate['status'];

export function setTemplateEnabledStatus(status: TemplateStatus, enabled: boolean): TemplateStatus {
  if (status === 'draft') throw new DomainError('草稿模板不支持启用或停用操作', 409);
  return enabled ? 'published' : 'archived';
}

export function assertTemplateWritable(status: TemplateStatus): void {
  if (status === 'draft') throw new DomainError('草稿模板尚未发布，不能编辑或下发', 409);
  if (status === 'archived') throw new DomainError('报表模板已停用，不能编辑或下发', 409);
}
