import { TemplateStatus } from '../types';

export function getTemplateLifecycleView(status: TemplateStatus) {
  if (status === 'archived') {
    return {
      isArchived: true,
      statusLabel: '已停用',
      actionLabel: '重新启用',
      canWrite: false,
    };
  }

  return {
    isArchived: false,
    statusLabel: '使用中',
    actionLabel: '停用',
    canWrite: true,
  };
}
