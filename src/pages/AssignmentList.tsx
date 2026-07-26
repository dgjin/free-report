import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Calendar, Search, X, Building2, RotateCcw, Zap } from '../components/icons';
import { getStoredUser, useAssignments, api } from '../services/api';
import { toast } from '../utils/toast';
import { UserInfo } from '../types';
import { getClientAccess } from '../utils/access';
import {
  classifyAssignment,
  getAssignmentOverview,
  filterOperationAssignments,
  groupAssignmentProgress,
  OperationBucket,
} from '../utils/reportOperations';
import { mutate } from 'swr';

export const AssignmentList: React.FC = () => {
  const { data: assignments = [], isLoading: loading } = useAssignments();
  const [user, setUser] = useState<UserInfo | null>(getStoredUser());
  const navigate = useNavigate();
  const [query, setQuery] = useState<string>('');
  const [bucket, setBucket] = useState<OperationBucket | 'actionable' | 'all'>('all');
  const [templateFilter, setTemplateFilter] = useState<number | 'all'>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');

  // Recall state
  const [recallId, setRecallId] = useState<number | null>(null);
  const [recallReason, setRecallReason] = useState('');
  const [recalling, setRecalling] = useState(false);

  const handleRecall = async () => {
    if (!recallId) return;
    if (!recallReason.trim()) return toast('请填写收回原因', 'error');
    setRecalling(true);
    try {
      await api.recallAssignment(recallId, recallReason);
      toast('任务已强制收回', 'success');
      setRecallId(null);
      setRecallReason('');
      await mutate('/api/assignments');
    } catch (err: any) {
      toast(err.message || '收回失败', 'error');
    } finally {
      setRecalling(false);
    }
  };

  const today = new Date();
  const overview = getAssignmentOverview(assignments, today);
  const progressGroups = groupAssignmentProgress(assignments);
  const uniqueTemplates: typeof assignments = [...new Map(assignments.map((a) => [a.template_id, a])).values()];
  const uniquePeriods = [...new Set(assignments.map((a) => a.period_label))].sort().reverse();

  const bucketConfig: Record<OperationBucket, { label: string; colorClass: string }> = {
    abnormal: { label: '异常', colorClass: 'text-[#9F2F2D] bg-[#FDEBEC]' },
    pending_fill: { label: '待填报', colorClass: 'text-ink bg-[rgba(17,17,17,0.08)]' },
    pending_receipt: { label: '待签收', colorClass: 'text-mute bg-line' },
    completed: { label: '已完成', colorClass: 'text-ink bg-line' },
  };

  const filtered = filterOperationAssignments(assignments, { query, bucket, templateId: templateFilter, periodLabel: periodFilter }, today);
  const isHQ = user?.role === 'department_report_admin' || user?.role === 'super_admin';
  const canFill = user ? getClientAccess(user).canFill : false;
return (
    <div className="reveal max-w-[1080px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="t-serif text-[32px] text-ink">
          下发管理与状态跟进
        </h1>
        <p className="text-sm text-mute mt-1.5 tracking-[-0.01em]">
          实时监控各分公司周期报表下发进度，快速发现并处理异常。
        </p>
      </div>

      {/* Status Overview — unified panel with hairline dividers */}
      <div
        className="bg-white rounded-[12px] overflow-hidden grid grid-cols-2 sm:grid-cols-4"
        style={{ boxShadow: 'var(--sh-panel)' }}
      >
        {(["abnormal", "pending_fill", "pending_receipt", "completed"] as OperationBucket[]).map((b, idx) => {
          const count = overview[b];
          const { label } = bucketConfig[b];
          const isActive = bucket === b;
          const borderCls =
            idx === 0
              ? ''
              : idx === 1
                ? 'border-l border-line'
                : idx === 2
                  ? 'border-t border-l sm:border-t-0 border-line'
                  : 'border-t border-l sm:border-t-0 border-line';
          return (
            <button
              key={b}
              onClick={() => setBucket(bucket === b ? 'all' : b)}
              className={`p-4 sm:p-5 text-center transition-colors ${borderCls} ${
                isActive ? 'bg-canvas' : 'bg-white hover:bg-hoverbg'
              }`}
            >
              <div
                className={`text-xl sm:text-2xl font-semibold tabular-nums tracking-[-0.01em] ${
                  b === 'abnormal' ? 'text-[#9F2F2D]' : 'text-ink'
                }`}
              >
                {count}
              </div>
              <div className="text-xs mt-1 text-mute whitespace-nowrap">{label}</div>
            </button>
          );
        })}
      </div>

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
          <input
            type="text"
            placeholder="搜索报表名称、任务标题、机构、编码..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-10 pr-9 h-10 bg-white border border-line rounded-full text-sm text-ink placeholder:text-faint focus:outline-none focus:border-ink focus:ring-1 focus:ring-[rgba(17,17,17,0.2)]"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-faint" />
            </button>
          )}
        </div>
        {uniqueTemplates.length > 1 && (
          <select
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
            className="h-10 px-4 text-sm bg-white border border-line rounded-full text-ink focus:outline-none focus:border-ink"
          >
            <option value="all">全部报表</option>
            {uniqueTemplates.map((t) => (<option key={t.template_id} value={t.template_id}>{t.template_name}</option>))}
          </select>
        )}
        {uniquePeriods.length > 1 && (
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="h-10 px-4 text-sm bg-white border border-line rounded-full text-ink focus:outline-none focus:border-ink"
          >
            <option value="all">全部周期</option>
            {uniquePeriods.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        )}
      </div>

      {/* Task Table — unified panel with hairline dividers */}
      {loading ? (
        <div className="py-16 text-center text-sm text-mute">加载下发任务列表中...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[12px] py-16 text-center" style={{ boxShadow: 'var(--sh-card)' }}>
          <Send className="w-10 h-10 text-line mx-auto mb-3" />
          <div className="text-sm font-medium text-ink">暂无匹配的下发任务</div>
          <p className="text-xs text-mute mt-1">当前筛选条件下没有结果。</p>
        </div>
      ) : (
        <div className="bg-white rounded-[12px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
          {/* Desktop Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-[11px] font-medium text-mute border-b border-line">
            <div className="col-span-2">状态</div>
            <div className="col-span-2">机构</div>
            <div className="col-span-2">报表/周期</div>
            <div className="col-span-2">截止日期</div>
            <div className="col-span-2">下发标题</div>
            <div className="col-span-2 text-right">操作</div>
          </div>
          {filtered.map((item) => {
            const bucket = classifyAssignment(item, today);
            const isAbnormal = bucket === 'abnormal';
            const submitted = ['submitted', 'pending_receipt', 'received', 'aggregated'].includes(item.status);
            return (
              <div
                key={item.id}
                className={`apple-row md:grid md:grid-cols-12 md:gap-4 md:px-6 md:py-4 flex flex-col gap-2 ${isAbnormal ? 'bg-[#FDEBEC]' : ''}`}
              >
                <div className="hidden md:block col-span-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${item.status === 'recalled' ? 'text-[#9F2F2D] bg-[#FDEBEC]' : bucketConfig[bucket].colorClass}`}>
                    {item.status === 'recalled' ? '已收回' : bucketConfig[bucket].label}
                  </span>
                  {!!item.is_one_time && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-ink bg-[rgba(17,17,17,0.08)] inline-flex items-center gap-0.5 whitespace-nowrap">
                      <Zap className="w-2 h-2" />
                      一次性
                    </span>
                  )}
                </div>
                <div className="hidden md:block col-span-2">
                  <div className="text-sm font-medium text-ink">{item.company_name}</div>
                  <div className="text-xs text-mute tabular-nums">{item.company_code}</div>
                </div>
                <div className="hidden md:block col-span-2">
                  <div className="text-sm text-ink font-medium">{item.template_name}</div>
                  <div className="text-xs text-mute">{item.period_label}</div>
                </div>
                <div className="hidden md:block col-span-2">
                  <div className="flex items-center gap-1.5">
                    <Calendar className={`w-3.5 h-3.5 ${isAbnormal ? 'text-[#9F2F2D]' : 'text-faint'}`} />
                    <span className={`text-sm tabular-nums ${isAbnormal ? 'text-[#9F2F2D] font-medium' : 'text-body'}`}>{item.deadline}</span>
                  </div>
                </div>
                <div className="hidden md:block col-span-2">
                  <span className="text-sm text-ink">{item.title}</span>
                  {item.issuer_department_name && (
                    <div className="text-xs text-mute flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3" />
                      <span>{item.issuer_department_name}</span>
                    </div>
                  )}
                </div>
                <div className="hidden md:block col-span-2 flex justify-end gap-2">
                  {isHQ ? (
                    <>
                      <button
                        onClick={() => navigate(`/aggregation?template_id=${item.template_id}&period_label=${item.period_label}`)}
                        className="h-8 px-3.5 text-xs font-medium bg-canvas hover:bg-line text-ink rounded-full transition-colors"
                      >
                        查看详情
                      </button>
                      {item.status !== 'recalled' && item.status !== 'aggregated' && (
                        <button
                          onClick={() => { setRecallId(item.id); setRecallReason(''); }}
                          className="h-8 px-3.5 text-xs font-medium text-[#9F2F2D] bg-[#FDEBEC] hover:bg-[#FDEBEC] rounded-full transition-colors flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>收回</span>
                        </button>
                      )}
                    </>
                  ) : canFill ? (
                    <button
                      onClick={() => navigate(`/fill/${item.id}`)}
                      className={`h-8 px-3.5 text-xs font-medium rounded-full transition-colors ${
                        submitted
                          ? 'bg-canvas hover:bg-line text-mute'
                          : 'bg-ink hover:bg-inkhover text-white'
                      }`}
                    >
                      {submitted ? '已提交' : '填报'}
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate(`/fill/${item.id}`)}
                      className="h-8 px-3.5 text-xs font-medium bg-canvas hover:bg-line text-ink rounded-full transition-colors"
                    >
                      查看详情
                    </button>
                  )}
                </div>
                <div className="md:hidden flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink truncate">{item.title}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 whitespace-nowrap ${item.status === 'recalled' ? 'text-[#9F2F2D] bg-[#FDEBEC]' : bucketConfig[bucket].colorClass}`}>
                      {item.status === 'recalled' ? '已收回' : bucketConfig[bucket].label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-mute">
                    <span className="flex items-center gap-2 truncate">
                      <span className="truncate">{item.template_name}</span>
                      {item.issuer_department_name && (
                        <span className="inline-flex items-center text-mute shrink-0">
                          <Building2 className="w-3 h-3 mr-0.5" />
                          {item.issuer_department_name}
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums shrink-0">{item.deadline}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Progress — unified panel with hairline dividers */}
      {progressGroups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink tracking-[-0.01em] px-1">报表进度</h2>
          <div className="bg-white rounded-[12px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
            {progressGroups.map((g) => {
              const pct = g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0;
              return (
                <div key={g.key} className="apple-row px-6 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink tracking-[-0.01em] truncate">{g.templateName}</div>
                      <div className="text-xs text-mute mt-0.5">{g.periodLabel}</div>
                    </div>
                    <button
                      onClick={() => navigate(`/aggregation?template_id=${g.templateId}&period_label=${g.periodLabel}`)}
                      className="text-xs font-medium text-ink hover:underline shrink-0"
                    >
                      查看汇总
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex-1 h-1.5 bg-canvas rounded-full overflow-hidden">
                      <div className="h-full bg-ink rounded-full" style={{ width: pct + '%' }} />
                    </div>
                    <span className="text-xs font-semibold text-body tabular-nums w-10 text-right">{pct}%</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-mute">
                    <span className="tabular-nums">共 {g.total} 家</span>
                    {g.abnormal > 0 && <span className="text-[#9F2F2D] tabular-nums">{g.abnormal} 异常</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recall Confirmation Modal */}
      {recallId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.3)' }}
        >
          <div
            className="bg-white rounded-[12px] max-w-md w-full p-6 space-y-5"
            style={{ boxShadow: 'var(--sh-overlay)' }}
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-semibold text-ink tracking-[-0.01em] flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[#9F2F2D]" />
                <span>强制收回任务</span>
              </h2>
              <button
                onClick={() => { setRecallId(null); setRecallReason(''); }}
                className="text-mute hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="px-3.5 py-2.5 rounded-[12px] text-[12px] text-[#9F2F2D]" style={{ background: '#FDEBEC', border: '1px solid #FDEBEC' }}>
                收回后，该任务将标记为"已收回"，分公司的填报和审批流程将终止。此操作不可撤销。
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-2">收回原因 <span className="text-[#9F2F2D]">*</span></label>
                <textarea
                  rows={3}
                  value={recallReason}
                  onChange={(e) => setRecallReason(e.target.value)}
                  placeholder="请说明收回原因，如：数据口径调整、任务取消、重新下发等..."
                  className="w-full px-3.5 py-2.5 bg-canvas rounded-[12px] text-[13px] text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-[#9F2F2D] focus:bg-white transition-all"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setRecallId(null); setRecallReason(''); }}
                  className="h-10 px-5 bg-canvas hover:bg-line text-ink font-medium text-sm rounded-md transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={recalling || !recallReason.trim()}
                  onClick={handleRecall}
                  className="h-10 px-5 bg-[#9F2F2D] hover:bg-[#e65a00] text-white font-medium text-sm rounded-full transition-colors disabled:opacity-50"
                >
                  {recalling ? '处理中...' : '确认收回'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
