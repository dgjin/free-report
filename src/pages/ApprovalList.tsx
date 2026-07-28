import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Clock,
  Building2,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  MessageSquare,
  UserCheck,
} from '../components/icons';
import { api, getStoredUser } from '../services/api';
import { PendingApprovalTask, ReportSubmissionDetail, UserInfo } from '../types';
import { SubmissionDetailTables } from '../components/SubmissionDetailTables';
import { TemplateApprovalPanel } from './TemplateApprovalList';

export const ApprovalList: React.FC = () => {
  const [pendingTasks, setPendingTasks] = useState<PendingApprovalTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [templateCount, setTemplateCount] = useState<number>(0);

  // Review Modal State
  const [selectedTask, setSelectedTask] = useState<PendingApprovalTask | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<ReportSubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  const [comment, setComment] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);

  const [user, setUser] = useState<UserInfo | null>(getStoredUser());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isDigitalAdmin = user?.role === 'digital_admin';
  const [activeTab, setActiveTab] = useState<'submissions' | 'templates'>(
    getStoredUser()?.role === 'digital_admin' ? 'templates' : 'submissions'
  );

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!isDigitalAdmin) {
      loadPendingTasks();
    } else {
      setLoading(false);
    }
  }, []);

  const loadPendingTasks = async () => {
    setLoading(true);
    try {
      const list = await api.getPendingApprovals();
      setPendingTasks(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const openReviewModal = async (task: PendingApprovalTask) => {
    setSelectedTask(task);
    setComment('');
    setDetailLoading(true);

    try {
      const detail = await api.getSubmissionDetail(task.submission_id);
      setSubmissionDetail(detail);
    } catch (err: any) {
      showToast(err.message || '获取填报详情失败', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!selectedTask) return;
    if (action === 'rejected' && !comment.trim()) {
      return showToast('驳回时请在处理意见中填写具体驳回原因', 'error');
    }

    setProcessing(true);
    try {
      const res = await api.processApprovalAction(selectedTask.submission_id, action, comment);
      showToast(res.message || '审批处理完成');
      setSelectedTask(null);
      setSubmissionDetail(null);
      loadPendingTasks();
    } catch (err: any) {
      showToast(err.message || '审批处理失败', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const levelLabels: Record<string, string> = {
    handler: '经办人环节',
    reviewer: '复核人环节 (Reviewer)',
    approver: '审批人环节 (Approver)',
  };

  return (
    <div className="reveal max-w-[1080px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="t-serif text-[32px] text-ink">
            审批中心
          </h1>
          <p className="text-sm text-mute mt-1.5 tracking-[-0.01em] max-w-xl">
            {isDigitalAdmin
              ? '审核各部门提交的报表模板，审批通过后模板发布并可下发至各分公司。'
              : '作为分公司复核人或审批人，核查填报数据的完整性与准确性，进行终审或退回修正。'}
          </p>
        </div>

        <div className="px-3.5 py-1.5 bg-[rgba(17,17,17,0.08)] text-ink rounded-full text-xs font-medium shrink-0 tabular-nums">
          待您处理任务: {activeTab === 'templates' ? templateCount : pendingTasks.length} 件
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-canvas rounded-full w-fit" style={{ border: '1px solid var(--hairline)' }}>
        {!isDigitalAdmin && (
          <button
            onClick={() => setActiveTab('submissions')}
            className={`h-8 px-4 rounded-full text-[13px] font-medium transition-colors ${
              activeTab === 'submissions' ? 'bg-ink text-white' : 'text-mute hover:text-ink'
            }`}
          >
            填报审批
          </button>
        )}
        {isDigitalAdmin && (
          <button
            onClick={() => setActiveTab('templates')}
            className={`h-8 px-4 rounded-full text-[13px] font-medium transition-colors ${
              activeTab === 'templates' ? 'bg-ink text-white' : 'text-mute hover:text-ink'
            }`}
          >
            模板审批
          </button>
        )}
      </div>

      {/* Template Approval Tab */}
      {activeTab === 'templates' && isDigitalAdmin && (
        <TemplateApprovalPanel onCountChange={setTemplateCount} />
      )}

      {/* Task List — unified panel with hairline dividers */}
      {activeTab === 'submissions' && (loading ? (
        <div className="py-16 text-center text-sm text-mute">正在获取审批列表...</div>
      ) : pendingTasks.length === 0 ? (
        <div className="bg-white rounded-[12px] py-16 text-center" style={{ boxShadow: 'var(--sh-card)' }}>
          <CheckCircle2 className="w-10 h-10 text-line mx-auto mb-3" />
          <div className="text-sm font-medium text-ink">暂无待您审批的报表任务</div>
          <p className="text-xs text-mute mt-1">所有的报表流转已被高效处理完成</p>
        </div>
      ) : (
        <div className="bg-white rounded-[12px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
          {pendingTasks.map((task) => (
            <div
              key={task.approval_id}
              className="apple-row px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 bg-canvas text-body text-[11px] font-medium rounded-full">
                    {levelLabels[task.approval_level]}
                  </span>
                  <span className="px-2.5 py-1 bg-canvas text-mute text-[11px] font-medium rounded-full">
                    {task.period_label}
                  </span>
                  <h3 className="text-base font-semibold text-ink tracking-[-0.01em]">{task.assignment_title}</h3>
                </div>

                <div className="flex items-center gap-4 text-xs text-mute flex-wrap gap-y-1">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-faint" />
                    <span>填报公司: {task.company_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-faint" />
                    <span>提交经办人: {task.submitted_by_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-faint" />
                    <span>提交时间: {task.submitted_at}</span>
                  </div>
                  <span className="font-medium text-mute tabular-nums">v{task.version}</span>
                </div>
              </div>

              <button
                onClick={() => openReviewModal(task)}
                className="h-10 px-5 bg-ink hover:bg-inkhover text-white font-medium text-sm rounded-md transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                <Eye className="w-4 h-4" />
                <span>核查单据并评审</span>
              </button>
            </div>
          ))}
        </div>
      ))}

      {/* Review & Approve Modal */}
      {selectedTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.3)' }}
        >
          <div
            className="bg-white rounded-[12px] max-w-3xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: 'var(--sh-overlay)' }}
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-semibold text-ink tracking-[-0.01em] flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-ink" />
                  <span>报表数据合规审核 ({levelLabels[selectedTask.approval_level]})</span>
                </h2>
                <div className="text-xs text-mute mt-0.5">
                  任务: {selectedTask.assignment_title} (v{selectedTask.version})
                </div>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-mute hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {detailLoading || !submissionDetail ? (
              <div className="py-12 text-center text-sm text-mute">正在加载数据明细...</div>
            ) : (
              <div className="space-y-5">
                {/* 1. Summary Items */}
                <div className="p-4 bg-canvas rounded-[12px] space-y-3">
                  <div className="text-xs font-semibold text-ink tracking-[-0.01em] pb-2 border-b border-line">
                    一、汇总指标核对
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {submissionDetail.summary.map((s) => (
                      <div key={s.field_id} className="bg-white p-3 rounded-[12px] border border-[rgba(0,0,0,0.06)]">
                        <div className="text-[11px] text-mute font-medium">{s.field_label}</div>
                        <div className="text-sm font-semibold text-ink mt-0.5 tabular-nums">
                          {s.value || '(未填写)'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Detail Items + Matrix Cross-Tabs */}
                {submissionDetail.details && submissionDetail.details.length > 0 && (
                  <div className="p-4 bg-canvas rounded-[12px] space-y-3">
                    <div className="text-xs font-semibold text-ink tracking-[-0.01em] pb-2 border-b border-line">
                      二、填报明细清单 (共 {submissionDetail.details.length} 行)
                    </div>
                    <SubmissionDetailTables detail={submissionDetail} />
                  </div>
                )}

                {/* Action Form */}
                <div className="space-y-3 pt-1">
                  <label className="block text-xs font-medium text-body">
                    处理意见 (驳回时请必须填写具体原因)
                  </label>
                  <textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="如: 数据核实无误，同意提交上报 / 数据异常需重新核算..."
                    className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink placeholder:text-faint focus:outline-none focus:border-ink focus:ring-1 focus:ring-[rgba(17,17,17,0.2)]"
                  />

                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => handleAction('rejected')}
                      className="h-10 px-5 bg-[#FDEBEC] hover:bg-[#FDEBEC] text-[#9F2F2D] font-medium text-sm rounded-full transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>驳回 (退回草稿)</span>
                    </button>

                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => handleAction('approved')}
                      className="h-10 px-5 bg-ink hover:bg-inkhover text-white font-medium text-sm rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>审核通过 (进入下一步)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed top-6 right-6 z-[60] px-5 py-3 rounded-full text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200 text-white ${
            toast.type === 'error' ? 'bg-[#9F2F2D]' : 'bg-ink'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};
