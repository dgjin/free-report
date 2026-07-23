import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { api } from '../services/api';
import { ReportTemplate, Company } from '../types';
import { getInitialTemplateFields } from '../utils/templateFields';
import { getTemplateLifecycleView } from '../utils/templateLifecycle';

export const TemplateList: React.FC = () => {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [branches, setBranches] = useState<Company[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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
  const [assigning, setAssigning] = useState(false);
  const [lifecycleActionId, setLifecycleActionId] = useState<number | null>(null);
  const lifecycleActionIdRef = useRef<number | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const [tList, bList] = await Promise.all([api.getTemplates(), api.getAssignmentTargets()]);
      setTemplates(tList);
      setBranches(bList);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('请输入模板名称');

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
      alert(err.message || '创建失败');
    }
  };

  const openAssignModal = (t: ReportTemplate) => {
    setSelectedTemplate(t);
    setAssignTitle(`${new Date().getFullYear()}年${new Date().getMonth() + 1}月${t.name}`);
    setPeriodLabel(`${new Date().getFullYear()}年${String(new Date().getMonth() + 1).padStart(2, '0')}月`);
    
    // Default deadline 7 days from today
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setDeadline(d);
    setSelectedBranchIds(branches.map((b) => b.id)); // select all branches by default
    setAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    if (selectedBranchIds.length === 0) return alert('请至少选择一个目标分公司');
    if (!assignTitle || !deadline) return alert('请填写下发标题和截止日期');

    setAssigning(true);
    try {
      const res = await api.assignTemplate(
        selectedTemplate.id,
        selectedBranchIds,
        assignTitle,
        periodLabel,
        deadline
      );
      alert(res.message);
      setAssignModalOpen(false);
      loadTemplates();
    } catch (err: any) {
      alert(err.message || '下发失败');
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
    if (!lifecycle.isArchived && !confirm('停用后不能编辑或新下发，历史任务和数据不受影响。确认停用？')) {
      return;
    }

    lifecycleActionIdRef.current = t.id;
    setLifecycleActionId(t.id);
    try {
      const res = await (lifecycle.isArchived ? api.enableTemplate(t.id) : api.disableTemplate(t.id));
      alert(res.message);
      await loadTemplates();
    } catch (err: any) {
      alert(err.message || (lifecycle.isArchived ? '重新启用失败' : '停用失败'));
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <span>报表模板库</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            定义汇总与明细字段结构，设置只增不减字段设计规则，下发至各分公司。
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Plus className="w-4 h-4" />
          <span>新建报表模板</span>
        </button>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">加载模板数据中...</div>
      ) : templates.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-bold text-slate-700">暂无报表模板</div>
          <p className="text-xs text-slate-400 mt-1">请点击右上角新建首个模板</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map((t) => {
            const lifecycle = getTemplateLifecycleView(t.status);
            return (
              <div
                key={t.id}
                className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 ${
                  lifecycle.isArchived ? 'bg-slate-50 border-slate-300' : 'bg-white border-slate-200/80'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-lg border border-blue-100">
                        {periodLabels[t.period_type] || t.period_type}
                      </span>
                      <span
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border ${
                          lifecycle.isArchived
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : lifecycle.canWrite
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {lifecycle.statusLabel}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">ID: #{t.id}</span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">{t.name}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2">{t.description || '暂无描述信息'}</p>

                  <div className="pt-2 flex items-center space-x-4 text-xs text-slate-500">
                    <div className="flex items-center space-x-1">
                      <Sliders className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t.field_count || 0} 个表单字段</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Send className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t.assignment_count || 0} 次历史下发</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => navigate(`/templates/${t.id}`)}
                    className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-colors flex items-center justify-center space-x-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                  >
                    <Sliders className="w-3.5 h-3.5 text-slate-500" />
                    <span>设计字段</span>
                  </button>

                  <button
                    onClick={() => openAssignModal(t)}
                    disabled={!lifecycle.canWrite}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl transition-colors shadow-sm flex items-center justify-center space-x-1.5 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>按周期下发</span>
                  </button>

                  {lifecycle.canTransition && (
                    <button
                      onClick={() => handleTemplateLifecycle(t)}
                      disabled={lifecycleActionId !== null}
                      aria-busy={lifecycleActionId === t.id}
                      className={`flex-1 py-2 font-semibold text-xs rounded-xl border transition-colors flex items-center justify-center space-x-1.5 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                        lifecycle.isArchived
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 focus-visible:ring-emerald-500'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 focus-visible:ring-amber-500'
                      }`}
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
            );
          })}
        </div>
      )}

      {/* Create Template Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>创建全新报表模板</span>
              </h2>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  模板名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如: 2026年季度财务运营与资产核查表"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">模板说明描述</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="简要说明本报表各分公司需要填报的重点指标及依据"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">填报周期类别</label>
                <select
                  value={periodType}
                  onChange={(e) => setPeriodType(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
                >
                  <option value="daily">日度报表 (Daily)</option>
                  <option value="weekly">周度报表 (Weekly)</option>
                  <option value="monthly">月度报表 (Monthly)</option>
                  <option value="quarterly">季度报表 (Quarterly)</option>
                  <option value="yearly">年度报表 (Yearly)</option>
                  <option value="custom">自定义周期 (Custom)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 shadow-sm"
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <Send className="w-4 h-4 text-blue-600" />
                  <span>下发报表任务</span>
                </h2>
                <div className="text-xs text-slate-500 mt-0.5">模板: {selectedTemplate.name}</div>
              </div>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">下发标题</label>
                <input
                  type="text"
                  required
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">周期标签</label>
                  <input
                    type="text"
                    required
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    placeholder="如: 2026年07月"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">填报截止时间</label>
                  <input
                    type="date"
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">选择接收分公司</label>
                <div className="space-y-2 max-h-40 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200">
                  {branches.map((b) => {
                    const checked = selectedBranchIds.includes(b.id);
                    return (
                      <div
                        key={b.id}
                        onClick={() => toggleBranchSelect(b.id)}
                        className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-blue-50 border-blue-200 text-blue-800 font-semibold'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{b.name} ({b.code})</span>
                        </div>
                        {checked && <CheckCircle className="w-4 h-4 text-blue-600" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="px-4 py-2 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 shadow-sm disabled:opacity-50"
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
