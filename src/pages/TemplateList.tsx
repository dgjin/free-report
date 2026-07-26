import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  Plus,
  Send,
  Edit,
  Sliders,
  Calendar,
  Layers,
  X,
  CheckCircle,
  Building2,
  ListPlus,
  Power,
  RotateCcw,
} from '../components/icons';
import { api, useTemplates, useAssignmentTargets } from '../services/api';
import { toast, confirmDialog } from '../utils/toast';
import { ReportTemplate } from '../types';
import { getInitialTemplateFields } from '../utils/templateFields';
import { getTemplateLifecycleView } from '../utils/templateLifecycle';
import { mutate } from 'swr';

export const TemplateList: React.FC = () => {
  const { data: templates = [], isLoading: loading, mutate: reloadTemplates } = useTemplates();
  const { data: branches = [] } = useAssignmentTargets();

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [assignModalOpen, setAssignModalOpen] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);

  // Create Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [periodType, setPeriodType] = useState('monthly');

  // Assign Form State
  const [assignTitle, setAssignTitle] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);
  const [isOneTime, setIsOneTime] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [lifecycleActionId, setLifecycleActionId] = useState<number | null>(null);
  const lifecycleActionIdRef = useRef<number | null>(null);

  const navigate = useNavigate();

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast('请输入模板名称', 'error');

    try {
      const res = await api.createTemplate({
        name,
        description,
        period_type: periodType,
        fields: getInitialTemplateFields(),
      });
      setCreateModalOpen(false);
      setName('');
      setDescription('');
      navigate(`/templates/${res.template.id}`);
    } catch (err: any) {
      toast(err.message || '创建失败', 'error');
    }
  };

  const openAssignModal = (t: ReportTemplate) => {
    setSelectedTemplate(t);
    setAssignTitle(`${new Date().getFullYear()}年${new Date().getMonth() + 1}月${t.name}`);
    setPeriodLabel(`${new Date().getFullYear()}年${String(new Date().getMonth() + 1).padStart(2, '0')}月`);
    setIsOneTime(false);

    // Default deadline 7 days from today
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setDeadline(d);
    setSelectedBranchIds(branches.map((b) => b.id)); // select all branches by default
    setAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    if (selectedBranchIds.length === 0) return toast('请至少选择一个目标分公司', 'error');
    if (!assignTitle || !deadline) return toast('请填写下发标题和截止日期', 'error');

    setAssigning(true);
    try {
      const res = await api.assignTemplate(
        selectedTemplate.id,
        selectedBranchIds,
        assignTitle,
        periodLabel,
        deadline,
        isOneTime,
      );
      toast(res.message, 'success');
      setAssignModalOpen(false);
      await reloadTemplates();
      await mutate('/api/assignments');
    } catch (err: any) {
      toast(err.message || '下发失败', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const toggleBranchSelect = (id: number) => {
    if (selectedBranchIds.includes(id)) {
      setSelectedBranchIds(selectedBranchIds.filter((bId) => bId !== id));
    } else {
      setSelectedBranchIds([...selectedBranchIds, id]);
    }
  };

  const handleTemplateLifecycle = async (t: ReportTemplate) => {
    const lifecycle = getTemplateLifecycleView(t.status);
    if (lifecycleActionIdRef.current !== null || !lifecycle.canTransition) return;
    if (!lifecycle.isArchived && !(await confirmDialog('停用后不能编辑或新下发，历史任务和数据不受影响。确认停用？'))) {
      return;
    }

    lifecycleActionIdRef.current = t.id;
    setLifecycleActionId(t.id);
    try {
      const res = await (lifecycle.isArchived ? api.enableTemplate(t.id) : api.disableTemplate(t.id));
      toast(res.message, 'success');
      await reloadTemplates();
    } catch (err: any) {
      toast(err.message || (lifecycle.isArchived ? '重新启用失败' : '停用失败'), 'error');
    } finally {
      lifecycleActionIdRef.current = null;
      setLifecycleActionId(null);
    }
  };

  const periodLabels: Record<string, string> = {
    daily: '日度报表',
    weekly: '周度报表',
    monthly: '月度报表',
    quarterly: '季度报表',
    yearly: '年度报表',
    custom: '自定义周期',
  };

  return (
    <div className="reveal max-w-[1080px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="t-serif text-[32px] text-ink">
            报表模板库
          </h1>
          <p className="text-sm text-mute mt-1.5 tracking-[-0.01em] max-w-xl">
            定义汇总与明细字段结构，设置只增不减字段设计规则，下发至各分公司。
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="h-11 px-5 bg-ink hover:bg-inkhover text-white font-medium text-sm rounded-md transition-colors flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>新建报表模板</span>
        </button>
      </div>

      {/* Templates List — unified panel with hairline dividers */}
      {loading ? (
        <div className="py-16 text-center text-sm text-mute">加载模板数据中...</div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-[12px] py-16 text-center" style={{ boxShadow: 'var(--sh-card)' }}>
          <FileSpreadsheet className="w-10 h-10 text-line mx-auto mb-3" />
          <div className="text-sm font-medium text-ink">暂无报表模板</div>
          <p className="text-xs text-mute mt-1">请点击右上角新建首个模板</p>
        </div>
      ) : (
        <div className="bg-white rounded-[12px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
          {templates.map((t) => {
            const lifecycle = getTemplateLifecycleView(t.status);
            return (
              <div key={t.id} className="apple-row px-6 py-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 bg-canvas text-body text-[11px] font-medium rounded-full">
                        {periodLabels[t.period_type] || t.period_type}
                      </span>
                      <span
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-full ${
                          lifecycle.isArchived
                            ? 'text-mute bg-line'
                            : lifecycle.canWrite
                              ? 'text-ink bg-line'
                              : 'text-mute bg-line'
                        }`}
                      >
                        {lifecycle.statusLabel}
                      </span>
                      <span className="text-[11px] text-faint tabular-nums">ID #{t.id}</span>
                    </div>

                    <h3 className="text-base font-semibold text-ink tracking-[-0.01em]">{t.name}</h3>
                    <p className="text-xs text-mute line-clamp-2">{t.description || '暂无描述信息'}</p>

                    <div className="flex items-center gap-4 pt-1 text-xs text-mute">
                      <div className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-faint" />
                        <span className="tabular-nums">{t.field_count || 0} 个表单字段</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-faint" />
                        <span className="tabular-nums">{t.assignment_count || 0} 次历史下发</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      onClick={() => navigate(`/templates/${t.id}`)}
                      className="h-9 px-4 bg-canvas hover:bg-line text-ink font-medium text-xs rounded-md transition-colors flex items-center gap-1.5"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>设计字段</span>
                    </button>

                    <button
                      onClick={() => openAssignModal(t)}
                      disabled={!lifecycle.canWrite}
                      className="h-9 px-4 bg-ink hover:bg-inkhover text-white font-medium text-xs rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>按周期下发</span>
                    </button>

                    {lifecycle.canTransition && (
                      <button
                        onClick={() => handleTemplateLifecycle(t)}
                        disabled={lifecycleActionId !== null}
                        aria-busy={lifecycleActionId === t.id}
                        className="h-9 px-4 bg-canvas hover:bg-line text-body font-medium text-xs rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-wait focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
                      >
                        {lifecycle.isArchived ? (
                          <RotateCcw className="w-3.5 h-3.5" />
                        ) : (
                          <Power className="w-3.5 h-3.5" />
                        )}
                        <span>{lifecycle.actionLabel}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Template Modal */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.3)' }}
        >
          <div
            className="bg-white rounded-[12px] max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150"
            style={{ boxShadow: 'var(--sh-overlay)' }}
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-base font-semibold text-ink tracking-[-0.01em] flex items-center gap-2">
                <Plus className="w-4 h-4 text-ink" />
                <span>创建全新报表模板</span>
              </h2>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-mute hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-body mb-1.5">
                  模板名称 <span className="text-[#9F2F2D]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如: 2026年季度财务运营与资产核查表"
                  className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink placeholder:text-faint focus:outline-none focus:border-ink focus:ring-1 focus:ring-[rgba(17,17,17,0.2)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-body mb-1.5">模板说明描述</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="简要说明本报表各分公司需要填报的重点指标及依据"
                  className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink placeholder:text-faint focus:outline-none focus:border-ink focus:ring-1 focus:ring-[rgba(17,17,17,0.2)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-body mb-1.5">填报周期类别</label>
                <select
                  value={periodType}
                  onChange={(e) => setPeriodType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink focus:outline-none focus:border-ink focus:ring-1 focus:ring-[rgba(17,17,17,0.2)]"
                >
                  <option value="daily">日度报表 (Daily)</option>
                  <option value="weekly">周度报表 (Weekly)</option>
                  <option value="monthly">月度报表 (Monthly)</option>
                  <option value="quarterly">季度报表 (Quarterly)</option>
                  <option value="yearly">年度报表 (Yearly)</option>
                  <option value="custom">自定义周期 (Custom)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-line flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="h-10 px-5 bg-canvas hover:bg-line text-ink font-medium text-sm rounded-md transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-ink hover:bg-inkhover text-white font-medium text-sm rounded-md transition-colors"
                >
                  确认并进入字段构建器
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Template Modal */}
      {assignModalOpen && selectedTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.3)' }}
        >
          <div
            className="bg-white rounded-[12px] max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: 'var(--sh-overlay)' }}
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-semibold text-ink tracking-[-0.01em] flex items-center gap-2">
                  <Send className="w-4 h-4 text-ink" />
                  <span>下发报表任务</span>
                </h2>
                <div className="text-xs text-mute mt-0.5">模板: {selectedTemplate.name}</div>
              </div>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="text-mute hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-body mb-1.5">下发标题</label>
                <input
                  type="text"
                  required
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink focus:outline-none focus:border-ink focus:ring-1 focus:ring-[rgba(17,17,17,0.2)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-body mb-1.5">周期标签</label>
                  <input
                    type="text"
                    required
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    placeholder="如: 2026年07月"
                    className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink placeholder:text-faint focus:outline-none focus:border-ink focus:ring-1 focus:ring-[rgba(17,17,17,0.2)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-body mb-1.5">填报截止时间</label>
                  <input
                    type="date"
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink focus:outline-none focus:border-ink focus:ring-1 focus:ring-[rgba(17,17,17,0.2)]"
                  />
                </div>
              </div>

              <div>
                <label
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[12px] cursor-pointer border transition-colors ${
                    isOneTime
                      ? 'bg-[rgba(17,17,17,0.06)] border-[rgba(17,17,17,0.25)]'
                      : 'bg-canvas border-line hover:bg-hoverbg'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isOneTime}
                    onChange={(e) => setIsOneTime(e.target.checked)}
                    className="w-4 h-4 accent-ink cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                      一次性下发
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold text-ink bg-[rgba(17,17,17,0.08)]">不受周期约束</span>
                    </div>
                    <div className="text-xs text-mute mt-0.5">
                      勾选后可对同一分公司、同一周期重复下发，适用于补充调查或临时加报场景
                    </div>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-body mb-2">选择接收分公司</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto p-3 bg-canvas rounded-[12px] border border-line">
                  {branches.map((b) => {
                    const checked = selectedBranchIds.includes(b.id);
                    return (
                      <div
                        key={b.id}
                        onClick={() => toggleBranchSelect(b.id)}
                        className={`px-3 py-2 rounded-[10px] text-xs flex items-center justify-between cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-[rgba(17,17,17,0.08)] border-[rgba(17,17,17,0.25)] text-ink font-medium'
                            : 'bg-white border-line text-body hover:bg-hoverbg'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-mute" />
                          <span>{b.name} ({b.code})</span>
                        </div>
                        {checked && <CheckCircle className="w-4 h-4 text-ink" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-line flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="h-10 px-5 bg-canvas hover:bg-line text-ink font-medium text-sm rounded-md transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="h-10 px-5 bg-ink hover:bg-inkhover text-white font-medium text-sm rounded-md transition-colors disabled:opacity-50"
                >
                  {assigning ? '下发处理中...' : '确认下发任务'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
