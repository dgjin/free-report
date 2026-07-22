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
} from 'lucide-react';
import { api, getStoredUser } from '../services/api';
import { PendingApprovalTask, ReportSubmissionDetail, UserInfo } from '../types';

export const ApprovalList: React.FC = () => {
  const [pendingTasks, setPendingTasks] = useState<PendingApprovalTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Review Modal State
  const [selectedTask, setSelectedTask] = useState<PendingApprovalTask | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<ReportSubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  const [comment, setComment] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);

  const [user, setUser] = useState<UserInfo | null>(getStoredUser());

  useEffect(() => {
    loadPendingTasks();
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
      alert(err.message || '获取填报详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!selectedTask) return;
    if (action === 'rejected' && !comment.trim()) {
      return alert('驳回时请在处理意见中填写具体驳回原因');
    }

    setProcessing(true);
    try {
      const res = await api.processApprovalAction(selectedTask.submission_id, action, comment);
      alert(res.message);
      setSelectedTask(null);
      setSubmissionDetail(null);
      loadPendingTasks();
    } catch (err: any) {
      alert(err.message || '审批处理失败');
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <CheckSquare className="w-5 h-5 text-amber-600" />
            <span>三级审批中心</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            作为分公司复核人或审批人，核查填报数据的完整性与准确性，进行终审或退回修正。
          </p>
        </div>

        <div className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold shrink-0">
          待您处理任务: {pendingTasks.length} 件
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">正在获取审批列表...</div>
      ) : pendingTasks.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <div className="text-sm font-bold text-slate-700">暂无待您审批的报表任务</div>
          <p className="text-xs text-slate-400 mt-1">所有的报表流转已被高效处理完成</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingTasks.map((task) => (
            <div
              key={task.approval_id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-200">
                    {levelLabels[task.approval_level]}
                  </span>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {task.period_label}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">{task.assignment_title}</h3>
                </div>

                <div className="flex items-center space-x-4 text-xs text-slate-500 flex-wrap gap-y-1">
                  <div className="flex items-center space-x-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>填报公司: {task.company_name}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                    <span>提交经办人: {task.submitted_by_name}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>提交时间: {task.submitted_at}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-700">v{task.version}</span>
                </div>
              </div>

              <button
                onClick={() => openReviewModal(task)}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center space-x-1.5 shrink-0"
              >
                <Eye className="w-4 h-4" />
                <span>核查单据并评审</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Review & Approve Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <CheckSquare className="w-4 h-4 text-amber-600" />
                  <span>报表数据合规审核 ({levelLabels[selectedTask.approval_level]})</span>
                </h2>
                <div className="text-xs text-slate-500 mt-0.5">
                  任务: {selectedTask.assignment_title} (v{selectedTask.version})
                </div>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {detailLoading || !submissionDetail ? (
              <div className="py-12 text-center text-xs text-slate-400">正在加载数据明细...</div>
            ) : (
              <div className="space-y-5">
                {/* 1. Summary Items */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                    一、汇总指标核对
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {submissionDetail.summary.map((s) => (
                      <div key={s.field_id} className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="text-[11px] text-slate-400 font-medium">{s.field_label}</div>
                        <div className="text-xs font-bold text-slate-900 mt-0.5">
                          {s.value || '(未填写)'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Detail Items */}
                {submissionDetail.details && submissionDetail.details.length > 0 && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                      二、填报明细清单 (共 {submissionDetail.details.length} 行)
                    </div>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                            <th className="p-2 w-10 text-center">#</th>
                            {submissionDetail.details[0].map((item) => (
                              <th key={item.field_id} className="p-2">
                                {item.field_label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {submissionDetail.details.map((rowItems, idx) => (
                            <tr key={idx}>
                              <td className="p-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                              {rowItems.map((item) => (
                                <td key={item.field_id} className="p-2 text-slate-800 font-medium">
                                  {item.value || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Action Form */}
                <div className="space-y-3 pt-2">
                  <label className="block text-xs font-bold text-slate-700">
                    处理意见 (驳回时请必须填写具体原因)
                  </label>
                  <textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="如: 数据核实无误，同意提交上报 / 数据异常需重新核算..."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:bg-white"
                  />

                  <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => handleAction('rejected')}
                      className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span>驳回 (退回草稿)</span>
                    </button>

                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => handleAction('approved')}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center space-x-1.5 disabled:opacity-50"
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
    </div>
  );
};
