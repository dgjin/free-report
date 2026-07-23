import { TemplateStatus } from '../types';

export function getTemplateLifecycleView(status: TemplateStatus) {
  if (status === 'archived') {
    return {
      isArchived: true,
      statusLabel: '已停用',
      actionLabel: '重新启用',
      canWrite: false,
      canTransition: true,
      readOnlyMessage: '该报表模板已停用，字段配置为只读；历史任务和数据仍可正常查看与处理。',
    };
  }

  if (status === 'draft') {
    return {
      isArchived: false,
      statusLabel: '草稿',
      actionLabel: null,
      canWrite: false,
      canTransition: false,
      readOnlyMessage: '草稿模板当前只读，尚未配置发布工作流。',
    };
  }

  return {
    isArchived: false,
    statusLabel: '使用中',
    actionLabel: '停用',
    canWrite: true,
    canTransition: true,
    readOnlyMessage: null,
  };
}
