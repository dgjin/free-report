import { SubmissionStatus } from '../types';

const views: Record<SubmissionStatus, { label: string; color: string; isReadOnly: boolean }> = {
  draft: { label: '草稿保存中', color: 'bg-canvas text-mute', isReadOnly: false },
  pending_review: { label: '已提交 · 待复核人审核', color: 'bg-[#E1F3FE] text-[#1F6C9F]', isReadOnly: true },
  pending_approval: { label: '复核通过 · 待审批人终审', color: 'bg-[#E1F3FE] text-[#1F6C9F]', isReadOnly: true },
  pending_receipt: { label: '已提交 · 待发起部门签收', color: 'bg-[#FBF3DB] text-[#956400]', isReadOnly: true },
  received: { label: '发起部门已签收', color: 'bg-[#EDF3EC] text-[#346538]', isReadOnly: true },
  returned: { label: '已退回 · 请修改后重新提交', color: 'bg-[#FDEBEC] text-[#9F2F2D]', isReadOnly: false },
  rejected: { label: '被驳回 · 需修正后重新提交', color: 'bg-[#FDEBEC] text-[#9F2F2D]', isReadOnly: false },
};

export function getSubmissionWorkflowView(status: SubmissionStatus = 'draft') {
  return views[status];
}
