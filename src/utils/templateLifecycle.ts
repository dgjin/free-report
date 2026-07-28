import { TemplateStatus } from '../types';

export function getTemplateLifecycleView(status: TemplateStatus) {
  if (status === 'archived') {
    return {
      isArchived: true,
      statusLabel: '已停用',
      actionLabel: '重新启用',
      canWrite: false,
      canTransition: true,
      canAssign: false,
      canSubmitApproval: false,
      readOnlyMessage: '该报表模板已停用，字段配置为只读；历史任务和数据仍可正常查看与处理。',
    };
  }

  if (status === 'draft') {
    return {
      isArchived: false,
      statusLabel: '草稿',
      actionLabel: null,
      canWrite: true,
      canTransition: false,
      canAssign: false,
      canSubmitApproval: true,
      readOnlyMessage: null,
    };
  }

  if (status === 'pending_approval') {
    return {
      isArchived: false,
      statusLabel: '待审批',
      actionLabel: null,
      canWrite: false,
      canTransition: false,
      canAssign: false,
      canSubmitApproval: false,
      readOnlyMessage: '模板已提交数智化转型办公室审批，审批通过后可下发。',
    };
  }

  return {
    isArchived: false,
    statusLabel: '使用中',
    actionLabel: '停用',
    canWrite: true,
    canTransition: true,
    canAssign: true,
    canSubmitApproval: false,
    readOnlyMessage: null,
  };
}
