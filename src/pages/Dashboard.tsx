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
  HelpCircle,
  BookOpen,
  Shield,
  Workflow,
  Zap,
} from 'lucide-react';
import { api, getStoredUser, swrKeys, swrFetcher } from '../services/api';
import { UserInfo, ReportTemplate, ReportAssignment, PendingApprovalTask, Company, PendingReceipt, ReportSubmissionDetail } from '../types';
import { getClientAccess } from '../utils/access';
import { SubmissionDetailTables } from '../components/SubmissionDetailTables';

export const Dashboard: React.FC = () => {
  const [user, setUser] = useState<UserInfo | null>(getStoredUser());
  const navigate = useNavigate();
  const isHQ = user?.role === 'department_report_admin' || user?.role === 'super_admin';
  const canFill = user ? getClientAccess(user).canFill : false;
  const canReceive = user ? getClientAccess(user).canReceive : false;

  const { data: assignments, isLoading: assignmentsLoading } = useSWR<ReportAssignment[]>(swrKeys.assignments, swrFetcher, { revalidateOnFocus: false });
  const { data: templates = [] } = useSWR<ReportTemplate[]>(isHQ ? swrKeys.templates : null, swrFetcher, { revalidateOnFocus: false });
  const { data: branches = [] } = useSWR<Company[]>(isHQ ? swrKeys.branches : null, swrFetcher, { revalidateOnFocus: false });
  const { data: pendingApprovals = [] } = useSWR<PendingApprovalTask[]>(!isHQ ? swrKeys.pendingApprovals : null, swrFetcher, { revalidateOnFocus: false });
  const { data: pendingReceipts = [], mutate: mutateReceipts } = useSWR<PendingReceipt[]>(canReceive ? swrKeys.pendingReceipts : null, swrFetcher, { revalidateOnFocus: false });

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
  const [helpOpen, setHelpOpen] = useState(false);
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
    tone === 'done' ? 'text-[#1d1d1f] bg-[#e8e8ed]'
    : tone === 'progress' ? 'text-[#0071e3] bg-[rgba(0,113,227,0.08)]'
    : tone === 'warn' ? 'text-[#ff6b00] bg-[rgba(255,107,0,0.1)]'
    : 'text-[#6e6e73] bg-[#e8e8ed]';

  return (
    <div className="max-w-[1080px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-[clamp(20px,3vw,32px)]">
      {/* Hero — colored CTA with liquid glass */}
      <section
        className="relative overflow-hidden rounded-[22px] p-[clamp(20px,3vw,28px)]"
        style={{ background: 'var(--grad-cta)', boxShadow: 'var(--sh-cta)' }}
      >
        {/* blurred light orbs — glass needs something to refract */}
        <div className="absolute w-[220px] h-[220px] rounded-full bg-white/20 filter blur-[46px] -top-16 -right-10 pointer-events-none" />
        <div className="absolute w-[180px] h-[180px] rounded-full bg-[rgba(120,80,255,0.5)] filter blur-[50px] -bottom-20 left-[12%] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div
              className="inline-flex items-center gap-2 h-6 px-2.5 rounded-full text-[11px] font-medium tracking-wide text-white"
              style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            >
              <Building2 className="w-3 h-3" />
              <span>{user?.company_name} · {isHQ ? '总部层级' : '分公司层级'}</span>
            </div>
            <h1 className="mt-3 text-white font-semibold leading-[1.15] tracking-[-0.02em] text-[22px] sm:text-[26px]">
              欢迎回来，{user?.display_name || '使用者'}
            </h1>
            <p className="mt-2 text-[13px] text-white/80 leading-[1.6] max-w-[460px]">
              {isHQ
                ? '统一管控中心：设计通用模板、按周期下发各分公司、全流程跟进与智能汇总。'
                : '分公司填报中心：高效完成周期性数据上报、三级穿透审核。'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-white/90 hover:text-white text-[12px] font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">使用帮助</span>
            </button>

            <div>
            {user?.role === 'department_report_admin' ? (
              <button
                onClick={() => navigate('/templates')}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-white text-[#0071e3] text-[13px] font-semibold hover:bg-white/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>新建模板</span>
              </button>
            ) : user?.role === 'super_admin' ? (
              <button
                onClick={() => navigate('/global-view')}
                className="inline-flex items-center h-10 px-4 rounded-full bg-white/80 border border-white/20 text-white text-[13px] font-semibold hover:bg-white/90 transition-colors"
                style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
              >
                进入全局只读视图
              </button>
            ) : (
              <button
                onClick={() => navigate('/fill')}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-white text-[#0071e3] text-[13px] font-semibold hover:bg-white/90 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>立即填报</span>
              </button>
            )}
            </div>
          </div>
        </div>
      </section>

      {/* Stat cards — independent clickable objects, card grid with hover lift */}
      {isHQ ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px]">
          <Link to="/templates" className="apple-card block bg-white rounded-[18px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-[#6e6e73]">发布的模板数</div>
            <div className="mt-1 text-[28px] font-bold text-[#1d1d1f] tabular-nums tracking-[-0.01em]">{templates.length}</div>
            <div className="mt-1 text-[11px] text-[#0071e3] flex items-center gap-0.5">
              <span>管理模板</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>

          <Link to="/assignments" className="apple-card block bg-white rounded-[18px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-[#6e6e73]">下发任务总数</div>
            <div className="mt-1 text-[28px] font-bold text-[#1d1d1f] tabular-nums tracking-[-0.01em]">{assignmentsList.length}</div>
            <div className="mt-1 text-[11px] text-[#0071e3] flex items-center gap-0.5">
              <span>查看任务</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>

          <Link to="/aggregation" className="apple-card block bg-white rounded-[18px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-[#6e6e73]">已完结/汇总数量</div>
            <div className="mt-1 text-[28px] font-bold text-[#1d1d1f] tabular-nums tracking-[-0.01em]">
              {assignmentsList.filter((a) => a.status === 'aggregated').length}
            </div>
            <div className="mt-1 text-[11px] text-[#0071e3] flex items-center gap-0.5">
              <span>查看汇总</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>

          <Link to="/organizations" className="apple-card block bg-white rounded-[18px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-[#6e6e73]">关联分公司数量</div>
            <div className="mt-1 text-[28px] font-bold text-[#1d1d1f] tabular-nums tracking-[-0.01em]">{branchesCount}</div>
            <div className="mt-1 text-[11px] text-[#0071e3] flex items-center gap-0.5">
              <span>管理机构</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[14px]">
          <Link to="/fill" className="apple-card block bg-white rounded-[18px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-[#6e6e73]">收到下发任务</div>
            <div className="mt-1 text-[28px] font-bold text-[#1d1d1f] tabular-nums tracking-[-0.01em]">{assignmentsList.length}</div>
            <div className="mt-1 text-[11px] text-[#0071e3] flex items-center gap-0.5">
              <span>前往填报</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>

          <Link to="/approvals" className="apple-card block bg-white rounded-[18px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-[#6e6e73]">待处理/待审批</div>
            <div className="mt-1 text-[28px] font-bold text-[#1d1d1f] tabular-nums tracking-[-0.01em]">{pendingApprovals.length}</div>
            <div className="mt-1 text-[11px] text-[#0071e3] flex items-center gap-0.5">
              <span>前往审批</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>

          <Link to="/fill" className="apple-card block bg-white rounded-[18px] p-5 no-underline" style={{ boxShadow: 'var(--sh-card)' }}>
            <div className="text-[13px] font-medium text-[#6e6e73]">已终审通过报表</div>
            <div className="mt-1 text-[28px] font-bold text-[#1d1d1f] tabular-nums tracking-[-0.01em]">
              {assignmentsList.filter((a) => a.status === 'aggregated').length}
            </div>
            <div className="mt-1 text-[11px] text-[#0071e3] flex items-center gap-0.5">
              <span>查看详情</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>
        </div>
      )}

      {/* 待签收任务 — unified panel with hairline dividers */}
      {canReceive && (
        <section
          className="bg-white rounded-[22px] overflow-hidden"
          style={{ boxShadow: 'var(--sh-panel)' }}
        >
          <div className="flex items-center justify-between px-[clamp(17px,3vw,24px)] py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#1d1d1f] tracking-[-0.01em]">
              <Inbox className="w-4 h-4 text-[#0071e3]" />
              <span>待签收任务</span>
              {pendingReceipts.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-[#0071e3] bg-[rgba(0,113,227,0.08)] tabular-nums">
                  {pendingReceipts.length}
                </span>
              )}
            </h2>
          </div>

          {pendingReceipts.length === 0 ? (
            <div className="py-12 text-center">
              <CheckSquare className="w-8 h-8 text-[#d2d2d7] mx-auto mb-2" />
              <div className="text-[14px] font-semibold text-[#1d1d1f]">暂无待签收报表</div>
              <p className="text-[12px] text-[#86868b] mt-1">所有上报报表已处理完成</p>
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
                      <span className="text-[11px] font-bold text-[#0071e3] bg-[rgba(0,113,227,0.08)] px-2 py-0.5 rounded-full">待签收</span>
                      <span className="text-[11px] font-semibold text-[#6e6e73] tabular-nums">{item.period_label}</span>
                      <span className="text-[15px] font-semibold text-[#1d1d1f] tracking-[-0.01em] truncate">{item.assignment_title}</span>
                      <span className="text-[10px] font-mono text-[#86868b] tabular-nums">v{item.version}</span>
                    </div>
                    <div className="text-[12px] text-[#6e6e73] flex items-center flex-wrap gap-x-3 gap-y-1 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-[#aeaeb2]" />
                        <span>{item.company_name}</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-[#aeaeb2]" />
                        <span>{item.submitted_by_name}</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#aeaeb2]" />
                        <span>{item.submitted_at}</span>
                      </span>
                    </div>
                    {item.comment && (
                      <div className="text-[11px] text-[#86868b] bg-[#f5f5f7] px-2 py-1 rounded">
                        提交说明: {item.comment}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => openReceiptModal(item)}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#0071e3] hover:bg-[#0066cc] text-white text-[13px] font-semibold transition-colors"
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[clamp(20px,3vw,32px)]">
        {/* Left Column (2 cols): Task list — unified panel */}
        <div className="lg:col-span-2 space-y-[clamp(20px,3vw,32px)]">
          <section
            className="bg-white rounded-[22px] overflow-hidden"
            style={{ boxShadow: 'var(--sh-panel)' }}
          >
            <div className="flex items-center justify-between px-[clamp(17px,3vw,24px)] py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#1d1d1f] tracking-[-0.01em]">
                <Clock className="w-4 h-4 text-[#0071e3]" />
                <span>{isHQ ? '最新下发管控任务' : '需要关注的报表任务'}</span>
              </h2>
              <Link
                to={isHQ ? '/assignments' : '/fill'}
                className="text-[12px] font-semibold text-[#0071e3] hover:text-[#0066cc] flex items-center gap-1"
              >
                <span>查看全部</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="py-12 text-center text-[13px] text-[#86868b]">加载任务列表中...</div>
            ) : assignmentsList.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-[#86868b]">暂无报表任务</div>
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
                          <span className="text-[15px] font-semibold text-[#1d1d1f] tracking-[-0.01em]">{item.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${toneClass(sInfo.tone)}`}>
                            {sInfo.label}
                          </span>
                          {isOverdue && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-[#ff6b00] bg-[rgba(255,107,0,0.1)]">
                              已逾期
                            </span>
                          )}
                        </div>
                        {item.template_name && (
                          <div className="text-[12px] text-[#86868b]">{item.template_name}</div>
                        )}
                        <div className="text-[12px] text-[#6e6e73] flex items-center flex-wrap gap-x-3 gap-y-1 tabular-nums">
                          {item.issuer_department_name && (
                            <span className="inline-flex items-center gap-1 text-[#0071e3] font-medium">
                              <Building2 className="w-3 h-3" />
                              <span>下发部门: {item.issuer_department_name}</span>
                            </span>
                          )}
                          <span>周期: {item.period_label}</span>
                          <span className={isOverdue ? 'text-[#ff6b00] font-medium' : ''}>
                            截止: {item.deadline}
                          </span>
                          {isHQ && <span>分公司: {item.company_name}</span>}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {isHQ ? (
                          <button
                            onClick={() => navigate(`/aggregation?template_id=${item.template_id}`)}
                            className="h-9 px-4 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[12px] font-semibold transition-colors"
                          >
                            查看对比汇总
                          </button>
                        ) : canFill ? (
                          <button
                            onClick={() => navigate(`/fill/${item.id}`)}
                            className="h-9 px-4 rounded-full bg-[#0071e3] hover:bg-[#0066cc] text-white text-[12px] font-semibold transition-colors"
                          >
                            {['received', 'aggregated'].includes(item.status) ? '查看详情' : '在线填报/修改'}
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/fill/${item.id}`)}
                            className="h-9 px-4 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[12px] font-semibold transition-colors"
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
          {!isHQ && pendingApprovals.length > 0 && (
            <section
              className="bg-white rounded-[22px] overflow-hidden"
              style={{ boxShadow: 'var(--sh-panel)' }}
            >
              <div className="px-[clamp(17px,3vw,24px)] py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <div className="flex items-center gap-2 text-[#1d1d1f] font-semibold text-[14px]">
                  <AlertCircle className="w-4 h-4 text-[#ff6b00]" />
                  <span>待处理复核/审批</span>
                  <span className="ml-auto text-[#ff6b00] tabular-nums font-bold">{pendingApprovals.length}</span>
                </div>
                <p className="mt-2 text-[12px] text-[#6e6e73] leading-[1.6]">
                  您当前有待核查流转的填报单，请及时完成评审。
                </p>
              </div>
              <div className="px-[clamp(17px,3vw,24px)] py-4">
                <button
                  onClick={() => navigate('/approvals')}
                  className="w-full h-11 rounded-full bg-[#0071e3] hover:bg-[#0066cc] text-white font-semibold text-[13px] transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>前往审批中心</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </section>
          )}

          {/* Quick Nav — unified panel list */}
          <section
            className="bg-white rounded-[22px] overflow-hidden"
            style={{ boxShadow: 'var(--sh-panel)' }}
          >
            <div className="px-[clamp(17px,3vw,24px)] py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <h3 className="flex items-center gap-2 text-[14px] font-semibold text-[#1d1d1f] tracking-[-0.01em]">
                <TrendingUp className="w-4 h-4 text-[#0071e3]" />
                <span>常用快捷导航</span>
              </h3>
            </div>

            <div>
              {isHQ ? (
                <>
                  <Link to="/templates" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <FileSpreadsheet className="w-4 h-4 text-[#86868b]" />
                        <span className="text-[14px] font-medium text-[#1d1d1f]">报表模板库与设计器</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#d2d2d7]" />
                    </div>
                  </Link>
                  <Link to="/assignments" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Send className="w-4 h-4 text-[#86868b]" />
                        <span className="text-[14px] font-medium text-[#1d1d1f]">发起周期下发与催报</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#d2d2d7]" />
                    </div>
                  </Link>
                  <Link to="/aggregation" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <BarChart3 className="w-4 h-4 text-[#86868b]" />
                        <span className="text-[14px] font-medium text-[#1d1d1f]">横向汇总表与指标计算</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#d2d2d7]" />
                    </div>
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/fill" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <FileSpreadsheet className="w-4 h-4 text-[#86868b]" />
                        <span className="text-[14px] font-medium text-[#1d1d1f]">待填报多明细列表</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#d2d2d7]" />
                    </div>
                  </Link>
                  <Link to="/approvals" className="apple-row block px-[clamp(17px,3vw,24px)] py-4 no-underline">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <CheckSquare className="w-4 h-4 text-[#86868b]" />
                        <span className="text-[14px] font-medium text-[#1d1d1f]">经办/复核/终审轨迹</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#d2d2d7]" />
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
          style={{ background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        >
          <div
            className="bg-white rounded-[22px] max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: 'var(--sh-overlay)' }}
          >
            <div className="flex items-center justify-between pb-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <div>
                <h2 className="flex items-center gap-2 text-[17px] font-semibold text-[#1d1d1f] tracking-[-0.01em]">
                  <FileCheck2 className="w-4 h-4 text-[#0071e3]" />
                  <span>报表签收确认</span>
                </h2>
                <div className="text-[12px] text-[#6e6e73] mt-1 tabular-nums">
                  {receiptItem.assignment_title} (v{receiptItem.version}) · {receiptItem.company_name}
                </div>
              </div>
              <button
                onClick={() => { setReceiptItem(null); setSubmissionDetail(null); }}
                className="p-1.5 rounded-full text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {detailLoading || !submissionDetail ? (
              <div className="py-16 text-center text-[13px] text-[#86868b]">正在加载数据明细...</div>
            ) : (
              <div className="space-y-5 pt-5">
                {submissionDetail.summary.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-[13px] font-semibold text-[#1d1d1f]">一、汇总指标</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-[10px]">
                      {submissionDetail.summary.map((s) => (
                        <div key={s.field_id} className="bg-[#f5f5f7] p-3 rounded-[12px]">
                          <div className="text-[11px] text-[#86868b] font-medium">{s.field_label}</div>
                          <div className="text-[14px] font-semibold text-[#1d1d1f] mt-0.5 tabular-nums">{s.value || '(未填写)'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {submissionDetail.details && submissionDetail.details.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-[13px] font-semibold text-[#1d1d1f]">
                      二、填报明细 (共 <span className="tabular-nums">{submissionDetail.details.length}</span> 行)
                    </div>
                    <SubmissionDetailTables detail={submissionDetail} />
                  </div>
                ) : null}

                {submissionDetail.approvals && submissionDetail.approvals.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[13px] font-semibold text-[#1d1d1f]">三、审批记录</div>
                    {submissionDetail.approvals.map((ar) => (
                      <div key={ar.id} className="flex items-center justify-between text-[12px] py-1">
                        <span className="font-medium text-[#424245]">
                          {ar.approval_level === 'reviewer' ? '复核' : ar.approval_level === 'approver' ? '审批' : '经办'}: {ar.approver_name || '-'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${
                          ar.status === 'approved' ? 'text-[#1d1d1f] bg-[#e8e8ed]'
                          : ar.status === 'rejected' ? 'text-[#ff6b00] bg-[rgba(255,107,0,0.1)]'
                          : 'text-[#0071e3] bg-[rgba(0,113,227,0.08)]'
                        }`}>
                          {ar.status === 'approved' ? '通过' : ar.status === 'rejected' ? '驳回' : '待处理'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--hairline)' }}>
                  <label className="block text-[13px] font-semibold text-[#1d1d1f]">签收备注 <span className="text-[#86868b] font-normal">(退回时必须填写原因)</span></label>
                  <textarea
                    rows={2}
                    value={receiptComment}
                    onChange={(e) => setReceiptComment(e.target.value)}
                    placeholder="如：数据核实无误，同意签收 / 数据有误需退回修正..."
                    className="w-full px-3.5 py-2.5 bg-[#f5f5f7] rounded-[12px] text-[13px] text-[#1d1d1f] placeholder:text-[#aeaeb2] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:bg-white transition-colors"
                  />
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      disabled={processingId !== null}
                      onClick={() => handleReceiptAction('returned')}
                      className="inline-flex items-center gap-1.5 h-11 px-5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold text-[13px] transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4 text-[#ff6b00]" />
                      <span>退回修正</span>
                    </button>
                    <button
                      type="button"
                      disabled={processingId !== null}
                      onClick={() => handleReceiptAction('received')}
                      className="inline-flex items-center gap-1.5 h-11 px-6 rounded-full bg-[#0071e3] hover:bg-[#0066cc] text-white font-semibold text-[13px] transition-colors disabled:opacity-50"
                    >
                      <CheckSquare className="w-4 h-4" />
                      <span>确认签收</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Help Modal */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="bg-white rounded-[22px] max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            style={{ boxShadow: 'var(--sh-overlay)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white px-7 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <h2 className="flex items-center gap-2 text-[18px] font-bold text-[#1d1d1f] tracking-[-0.02em]">
                <BookOpen className="w-5 h-5 text-[#0071e3]" />
                <span>系统使用指南</span>
              </h2>
              <button
                onClick={() => setHelpOpen(false)}
                className="p-1.5 rounded-full text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-7 py-6 space-y-7">
              {/* Role-based guide */}
              <section>
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#1d1d1f] mb-3">
                  <Shield className="w-4 h-4 text-[#0071e3]" />
                  <span>角色与权限</span>
                </h3>
                <div className="space-y-2 text-[13px] text-[#424245] leading-[1.7]">
                  <div className="flex gap-3"><span className="font-semibold text-[#1d1d1f] shrink-0 w-28">超级管理员</span><span className="text-[#6e6e73]">全局只读视图，可管理机构与用户，不可填报或签收</span></div>
                  <div className="flex gap-3"><span className="font-semibold text-[#1d1d1f] shrink-0 w-28">部门报表管理员</span><span className="text-[#6e6e73]">设计模板、下发任务、签收报表、查看汇总（仅限本部门）</span></div>
                  <div className="flex gap-3"><span className="font-semibold text-[#1d1d1f] shrink-0 w-28">分公司经办人</span><span className="text-[#6e6e73]">填写并提交报表数据</span></div>
                  <div className="flex gap-3"><span className="font-semibold text-[#1d1d1f] shrink-0 w-28">复核人 / 审批人</span><span className="text-[#6e6e73]">查看填报信息，进行审批操作（不可填报）</span></div>
                </div>
              </section>

              {/* Workflow */}
              <section>
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#1d1d1f] mb-3">
                  <Workflow className="w-4 h-4 text-[#0071e3]" />
                  <span>三级审批流程</span>
                </h3>
                <div className="bg-[#f5f5f7] rounded-[14px] p-4 space-y-2 text-[13px]">
                  {[
                    { step: '1', label: '经办人填报', desc: '分公司经办人填写报表数据并提交' },
                    { step: '2', label: '复核人审核', desc: '复核人检查数据准确性，通过或退回' },
                    { step: '3', label: '审批人终审', desc: '审批人最终确认，通过后流转至发起部门' },
                    { step: '4', label: '部门签收', desc: '发起部门确认接收已审批的报表' },
                  ].map((s) => (
                    <div key={s.step} className="flex items-start gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-[#0071e3] text-white text-[11px] font-bold flex items-center justify-center tabular-nums">{s.step}</span>
                      <div>
                        <span className="font-semibold text-[#1d1d1f]">{s.label}</span>
                        <span className="text-[#6e6e73] ml-2">{s.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[12px] text-[#86868b] mt-2">退回的报表可修改后重新提交，流程从头开始</p>
              </section>

              {/* HQ guide */}
              {isHQ && (
                <section>
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#1d1d1f] mb-3">
                    <FileSpreadsheet className="w-4 h-4 text-[#0071e3]" />
                    <span>总部/部门操作指南</span>
                  </h3>
                  <div className="space-y-3 text-[13px] text-[#424245] leading-[1.7]">
                    <div className="apple-row px-4 py-3 bg-[#f5f5f7] rounded-[12px]">
                      <div className="font-semibold text-[#1d1d1f] mb-1">模板管理</div>
                      <div className="text-[#6e6e73]">在「模板管理」页面创建报表模板，支持文本、数字、日期、下拉选择、多行文本及二维交叉表字段。模板发布后方可下发。</div>
                    </div>
                    <div className="apple-row px-4 py-3 bg-[#f5f5f7] rounded-[12px]">
                      <div className="font-semibold text-[#1d1d1f] mb-1">下发任务</div>
                      <div className="text-[#6e6e73]">在「下发管理」页面选择已发布模板，指定目标分公司、周期与截止日期。支持「一次性下发」用于补充调查场景（不受周期去重约束）。</div>
                    </div>
                    <div className="apple-row px-4 py-3 bg-[#f5f5f7] rounded-[12px]">
                      <div className="font-semibold text-[#1d1d1f] mb-1">强制收回</div>
                      <div className="text-[#6e6e73]">在「下发管理」列表中，对未汇总的任务可执行「收回」操作。收回后任务终止，审批记录自动取消，需填写收回原因。</div>
                    </div>
                    <div className="apple-row px-4 py-3 bg-[#f5f5f7] rounded-[12px]">
                      <div className="font-semibold text-[#1d1d1f] mb-1">签收报表</div>
                      <div className="text-[#6e6e73]">在工作台「待签收任务」区块查看已审批的报表，确认后签收或退回。退回需填写原因。</div>
                    </div>
                    <div className="apple-row px-4 py-3 bg-[#f5f5f7] rounded-[12px]">
                      <div className="font-semibold text-[#1d1d1f] mb-1">汇总报表</div>
                      <div className="text-[#6e6e73]">在「汇总报表」页面查看多机构对比、明细数据与填报进度，支持导出 Excel（含机构对比、明细、进度三张表）。</div>
                    </div>
                  </div>
                </section>
              )}

              {/* Branch guide */}
              {!isHQ && (
                <section>
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#1d1d1f] mb-3">
                    <FileSpreadsheet className="w-4 h-4 text-[#0071e3]" />
                    <span>分公司操作指南</span>
                  </h3>
                  <div className="space-y-3 text-[13px] text-[#424245] leading-[1.7]">
                    <div className="apple-row px-4 py-3 bg-[#f5f5f7] rounded-[12px]">
                      <div className="font-semibold text-[#1d1d1f] mb-1">报表填报</div>
                      <div className="text-[#6e6e73]">在「报表填报」页面查看收到的下发任务，点击进入填报。支持汇总指标和明细行填写，交叉表可编辑单元格。</div>
                    </div>
                    <div className="apple-row px-4 py-3 bg-[#f5f5f7] rounded-[12px]">
                      <div className="font-semibold text-[#1d1d1f] mb-1">审批流程</div>
                      <div className="text-[#6e6e73]">经办人提交后，复核人和审批人依次在「审批中心」处理。可查看填报详情并附审批意见。退回后经办人可修改重提。</div>
                    </div>
                  </div>
                </section>
              )}

              {/* Tips */}
              <section>
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#1d1d1f] mb-3">
                  <Zap className="w-4 h-4 text-[#0071e3]" />
                  <span>使用提示</span>
                </h3>
                <ul className="space-y-2 text-[13px] text-[#6e6e73] leading-[1.7] list-disc pl-5">
                  <li>退回的报表可在原任务页面直接修改并重新提交</li>
                  <li>已签收的报表状态为「已签收」，可在汇总报表中查看</li>
                  <li>逾期任务会在列表中标记「已逾期」</li>
                  <li>一次性下发的任务会标注「⚡ 一次性」徽章</li>
                  <li>汇总报表仅统计已审批通过的填报数据</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-[60] px-5 py-3 rounded-full text-[13px] font-semibold text-white ${toast.type === 'error' ? 'bg-[#ff6b00]' : 'bg-[#1d1d1f]'}`}
          style={{ boxShadow: 'var(--sh-lift)' }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};
