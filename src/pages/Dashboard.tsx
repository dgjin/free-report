import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import {
  FileSpreadsheet,
  Send,
  CheckSquare,
  BarChart3,
  Plus,
  Clock,
  ArrowRight,
  Building2,
  AlertCircle,
  TrendingUp,
  FileCheck2,
  Inbox,
  XCircle,
  Eye,
  X,
  UserCheck,
} from '../components/icons';
import { api, getStoredUser, swrKeys, swrFetcher, useRejectedReminders } from '../services/api';
import { UserInfo, ReportTemplate, ReportAssignment, PendingApprovalTask, Company, PendingReceipt, ReportSubmissionDetail, RejectedReminder, TemplateApproval } from '../types';
import { getClientAccess } from '../utils/access';
import { SubmissionDetailTables } from '../components/SubmissionDetailTables';
import { ApprovalTimeline } from '../components/report/ApprovalTimeline';

export const Dashboard: React.FC = () => {
  const [user, setUser] = useState<UserInfo | null>(getStoredUser());
  const navigate = useNavigate();
  const isHQ = user?.role === 'department_report_admin' || user?.role === 'super_admin';
  const isDigitalAdmin = user?.role === 'digital_admin';
  const canFill = user ? getClientAccess(user).canFill : false;
  const canReceive = user ? getClientAccess(user).canReceive : false;

  const { data: assignments, isLoading: assignmentsLoading } = useSWR<ReportAssignment[]>(swrKeys.assignments, swrFetcher, { revalidateOnFocus: false });
  const { data: templates = [] } = useSWR<ReportTemplate[]>(isHQ ? swrKeys.templates : null, swrFetcher, { revalidateOnFocus: false });
  const { data: branches = [] } = useSWR<Company[]>(isHQ ? swrKeys.branches : null, swrFetcher, { revalidateOnFocus: false });
  const { data: pendingApprovals = [] } = useSWR<PendingApprovalTask[]>(!isHQ && !isDigitalAdmin ? swrKeys.pendingApprovals : null, swrFetcher, { revalidateOnFocus: false });
  const { data: pendingTemplateApprovals = [] } = useSWR<TemplateApproval[]>(isDigitalAdmin ? swrKeys.pendingTemplateApprovals : null, swrFetcher, { revalidateOnFocus: false });
  const { data: pendingReceipts = [], mutate: mutateReceipts } = useSWR<PendingReceipt[]>(canReceive ? swrKeys.pendingReceipts : null, swrFetcher, { revalidateOnFocus: false });
  const remindersEnabled = user ? (user.company_level === 'branch' || user.role === 'department_report_admin') : false;
  const { data: rejectedReminders = [] } = useRejectedReminders(remindersEnabled);

  useEffect(() => {
    api.getMe().then((res) => setUser(res.user)).catch(() => {});
  }, []);

  const loading = assignmentsLoading && !assignments;
  const assignmentsList = assignments || [];
  const branchesCount = branches.length;

  const [receiptItem, setReceiptItem] = useState<PendingReceipt | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<ReportSubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [receiptComment, setReceiptComment] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const openReceiptModal = async (item: PendingReceipt) => {
    setReceiptItem(item);
    setReceiptComment('');
    setDetailLoading(true);
    try {
      const detail = await api.getSubmissionDetail(item.submission_id || item.id);
      setSubmissionDetail(detail);
    } catch (err: any) {
      showToast(err.message || '获取填报详情失败', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReceiptAction = async (action: 'received' | 'returned') => {
    if (!receiptItem) return;
    if (action === 'returned' && !receiptComment.trim()) {
      return showToast('退回时必须填写具体原因', 'error');
    }
    setProcessingId(receiptItem.id);
    try {
      await api.processReceipt(receiptItem.id, action, receiptComment);
      showToast(action === 'received' ? '签收成功' : '已退回');
      setReceiptItem(null);
      setSubmissionDetail(null);
      await mutateReceipts();
    } catch (err: any) {
      showToast(err.message || '操作失败', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Grayscale status mapping — color reserved for accent only
  const statusMap: Record<string, { label: string; tone: 'idle' | 'progress' | 'done' | 'warn' }> = {
    pending: { label: '待填报', tone: 'idle' },
    filling: { label: '填报中', tone: 'progress' },
    submitted: { label: '已提交待审', tone: 'progress' },
    pending_receipt: { label: '待签收', tone: 'progress' },
    received: { label: '已签收', tone: 'done' },
    returned: { label: '已退回', tone: 'warn' },
    approved: { label: '已审批', tone: 'done' },
    aggregated: { label: '已汇总', tone: 'done' },
    rejected: { label: '已退回', tone: 'warn' },
  };

  function getTaskStatus(item: ReportAssignment) {
    if (item.status === 'submitted') {
      if (item.submission_status === 'pending_review')
        return { label: '待复核', tone: 'progress' as const };
      if (item.submission_status === 'pending_approval')
        return { label: '待审批', tone: 'progress' as const };
    }
    return statusMap[item.status] || statusMap.pending;
  }

  const toneClass = (tone: string) =>
    tone === 'done' ? 'text-[#346538] bg-[#EDF3EC]'
    : tone === 'progress' ? 'text-[#1F6C9F] bg-[#E1F3FE]'
    : tone === 'warn' ? 'text-[#9F2F2D] bg-[#FDEBEC]'
    : 'text-mute bg-line';

  return (
    <div className="max-w-[1280px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-[clamp(20px,3vw,32px)]">
      {/* Hero — editorial document header */}
      <section
        className="reveal bg-white rounded-[12px] px-[clamp(24px,4vw,40px)] py-[clamp(26px,4vw,40px)]"
        style={{ boxShadow: 'var(--sh-panel)' }}
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div className="min-w-0">
            <div
              className="inline-flex items-center gap-2 h-6 px-2.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.05em] text-mute bg-canvas"
              style={{ border: '1px solid var(--hairline)' }}
            >
              <Building2 className="w-3 h-3" />
              <span>{user?.company_name} · {isHQ ? '总部层级' : '分公司层级'}</span>
            </div>
            <p className="t-mono mt-4 text-[11px] font-medium uppercase tracking-[0.22em] text-faint">
              欢迎回来
            </p>
            <h1 className="t-serif mt-2 text-ink leading-[1.15] text-[26px] sm:text-[34px]">
              {user?.display_name || '使用者'}
            </h1>
            <p className="mt-3 text-[13px] text-mute leading-[1.7] max-w-[460px]">
              {isHQ
                ? '统一管控中心：设计通用模板、按周期下发各分公司、全流程跟进与智能汇总。'
                : '分公司填报中心：高效完成周期性数据上报、三级穿透审核。'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {user?.role === 'department_report_admin' ? (
              <button
                onClick={() => navigate('/templates')}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md bg-ink text-white text-[13px] font-semibold hover:bg-inkhover transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>新建模板</span>
              </button>
            ) : user?.role === 'super_admin' ? (
              <button
                onClick={() => navigate('/global-view')}
                className="inline-flex items-center h-10 px-4 rounded-md bg-ink text-white text-[13px] font-semibold hover:bg-inkhover transition-colors"
              >
                进入全局只读视图
              </button>
            ) : (
              <button
                onClick={() => navigate('/fill')}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md bg-ink text-white text-[13px] font-semibold hover:bg-inkhover transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>立即填报</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Stat cards — independent clickable objects, card grid with hover lift */}
      {isHQ ? (
        <div className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px]" style={{ '--reveal-index': 1 } as React.CSSProperties}>
          <Link to="/templates" className="apple-card block bg-white rounded-[12px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-mute">发布的模板数</div>
            <div className="mt-1 text-[28px] font-bold text-ink tabular-nums tracking-[-0.01em]">{templates.length}</div>
            <div className="mt-1 text-[11px] text-ink flex items-center gap-0.5">
              <span>管理模板</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>

          <Link to="/assignments" className="apple-card block bg-white rounded-[12px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-mute">下发任务总数</div>
            <div className="mt-1 text-[28px] font-bold text-ink tabular-nums tracking-[-0.01em]">{assignmentsList.length}</div>
            <div className="mt-1 text-[11px] text-ink flex items-center gap-0.5">
              <span>查看任务</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>

          <Link to="/aggregation" className="apple-card block bg-white rounded-[12px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-mute">已完结/汇总数量</div>
            <div className="mt-1 text-[28px] font-bold text-ink tabular-nums tracking-[-0.01em]">
              {assignmentsList.filter((a) => a.status === 'aggregated').length}
            </div>
            <div className="mt-1 text-[11px] text-ink flex items-center gap-0.5">
              <span>查看汇总</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>

          <Link to="/organizations" className="apple-card block bg-white rounded-[12px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-mute">关联分公司数量</div>
            <div className="mt-1 text-[28px] font-bold text-ink tabular-nums tracking-[-0.01em]">{branchesCount}</div>
            <div className="mt-1 text-[11px] text-ink flex items-center gap-0.5">
              <span>管理机构</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>
        </div>
      ) : (
        <div className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[14px]" style={{ '--reveal-index': 1 } as React.CSSProperties}>
          <Link to="/fill" className="apple-card block bg-white rounded-[12px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-mute">收到下发任务</div>
            <div className="mt-1 text-[28px] font-bold text-ink tabular-nums tracking-[-0.01em]">{assignmentsList.length}</div>
            <div className="mt-1 text-[11px] text-ink flex items-center gap-0.5">
              <span>前往填报</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>

          <Link to="/approvals" className="apple-card block bg-white rounded-[12px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-mute">待处理/待审批</div>
            <div className="mt-1 text-[28px] font-bold text-ink tabular-nums tracking-[-0.01em]">{pendingApprovals.length}</div>
            <div className="mt-1 text-[11px] text-ink flex items-center gap-0.5">
              <span>前往审批</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>

          <Link to="/fill" className="apple-card block bg-white rounded-[12px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-mute">已终审通过报表</div>
            <div className="mt-1 text-[28px] font-bold text-ink tabular-nums tracking-[-0.01em]">
              {assignmentsList.filter((a) => a.status === 'aggregated').length}
            </div>
            <div className="mt-1 text-[11px] text-ink flex items-center gap-0.5">
              <span>查看详情</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>
        </div>
      )}

      {/* 退回提醒 — 填报被驳回/签收退回（分公司）或模板被驳回（部门管理员） */}
      {rejectedReminders.length > 0 && (
        <section
          className="reveal bg-white rounded-[12px] overflow-hidden"
          style={{ boxShadow: 'var(--sh-panel)', '--reveal-index': 2 } as React.CSSProperties}
        >
          <div className="flex items-center justify-between px-[clamp(17px,3vw,24px)] py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink tracking-[-0.01em]">
              <AlertCircle className="w-4 h-4 text-[#9F2F2D]" />
              <span>退回提醒</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-[#9F2F2D] bg-[#FDEBEC] tabular-nums">
                {rejectedReminders.length}
              </span>
            </h2>
            <span className="text-[11px] text-mute">修改后重新提交即可消除提醒</span>
          </div>

          <div>
            {rejectedReminders.map((item: RejectedReminder) => {
              const kindLabel = item.kind === 'template_rejected'
                ? '模板被驳回'
                : item.kind === 'receipt_returned'
                  ? '签收退回'
                  : item.stage === 'reviewer'
                    ? '复核驳回'
                    : '审批驳回';
              return (
                <div
                  key={`${item.kind}-${item.assignment_id ?? item.template_id}`}
                  className="apple-row px-[clamp(17px,3vw,24px)] py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-[#9F2F2D] bg-[#FDEBEC] px-2 py-0.5 rounded-full">{kindLabel}</span>
                      {item.period_label && (
                        <span className="text-[11px] font-semibold text-mute tabular-nums">{item.period_label}</span>
                      )}
                      <span className="text-[15px] font-semibold text-ink tracking-[-0.01em] truncate">{item.title}</span>
                    </div>
                    <div className="text-[12px] text-mute flex items-center flex-wrap gap-x-3 gap-y-1 tabular-nums">
                      {item.rejected_by_name && (
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-faint" />
                          <span>退回人: {item.rejected_by_name}</span>
                        </span>
                      )}
                      {item.rejected_at && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-faint" />
                          <span>{item.rejected_at}</span>
                        </span>
                      )}
                      {item.deadline && <span>截止: {item.deadline}</span>}
                    </div>
                    {item.comment && (
                      <div className="text-[11px] text-[#9F2F2D] bg-[#FDEBEC] px-2 py-1 rounded">
                        退回意见: {item.comment}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(item.kind === 'template_rejected' ? `/templates/${item.template_id}` : `/fill/${item.assignment_id}`)}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-ink hover:bg-inkhover text-white text-[13px] font-semibold transition-colors"
                  >
                    <span>前往修改</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 待签收任务 — unified panel with hairline dividers */}
      {canReceive && (
        <section
          className="reveal bg-white rounded-[12px] overflow-hidden"
          style={{ boxShadow: 'var(--sh-panel)', '--reveal-index': 2 } as React.CSSProperties}
        >
          <div className="flex items-center justify-between px-[clamp(17px,3vw,24px)] py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink tracking-[-0.01em]">
              <Inbox className="w-4 h-4 text-ink" />
              <span>待签收任务</span>
              {pendingReceipts.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-ink bg-[rgba(17,17,17,0.08)] tabular-nums">
                  {pendingReceipts.length}
                </span>
              )}
            </h2>
          </div>

          {pendingReceipts.length === 0 ? (
            <div className="py-12 text-center">
              <CheckSquare className="w-8 h-8 text-line mx-auto mb-2" />
              <div className="text-[14px] font-semibold text-ink">暂无待签收报表</div>
              <p className="text-[12px] text-mute mt-1">所有上报报表已处理完成</p>
            </div>
          ) : (
            <div>
              {pendingReceipts.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="apple-row px-[clamp(17px,3vw,24px)] py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-ink bg-[rgba(17,17,17,0.08)] px-2 py-0.5 rounded-full">待签收</span>
                      <span className="text-[11px] font-semibold text-mute tabular-nums">{item.period_label}</span>
                      <span className="text-[15px] font-semibold text-ink tracking-[-0.01em] truncate">{item.assignment_title}</span>
                      <span className="text-[10px] font-mono text-mute tabular-nums">v{item.version}</span>
                    </div>
                    <div className="text-[12px] text-mute flex items-center flex-wrap gap-x-3 gap-y-1 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-faint" />
                        <span>{item.company_name}</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-faint" />
                        <span>{item.submitted_by_name}</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-faint" />
                        <span>{item.submitted_at}</span>
                      </span>
                    </div>
                    {item.comment && (
                      <div className="text-[11px] text-mute bg-canvas px-2 py-1 rounded">
                        提交说明: {item.comment}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => openReceiptModal(item)}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-ink hover:bg-inkhover text-white text-[13px] font-semibold transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>查看并签收</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Main Content Grid */}
      <div className="reveal grid grid-cols-1 lg:grid-cols-3 gap-[clamp(20px,3vw,32px)]" style={{ '--reveal-index': 2 } as React.CSSProperties}>
        {/* Left Column (2 cols): Task list — unified panel */}
        <div className="lg:col-span-2 space-y-[clamp(20px,3vw,32px)]">
          <section
            className="bg-white rounded-[12px] overflow-hidden"
            style={{ boxShadow: 'var(--sh-panel)' }}
          >
            <div className="flex items-center justify-between px-[clamp(17px,3vw,24px)] py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink tracking-[-0.01em]">
                <Clock className="w-4 h-4 text-ink" />
                <span>{isHQ ? '最新下发管控任务' : '需要关注的报表任务'}</span>
              </h2>
              <Link
                to={isHQ ? '/assignments' : '/fill'}
                className="text-[12px] font-semibold text-ink hover:text-ink flex items-center gap-1"
              >
                <span>查看全部</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="py-12 text-center text-[13px] text-mute">加载任务列表中...</div>
            ) : assignmentsList.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-mute">暂无报表任务</div>
            ) : (
              <div>
                {assignmentsList.slice(0, 5).map((item) => {
                  const sInfo = getTaskStatus(item);
                  const isOverdue = new Date(item.deadline) < new Date() && !['aggregated', 'received', 'pending_receipt', 'submitted'].includes(item.status);
                  return (
                    <div
                      key={item.id}
                      className="apple-row px-[clamp(17px,3vw,24px)] py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[15px] font-semibold text-ink tracking-[-0.01em]">{item.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${toneClass(sInfo.tone)}`}>
                            {sInfo.label}
                          </span>
                          {isOverdue && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-[#9F2F2D] bg-[#FDEBEC]">
                              已逾期
                            </span>
                          )}
                        </div>
                        {item.template_name && (
                          <div className="text-[12px] text-mute">{item.template_name}</div>
                        )}
                        <div className="text-[12px] text-mute flex items-center flex-wrap gap-x-3 gap-y-1 tabular-nums">
                          {item.issuer_department_name && (
                            <span className="inline-flex items-center gap-1 text-ink font-medium">
                              <Building2 className="w-3 h-3" />
                              <span>下发部门: {item.issuer_department_name}</span>
                            </span>
                          )}
                          <span>周期: {item.period_label}</span>
                          <span className={isOverdue ? 'text-[#9F2F2D] font-medium' : ''}>
                            截止: {item.deadline}
                          </span>
                          {isHQ && <span>分公司: {item.company_name}</span>}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {isHQ ? (
                          <button
                            onClick={() => navigate(`/aggregation?template_id=${item.template_id}`)}
                            className="h-9 px-4 rounded-md bg-canvas hover:bg-line text-ink text-[12px] font-semibold transition-colors"
                          >
                            查看对比汇总
                          </button>
                        ) : canFill ? (
                          <button
                            onClick={() => navigate(`/fill/${item.id}`)}
                            className="h-9 px-4 rounded-md bg-ink hover:bg-inkhover text-white text-[12px] font-semibold transition-colors"
                          >
                            {['received', 'aggregated'].includes(item.status) ? '查看详情' : '在线填报/修改'}
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/fill/${item.id}`)}
                            className="h-9 px-4 rounded-md bg-canvas hover:bg-line text-ink text-[12px] font-semibold transition-colors"
                          >
                            查看详情
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Column (1 col): Pending Approvals + Quick Nav — unified panels */}
        <div className="space-y-[clamp(20px,3vw,32px)]">
          {/* Digital admin: pending template approvals */}
          {isDigitalAdmin && pendingTemplateApprovals.length > 0 && (
            <section
              className="bg-white rounded-[12px] overflow-hidden"
              style={{ boxShadow: 'var(--sh-panel)' }}
            >
              <div className="px-[clamp(17px,3vw,24px)] py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <div className="flex items-center gap-2 text-ink font-semibold text-[14px]">
                  <AlertCircle className="w-4 h-4 text-[#9F2F2D]" />
                  <span>待审批模板</span>
                  <span className="ml-auto text-[#9F2F2D] tabular-nums font-bold">{pendingTemplateApprovals.length}</span>
                </div>
                <p className="mt-2 text-[12px] text-mute leading-[1.6]">
                  各部门提交了新的报表模板待您审核，请及时处理。
                </p>
              </div>
              <div className="px-[clamp(17px,3vw,24px)] py-4">
                <button
                  onClick={() => navigate('/approvals')}
                  className="w-full h-11 rounded-md bg-ink hover:bg-inkhover text-white font-semibold text-[13px] transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>前往模板审批中心</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </section>
          )}

          {/* Branch users: pending submission approvals */}
          {!isHQ && !isDigitalAdmin && pendingApprovals.length > 0 && (
            <section
              className="bg-white rounded-[12px] overflow-hidden"
              style={{ boxShadow: 'var(--sh-panel)' }}
            >
              <div className="px-[clamp(17px,3vw,24px)] py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <div className="flex items-center gap-2 text-ink font-semibold text-[14px]">
                  <AlertCircle className="w-4 h-4 text-[#9F2F2D]" />
                  <span>待处理复核/审批</span>
                  <span className="ml-auto text-[#9F2F2D] tabular-nums font-bold">{pendingApprovals.length}</span>
                </div>
                <p className="mt-2 text-[12px] text-mute leading-[1.6]">
                  您当前有待核查流转的填报单，请及时完成评审。
                </p>
              </div>
              <div className="px-[clamp(17px,3vw,24px)] py-4">
                <button
                  onClick={() => navigate('/approvals')}
                  className="w-full h-11 rounded-md bg-ink hover:bg-inkhover text-white font-semibold text-[13px] transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>前往审批中心</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </section>
          )}

          {/* Quick Nav — unified panel list */}
          <section
            className="bg-white rounded-[12px] overflow-hidden"
            style={{ boxShadow: 'var(--sh-panel)' }}
          >
            <div className="px-[clamp(17px,3vw,24px)] py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink tracking-[-0.01em]">
                <TrendingUp className="w-4 h-4 text-ink" />
                <span>常用快捷导航</span>
              </h3>
            </div>

            <div>
              {isHQ ? (
                <>
                  <Link to="/templates" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <FileSpreadsheet className="w-4 h-4 text-mute" />
                        <span className="text-[14px] font-medium text-ink">报表模板库与设计器</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-line" />
                    </div>
                  </Link>
                  <Link to="/assignments" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Send className="w-4 h-4 text-mute" />
                        <span className="text-[14px] font-medium text-ink">发起周期下发与催报</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-line" />
                    </div>
                  </Link>
                  <Link to="/aggregation" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <BarChart3 className="w-4 h-4 text-mute" />
                        <span className="text-[14px] font-medium text-ink">横向汇总表与指标计算</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-line" />
                    </div>
                  </Link>
                </>
              ) : isDigitalAdmin ? (
                <>
                  <Link to="/approvals" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <CheckSquare className="w-4 h-4 text-mute" />
                        <span className="text-[14px] font-medium text-ink">模板审批中心</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-line" />
                    </div>
                  </Link>
                  <Link to="/templates" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <FileSpreadsheet className="w-4 h-4 text-mute" />
                        <span className="text-[14px] font-medium text-ink">模板查看与管理</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-line" />
                    </div>
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/fill" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <FileSpreadsheet className="w-4 h-4 text-mute" />
                        <span className="text-[14px] font-medium text-ink">待填报多明细列表</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-line" />
                    </div>
                  </Link>
                  <Link to="/approvals" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <CheckSquare className="w-4 h-4 text-mute" />
                        <span className="text-[14px] font-medium text-ink">经办/复核/终审轨迹</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-line" />
                    </div>
                  </Link>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Receipt Detail & Sign Modal — overlay with two-layer shadow + glass scrim */}
      {receiptItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.32)' }}
        >
          <div
            className="bg-white rounded-[12px] max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: 'var(--sh-overlay)' }}
          >
            <div className="flex items-center justify-between pb-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <div>
                <h2 className="flex items-center gap-2 text-[17px] font-semibold text-ink tracking-[-0.01em]">
                  <FileCheck2 className="w-4 h-4 text-ink" />
                  <span>报表签收确认</span>
                </h2>
                <div className="text-[12px] text-mute mt-1 tabular-nums">
                  {receiptItem.assignment_title} (v{receiptItem.version}) · {receiptItem.company_name}
                </div>
              </div>
              <button
                onClick={() => { setReceiptItem(null); setSubmissionDetail(null); }}
                className="p-1.5 rounded-full text-mute hover:text-ink hover:bg-canvas transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {detailLoading || !submissionDetail ? (
              <div className="py-16 text-center text-[13px] text-mute">正在加载数据明细...</div>
            ) : (
              <div className="space-y-5 pt-5">
                {/* 一、审批流程 + 签收操作（置顶） */}
                <div className="space-y-3">
                  <div className="text-[13px] font-semibold text-ink">一、审批流程</div>
                  {submissionDetail.approvals && submissionDetail.approvals.length > 0 ? (
                    <ApprovalTimeline approvals={submissionDetail.approvals} />
                  ) : (
                    <div className="text-[12px] text-mute">暂无审批记录</div>
                  )}

                  <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--hairline)' }}>
                    <label className="block text-[13px] font-semibold text-ink">
                      签收备注 <span className="text-mute font-normal">(退回时必须填写原因)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={receiptComment}
                      onChange={(e) => setReceiptComment(e.target.value)}
                      placeholder="如：数据核实无误，同意签收 / 数据有误需退回修正..."
                      className="w-full px-3.5 py-2.5 bg-canvas rounded-[12px] text-[13px] text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-ink focus:bg-white transition-colors"
                    />
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        disabled={processingId !== null}
                        onClick={() => handleReceiptAction('returned')}
                        className="inline-flex items-center gap-1.5 h-11 px-5 rounded-md bg-canvas hover:bg-line text-ink font-semibold text-[13px] transition-colors disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4 text-[#9F2F2D]" />
                        <span>退回修正</span>
                      </button>
                      <button
                        type="button"
                        disabled={processingId !== null}
                        onClick={() => handleReceiptAction('received')}
                        className="inline-flex items-center gap-1.5 h-11 px-6 rounded-md bg-ink hover:bg-inkhover text-white font-semibold text-[13px] transition-colors disabled:opacity-50"
                      >
                        <CheckSquare className="w-4 h-4" />
                        <span>确认签收</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 二、汇总指标 */}
                {submissionDetail.summary.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-[13px] font-semibold text-ink">二、汇总指标</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-[10px]">
                      {submissionDetail.summary.map((s) => (
                        <div key={s.field_id} className="bg-canvas p-3 rounded-[12px]">
                          <div className="text-[11px] text-mute font-medium">{s.field_label}</div>
                          <div className="text-[14px] font-semibold text-ink mt-0.5 tabular-nums">{s.value || '(未填写)'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 三、填报明细（分页） */}
                {submissionDetail.details && submissionDetail.details.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-[13px] font-semibold text-ink">
                      三、填报明细 (共 <span className="tabular-nums">{submissionDetail.details.length}</span> 行)
                    </div>
                    <SubmissionDetailTables detail={submissionDetail} pageSize={10} />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`toast-slide-in fixed top-5 right-5 z-[60] px-4 py-3 rounded-md text-[13px] font-medium text-white ${toast.type === 'error' ? 'bg-[#9F2F2D]' : 'bg-ink'}`}
          style={{ boxShadow: 'var(--sh-overlay)' }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};
