import { SubmissionStatus } from '../types';

const views: Record<SubmissionStatus, { label: string; color: string; isReadOnly: boolean }> = {
  draft: { label: '草稿保存中', color: 'bg-slate-100 text-slate-700', isReadOnly: false },
  pending_review: { label: '已提交 · 待复核人审核', color: 'bg-amber-50 text-amber-700', isReadOnly: true },
  pending_approval: { label: '复核通过 · 待审批人终审', color: 'bg-blue-50 text-blue-700', isReadOnly: true },
  pending_receipt: { label: '已提交 · 待发起部门签收', color: 'bg-amber-50 text-amber-700', isReadOnly: true },
  received: { label: '发起部门已签收', color: 'bg-emerald-50 text-emerald-700', isReadOnly: true },
  returned: { label: '已退回 · 请修改后重新提交', color: 'bg-rose-50 text-rose-700', isReadOnly: false },
  approved: { label: '终审通过 · 报表归档', color: 'bg-emerald-50 text-emerald-700', isReadOnly: true },
  rejected: { label: '被驳回 · 需修正后重新提交', color: 'bg-rose-50 text-rose-700', isReadOnly: false },
};

export function getSubmissionWorkflowView(status: SubmissionStatus = 'draft') {
  return views[status];
}
