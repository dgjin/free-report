import React from 'react';
import { UserCheck } from '../icons';
import { ApprovalRecord } from '../../types';

interface ApprovalTimelineProps {
  approvals: ApprovalRecord[];
}

/** 审批流程时间线（经办提交 → 复核审核 → 审批终审） */
export const ApprovalTimeline: React.FC<ApprovalTimelineProps> = ({ approvals }) => {
  if (!approvals || approvals.length === 0) return null;

  // 审批状态徽标样式（done=green / progress=blue / warn=red）
  const getApprovalBadgeClass = (status?: string) => {
    if (status === 'approved') return 'bg-[#EDF3EC] text-[#346538]';
    if (status === 'rejected') return 'bg-[#FDEBEC] text-[#9F2F2D]';
    return 'bg-[#E1F3FE] text-[#1F6C9F]';
  };

  return (
    <div
      className="bg-white rounded-[12px] p-6 sm:p-7"
      style={{ boxShadow: 'var(--sh-panel)' }}
    >
      <div
        className="flex items-center justify-between pb-4"
        style={{ borderBottom: '1px solid var(--hairline)' }}
      >
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 bg-canvas text-ink rounded-[10px]">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink tracking-[-0.01em]">三级审批流程监控 (Approval History)</h2>
            <p className="text-[11px] text-mute mt-0.5">经办提交 → 复核审核 → 审批终审</p>
          </div>
        </div>
      </div>

      <div>
        {approvals.map((app, idx) => {
          const levelNames: Record<string, string> = {
            handler: '1. 经办人提交',
            reviewer: '2. 复核人审核',
            approver: '3. 审批人终审',
          };

          const isAppApproved = app.status === 'approved';
          const isAppRejected = app.status === 'rejected';

          return (
            <div
              key={app.id || idx}
              className="apple-row px-1 py-4 flex items-start justify-between gap-3"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-ink tracking-[-0.01em]">
                    {levelNames[app.approval_level]}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${getApprovalBadgeClass(app.status)}`}
                  >
                    {isAppApproved ? '通过' : isAppRejected ? '驳回' : '等候中'}
                  </span>
                </div>

                <div className="text-xs text-mute">
                  处理人: <span className="font-semibold text-ink">{app.approver_name}</span>
                </div>

                {app.comment && (
                  <div
                    className="text-xs text-body bg-canvas px-3 py-2 rounded-[10px]"
                    style={{ border: '1px solid var(--hairline)' }}
                  >
                    "{app.comment}"
                  </div>
                )}

                <div className="text-[10px] text-faint tabular-nums">{app.updated_at || app.created_at}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
