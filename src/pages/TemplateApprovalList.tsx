import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Clock,
  Building2,
  User,
  Calendar,
  ChevronRight,
} from '../components/icons';
import { api } from '../services/api';
import { toast, confirmDialog } from '../utils/toast';
import { TemplateApproval } from '../types';

interface TemplateApprovalPanelProps {
  onCountChange?: (count: number) => void;
}

// 模板审批面板：嵌入审批中心使用（数智化转型办公室视角）
export const TemplateApprovalPanel: React.FC<TemplateApprovalPanelProps> = ({ onCountChange }) => {
  const [approvals, setApprovals] = useState<TemplateApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [commentMap, setCommentMap] = useState<Record<number, string>>({});
  const navigate = useNavigate();

  const fetchApprovals = async () => {
    try {
      const data = await api.getPendingTemplateApprovals();
      setApprovals(data);
      onCountChange?.(data.length);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleApprove = async (approval: TemplateApproval) => {
    if (!(await confirmDialog(`确认通过模板「${approval.template_name}」的审批？通过后模板将发布，可下发至各分公司。`))) return;
    setActionId(approval.id);
    try {
      const res = await api.approveTemplate(approval.template_id, commentMap[approval.id] || undefined);
      toast(res.message, 'success');
      await fetchApprovals();
    } catch (err: any) {
      toast(err.message || '审批失败', 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (approval: TemplateApproval) => {
    const comment = commentMap[approval.id];
    if (!comment?.trim()) {
      return toast('驳回时请填写审批意见', 'error');
    }
    if (!(await confirmDialog(`确认驳回模板「${approval.template_name}」？驳回后模板将退回草稿状态。`))) return;
    setActionId(approval.id);
    try {
      const res = await api.rejectTemplate(approval.template_id, comment);
      toast(res.message, 'success');
      await fetchApprovals();
    } catch (err: any) {
      toast(err.message || '驳回失败', 'error');
    } finally {
      setActionId(null);
    }
  };

  const formatTime = (ts: string) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div>
      {loading ? (
        <div className="py-16 text-center text-sm text-mute">加载审批数据中...</div>
      ) : approvals.length === 0 ? (
        <div className="bg-white rounded-[12px] py-16 text-center" style={{ boxShadow: 'var(--sh-card)' }}>
          <CheckCircle className="w-10 h-10 text-line mx-auto mb-3" />
          <div className="text-sm font-medium text-ink">暂无待审批模板</div>
          <p className="text-xs text-mute mt-1">所有模板均已处理完毕</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <div
              key={approval.id}
              className="bg-white rounded-[12px] overflow-hidden"
              style={{ boxShadow: 'var(--sh-card)' }}
            >
              <div className="px-6 py-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 bg-[#FBF3DB] text-[#956400] text-[11px] font-medium rounded-full flex items-center gap-1">
                        <Clock size={12} />
                        待审批
                      </span>
                      <span className="text-[11px] text-faint tabular-nums">审批单 #{approval.id}</span>
                    </div>

                    <h3 className="text-base font-semibold text-ink tracking-[-0.01em]">
                      {approval.template_name || `模板 #${approval.template_id}`}
                    </h3>

                    <div className="flex items-center gap-4 text-xs text-mute">
                      <div className="flex items-center gap-1.5">
                        <Building2 size={14} className="text-faint" />
                        <span>{approval.department_name || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User size={14} className="text-faint" />
                        <span>{approval.submitted_by_name || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-faint" />
                        <span className="tabular-nums">{formatTime(approval.created_at)}</span>
                      </div>
                    </div>

                    {/* Comment Input */}
                    <div className="pt-2">
                      <textarea
                        value={commentMap[approval.id] || ''}
                        onChange={(e) =>
                          setCommentMap((prev) => ({ ...prev, [approval.id]: e.target.value }))
                        }
                        placeholder="审批意见（驳回时必填）..."
                        rows={2}
                        className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-canvas text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-ink/20 resize-none"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => navigate(`/templates/${approval.template_id}`)}
                      className="h-9 px-4 bg-canvas hover:bg-line text-ink font-medium text-xs rounded-md transition-colors flex items-center gap-1.5"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>查看模板</span>
                      <ChevronRight size={12} />
                    </button>

                    <button
                      onClick={() => handleApprove(approval)}
                      disabled={actionId !== null}
                      className="h-9 px-4 bg-[#346538] hover:bg-[#2a552e] text-white font-medium text-xs rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>通过</span>
                    </button>

                    <button
                      onClick={() => handleReject(approval)}
                      disabled={actionId !== null}
                      className="h-9 px-4 bg-[#9F2F2D] hover:bg-[#7f2523] text-white font-medium text-xs rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>驳回</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
