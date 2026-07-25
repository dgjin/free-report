import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BarChart3, Building2, FileSpreadsheet, Download, Copy, RefreshCw, Calculator, TrendingUp, History, X, Clock, UserCheck, AlertCircle, CheckCircle2, FileDown, Grid3x3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../services/api';
import { AggregationResponse, ReportAssignment, ReportTemplate, ReportTemplateField, getSubmissionStatusLabel, APPROVED_SUBMISSION_STATUSES } from '../types';
import { AggregationTab, filterInstitutionRows, filterDetailRows, buildMetricCards, getUncountedInstitutionCount, buildProgressData } from '../utils/aggregationView';

// Status style mapping — grayscale + accent/heat only
const STATUS_STYLES: Record<string, string> = {
  received: 'text-[#1d1d1f] bg-[#e8e8ed]',
  pending_receipt: 'text-[#0071e3] bg-[rgba(0,113,227,0.08)]',
  pending_approval: 'text-[#0071e3] bg-[rgba(0,113,227,0.08)]',
  pending_review: 'text-[#0071e3] bg-[rgba(0,113,227,0.08)]',
  submitted: 'text-[#0071e3] bg-[rgba(0,113,227,0.08)]',
  draft: 'text-[#86868b] bg-[#f5f5f7]',
  returned: 'text-[#ff6b00] bg-[rgba(255,107,0,0.1)]',
  rejected: 'text-[#ff6b00] bg-[rgba(255,107,0,0.1)]',
};

const getStatusBadge = (status: string) => {
  const cls = STATUS_STYLES[status] || 'text-[#86868b] bg-[#f5f5f7]';
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${cls}`}>{getSubmissionStatusLabel(status)}</span>;
};

export const AggregationView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const templateIdParam = searchParams.get('template_id');
  const periodParam = searchParams.get('period_label');
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [assignments, setAssignments] = useState<ReportAssignment[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(templateIdParam ? parseInt(templateIdParam, 10) : 1);
  const [aggregationData, setAggregationData] = useState<AggregationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AggregationTab>('institutions');
  const [searchQuery, setSearchQuery] = useState('');
  const periods = useMemo(() => Array.from(new Set(assignments.filter((a) => a.template_id === selectedTemplateId).map((a) => a.period_label))).sort().reverse(), [assignments, selectedTemplateId]);
  const [selectedPeriod, setSelectedPeriod] = useState(periodParam || '');
  const effectivePeriod = useMemo(() => {
    if (periodParam && periods.includes(periodParam)) return periodParam;
    if (selectedPeriod && periods.includes(selectedPeriod)) return selectedPeriod;
    return periods[0] || '';
  }, [periods, periodParam, selectedPeriod]);

  // History modal
  const [historyData, setHistoryData] = useState<any[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => { loadInitialData(); }, []);
  useEffect(() => { if (selectedTemplateId && effectivePeriod) loadAggregation(selectedTemplateId, effectivePeriod); }, [selectedTemplateId, effectivePeriod]);

  const loadInitialData = async () => {
    try {
      const [tList, al] = await Promise.all([api.getTemplates(), api.getAssignments()]);
      setTemplates(tList);
      setAssignments(al);
      if (tList.length > 0 && !templateIdParam) setSelectedTemplateId(tList[0].id);
    } catch { /* ignore */ }
  };

  const loadAggregation = useCallback(async (tId: number, pl: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAggregationByTemplate(tId, pl);
      setAggregationData(data);
      setSearchParams({ template_id: tId.toString(), period_label: pl });
    } catch (e: any) {
      setError(e?.message || '加载汇总数据失败');
    } finally {
      setLoading(false);
    }
  }, [setSearchParams]);

  const [copied, setCopied] = useState(false);
  const copySummaryJSON = () => {
    if (!aggregationData) return;
    navigator.clipboard.writeText(JSON.stringify(aggregationData.summary, null, 2));
    setCopied(true);
    showToast('汇总指标已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  // Excel export
  const exportExcel = () => {
    if (!aggregationData) return;
    const wb = XLSX.utils.book_new();
    const templateName = aggregationData.template.name;

    // Sheet 1: 机构对比
    const instHeaders = ['机构名称', '机构编码', '提交状态', '版本', ...aggregationData.summary_fields.map((f) => f.field_label)];
    const instRows = aggregationData.company_data.map((c) => [
      c.company_name,
      c.company_code,
      getSubmissionStatusLabel(c.submission_status),
      c.submission_version || '-',
      ...aggregationData.summary_fields.map((f) => c.values[f.field_name] ?? '-'),
    ]);
    // Add summary row
    instRows.push(['合计/均值', '', '', '', ...aggregationData.summary_fields.map((f) => {
      const s = aggregationData.summary[f.field_name];
      return s ? `合计:${s.total} 均值:${s.average}` : '-';
    })]);
    const ws1 = XLSX.utils.aoa_to_sheet([instHeaders, ...instRows]);
    ws1['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, ...aggregationData.summary_fields.map(() => ({ wch: 14 }))];
    XLSX.utils.book_append_sheet(wb, ws1, '机构对比');

    // Sheet 2: 明细数据
    if (aggregationData.detail_fields.length > 0 && aggregationData.detail_rows.length > 0) {
      const detHeaders = ['机构名称', '行号', '提交状态', ...aggregationData.detail_fields.map((f) => f.field_label)];
      const detRows = aggregationData.detail_rows.map((r) => [
        r.company_name ?? '',
        r.row_index ?? '',
        getSubmissionStatusLabel(r.submission_status ?? ''),
        ...aggregationData.detail_fields.map((f) => r[f.field_name] ?? '-'),
      ]);
      const ws2 = XLSX.utils.aoa_to_sheet([detHeaders, ...detRows]);
      ws2['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 10 }, ...aggregationData.detail_fields.map(() => ({ wch: 14 }))];
      XLSX.utils.book_append_sheet(wb, ws2, '明细数据');
    }

    // Sheet 3: 填报进度
    const progHeaders = ['机构名称', '机构编码', '任务状态', '提交状态', '版本'];
    const progRows = aggregationData.company_data.map((c) => [
      c.company_name,
      c.company_code,
      c.assignment_status,
      getSubmissionStatusLabel(c.submission_status),
      c.submission_version || '-',
    ]);
    const ws3 = XLSX.utils.aoa_to_sheet([progHeaders, ...progRows]);
    ws3['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws3, '填报进度');

    const fileName = `${templateName}_${effectivePeriod}_汇总报表.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast('Excel 已导出');
  };

  // History
  const loadHistory = async () => {
    if (!selectedTemplateId) return;
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const data = await api.getAggregationHistory(selectedTemplateId);
      setHistoryData(data);
    } catch (e: any) {
      showToast(e?.message || '加载历史失败', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const metricCards = aggregationData ? buildMetricCards(aggregationData.summary_fields, aggregationData.summary) : [];
  const uncodedCount = aggregationData ? getUncountedInstitutionCount(aggregationData.company_data) : 0;
  const filteredInst = aggregationData ? filterInstitutionRows(aggregationData.company_data, searchQuery) : [];
  const filteredDet = aggregationData ? filterDetailRows(aggregationData.detail_rows, searchQuery) : [];
  const progressItems = aggregationData ? buildProgressData(aggregationData.company_data) : [];

  // Progress statistics
  const progressStats = useMemo(() => {
    if (!aggregationData) return { total: 0, submitted: 0, approved: 0, pending: 0, rate: 0 };
    const total = aggregationData.company_data.length;
    const submitted = aggregationData.company_data.filter((c) => c.has_submitted).length;
    const approved = aggregationData.company_data.filter((c) => APPROVED_SUBMISSION_STATUSES.includes(c.submission_status)).length;
    const pending = submitted - approved;
    const rate = total > 0 ? Math.round((submitted / total) * 100) : 0;
    return { total, submitted, approved, pending, rate };
  }, [aggregationData]);

  const tabs: Array<{ key: AggregationTab; label: string; icon: React.FC<any> }> = [
    { key: 'institutions', label: '机构对比', icon: Building2 },
    { key: 'details', label: '明细数据', icon: FileSpreadsheet },
    { key: 'matrix', label: '交叉表', icon: Grid3x3 },
    { key: 'progress', label: '填报进度', icon: TrendingUp },
  ];

  // Matrix groups from detail_fields with data_type matrix
  const matrixGroups = useMemo(() => {
    if (!aggregationData) return [];
    const groups: Array<{
      rowLabel: string;
      rowOptions: string[];
      columns: ReportTemplateField[];
    }> = [];
    const groupMap = new Map<string, number>();

    // Matrix fields are stored in detail_fields (they have data_type='matrix')
    // but the aggregation API only returns summary_fields and detail_fields.
    // Matrix fields with row_index > 0 are in detail_rows.
    // We need to extract matrix config from detail_fields if available.
    // Since the API may not separate matrix fields, we check field_config.
    const allFields = [...(aggregationData.summary_fields || []), ...(aggregationData.detail_fields || [])];

    allFields.forEach((field: any) => {
      const config = typeof field.field_config === 'string'
        ? JSON.parse(field.field_config || '{}')
        : field.field_config || {};
      const matrix = config.matrix;
      // 容错：跳过配置残缺的矩阵字段（缺少行维度定义）
      if (!matrix || !matrix.row_label) return;

      const key = matrix.row_label;
      if (!groupMap.has(key)) {
        groupMap.set(key, groups.length);
        groups.push({ rowLabel: key, rowOptions: matrix.row_options || [], columns: [] });
      }
      groups[groupMap.get(key)!].columns.push(field);
    });

    return groups;
  }, [aggregationData]);

  return (
    <div className="max-w-[1080px] mx-auto px-4 sm:px-[22px] py-[clamp(16px,3vw,28px)] space-y-4 sm:space-y-6">
      {/* Header — unified white panel */}
      <div className="bg-white rounded-[18px] sm:rounded-[22px] p-4 sm:p-6 flex flex-col gap-4" style={{ boxShadow: 'var(--sh-panel)' }}>
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-[26px] font-bold tracking-[-0.03em] text-[#1d1d1f] flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-[#0071e3] shrink-0" />
            <span>总部多维汇总报表</span>
          </h1>
          <p className="text-[12px] sm:text-[13px] text-[#6e6e73] mt-1.5 leading-relaxed">横向对比各分公司上报数据、计算数值字段合计与平均值。审批中的数据可见但不参与统计。</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {periods.length > 0 ? (
            <select value={selectedTemplateId} onChange={(e) => { const n = parseInt(e.target.value, 10); setSelectedTemplateId(n); }}
              className="h-10 sm:h-11 px-3 sm:px-4 bg-[#f5f5f7] rounded-[10px] sm:rounded-[12px] text-[12px] sm:text-[13px] font-semibold text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:bg-white flex-1 sm:flex-none min-w-0">
              {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          ) : (
            <span className="text-[12px] text-[#aeaeb2]">暂无模板</span>
          )}
          {periods.length > 0 ? (
            <select value={effectivePeriod} onChange={(e) => setSelectedPeriod(e.target.value)} disabled={periods.length === 1}
              className="h-10 sm:h-11 px-3 sm:px-4 bg-[#f5f5f7] rounded-[10px] sm:rounded-[12px] text-[12px] sm:text-[13px] font-semibold text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:bg-white disabled:opacity-50 flex-1 sm:flex-none min-w-0">
              {periods.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          ) : (
            <span className="text-[12px] text-[#aeaeb2]">暂无下发周期</span>
          )}
          {aggregationData && (
            <>
              <button onClick={copySummaryJSON} title="复制汇总指标 JSON"
                className="h-10 sm:h-11 px-4 sm:px-5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[12px] sm:text-[13px] font-semibold rounded-full transition-colors flex items-center gap-1.5 shrink-0">
                <Copy className="w-4 h-4" /><span className="hidden sm:inline">{copied ? '已复制' : '复制指标'}</span>
              </button>
              <button onClick={exportExcel} title="导出 Excel 报表"
                className="h-10 sm:h-11 px-4 sm:px-5 bg-[#0071e3] hover:bg-[#0066cc] text-white text-[12px] sm:text-[13px] font-semibold rounded-full transition-colors flex items-center gap-1.5 shrink-0">
                <FileDown className="w-4 h-4" /><span>导出</span>
              </button>
              <button onClick={loadHistory} title="查看填报历史版本"
                className="h-10 sm:h-11 px-4 sm:px-5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[12px] sm:text-[13px] font-semibold rounded-full transition-colors flex items-center gap-1.5 shrink-0">
                <History className="w-4 h-4" /><span>历史</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Metric Overview — stat cards on white surface with hover lift */}
      {loading && !aggregationData ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white p-4 sm:p-5 rounded-[14px] sm:rounded-[18px] animate-pulse space-y-2" style={{ boxShadow: 'var(--sh-card)' }}>
              <div className="h-3 bg-[#e8e8ed] rounded w-1/2" />
              <div className="h-7 bg-[#e8e8ed] rounded w-2/3" />
              <div className="h-3 bg-[#e8e8ed] rounded w-full" />
            </div>
          ))}
        </div>
      ) : metricCards.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {metricCards.map((mc) => (
            <div key={mc.fieldName} className="apple-card bg-white p-4 sm:p-5 rounded-[14px] sm:rounded-[18px] space-y-2" style={{ boxShadow: 'var(--sh-card)' }}>
              <div className="text-[12px] sm:text-[13px] font-semibold text-[#6e6e73] flex items-center justify-between">
                <span className="truncate">{mc.fieldLabel} · 合计</span>
                <Calculator className="w-4 h-4 text-[#aeaeb2] shrink-0" />
              </div>
              <div className="text-[24px] sm:text-[28px] font-bold tabular-nums text-[#1d1d1f] tracking-[-0.02em]">{mc.total.toLocaleString()}</div>
              <div className="text-[11px] sm:text-[12px] text-[#86868b] flex items-center justify-between pt-2 border-t border-[rgba(0,0,0,0.07)]">
                <span>通过 {mc.count}</span>
                <span className="tabular-nums">均值 {mc.average}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Tabs section */}
      {loading ? (
        <div className="py-16 text-center text-[13px] text-[#aeaeb2]">正在按维度汇总运算...</div>
      ) : error ? (
        <div className="bg-white p-10 text-center rounded-[22px]" style={{ boxShadow: 'var(--sh-card)' }}>
          <AlertCircle className="w-10 h-10 text-[#ff6b00] mx-auto mb-3" />
          <div className="text-[15px] font-bold text-[#1d1d1f]">加载失败</div>
          <p className="text-[13px] text-[#6e6e73] mt-1">{error}</p>
          <button onClick={() => loadAggregation(selectedTemplateId, effectivePeriod)}
            className="mt-4 h-11 px-5 bg-[#0071e3] hover:bg-[#0066cc] text-white text-[13px] font-semibold rounded-full transition-colors flex items-center gap-1.5 mx-auto">
            <RefreshCw className="w-4 h-4" /><span>重新加载</span>
          </button>
        </div>
      ) : aggregationData ? (
        <div className="space-y-4 sm:space-y-5">
          {/* Tab buttons — segmented control, scrollable on mobile */}
          <div className="flex gap-1 bg-[#f5f5f7] rounded-full p-1 w-fit max-w-full overflow-x-auto" role="tablist" style={{ scrollbarWidth: 'none' }}>
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.key} role="tab" aria-selected={activeTab === t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 h-9 text-[12px] sm:text-[13px] font-semibold rounded-full transition-all whitespace-nowrap ${activeTab === t.key ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}>
                  <Icon className="w-4 h-4 shrink-0" /><span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab: Institutions */}
          {activeTab === 'institutions' && (
            <div role="tabpanel">
              <div className="flex items-center justify-between mb-3 gap-2 sm:gap-3">
                <input type="text" placeholder="搜索机构名称 / 编号..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 max-w-sm h-10 sm:h-11 px-3 sm:px-4 bg-[#f5f5f7] rounded-[10px] sm:rounded-[12px] text-[12px] sm:text-[13px] text-[#1d1d1f] placeholder:text-[#aeaeb2] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:bg-white" />
                <span className="text-[11px] sm:text-[12px] text-[#6e6e73] tabular-nums shrink-0">{aggregationData.company_data.length} 个机构 · 未提交 {uncodedCount}</span>
              </div>
              <div className="bg-white rounded-[14px] sm:rounded-[22px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] sm:text-[13px]">
                    <thead><tr className="bg-[#f5f5f7] text-[#6e6e73] text-[11px] sm:text-[12px] font-semibold">
                      <th className="p-3 sm:p-4 w-32 sm:w-40 text-left sticky left-0 bg-[#f5f5f7] z-10">机构</th>
                      <th className="p-3 sm:p-4 w-20 sm:w-24 text-center">状态</th>
                      {aggregationData.summary_fields.map((f) => (<th key={f.id} className="p-3 sm:p-4 min-w-[90px] sm:min-w-[110px] text-right font-semibold">{f.field_label}</th>))}
                    </tr></thead>
                    <tbody>
                      {filteredInst.length === 0 ? (
                        <tr><td colSpan={aggregationData.summary_fields.length + 2} className="p-8 sm:p-10 text-center text-[12px] sm:text-[13px] text-[#aeaeb2]">无匹配机构</td></tr>
                      ) : filteredInst.map((c) => (
                        <tr key={c.company_id} className="hover:bg-[#fbfbfd] transition-colors" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                          <td className="p-3 sm:p-4 sticky left-0 bg-white z-10 hover:bg-[#fbfbfd]">
                            <div className="font-semibold text-[#1d1d1f] truncate">{c.company_name}</div>
                            <div className="text-[10px] sm:text-[11px] text-[#86868b] tabular-nums mt-0.5">{c.company_code}</div>
                          </td>
                          <td className="p-3 sm:p-4 text-center">
                            {c.has_submitted ? getStatusBadge(c.submission_status) : <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold text-[#86868b] bg-[#f5f5f7]">未提交</span>}
                          </td>
                          {aggregationData.summary_fields.map((f) => (
                            <td key={f.id} className="p-3 sm:p-4 text-right tabular-nums">
                              {c.has_submitted && c.values[f.field_name] ? (
                                f.field_type === 'number' ? <span className="text-[#1d1d1f]">{Number(c.values[f.field_name]).toLocaleString()}</span> : <span className="text-[#424245]">{c.values[f.field_name]}</span>
                              ) : <span className="text-[#d2d2d7]">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {metricCards.length > 0 && (
                      <tfoot>
                        <tr className="bg-[#f5f5f7] font-bold text-[#1d1d1f]" style={{ borderTop: '2px solid rgba(0,0,0,0.07)' }}>
                          <td className="p-3 sm:p-4 sticky left-0 bg-[#f5f5f7] z-10" colSpan={2}>合计 / 均值</td>
                          {aggregationData.summary_fields.map((f) => {
                            const s = aggregationData.summary[f.field_name];
                            return (
                              <td key={f.id} className="p-3 sm:p-4 text-right">
                                {s ? (
                                  <div className="text-right">
                                    <div className="text-[12px] sm:text-[13px] font-bold text-[#1d1d1f] tabular-nums">合计 {s.total.toLocaleString()}</div>
                                    <div className="text-[10px] sm:text-[11px] text-[#6e6e73] tabular-nums mt-0.5">均值 {s.average}</div>
                                  </div>
                                ) : <span className="text-[#d2d2d7]">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Details */}
          {activeTab === 'details' && (
            <div role="tabpanel">
              <div className="flex items-center justify-between mb-3 gap-2 sm:gap-3">
                <input type="text" placeholder="搜索明细内容..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 max-w-sm h-10 sm:h-11 px-3 sm:px-4 bg-[#f5f5f7] rounded-[10px] sm:rounded-[12px] text-[12px] sm:text-[13px] text-[#1d1d1f] placeholder:text-[#aeaeb2] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:bg-white" />
                <span className="text-[11px] sm:text-[12px] text-[#6e6e73] tabular-nums shrink-0">{aggregationData.detail_rows.length} 行明细</span>
              </div>
              {aggregationData.detail_fields.length === 0 || filteredDet.length === 0 ? (
                <div className="bg-white p-8 sm:p-10 text-center rounded-[14px] sm:rounded-[22px]" style={{ boxShadow: 'var(--sh-card)' }}>
                  <FileSpreadsheet className="w-10 h-10 text-[#aeaeb2] mx-auto mb-2" />
                  <div className="text-[12px] sm:text-[13px] font-semibold text-[#424245]">{aggregationData.detail_fields.length === 0 ? '该模板无明细字段' : '无匹配明细行'}</div>
                </div>
              ) : (
                <div className="bg-white rounded-[14px] sm:rounded-[22px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px] sm:text-[13px]">
                      <thead><tr className="bg-[#f5f5f7] text-[#6e6e73] text-[11px] sm:text-[12px] font-semibold">
                        <th className="p-3 sm:p-4 w-32 sm:w-40 text-left sticky left-0 bg-[#f5f5f7] z-10">机构</th>
                        <th className="p-3 sm:p-4 w-12 sm:w-14 text-center">#</th>
                        <th className="p-3 sm:p-4 w-20 sm:w-24 text-center">状态</th>
                        {aggregationData.detail_fields.map((df) => (<th key={df.id} className="p-3 sm:p-4 min-w-[90px] sm:min-w-[110px] text-right font-semibold">{df.field_label}</th>))}
                      </tr></thead>
                      <tbody>
                        {filteredDet.map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#fbfbfd] transition-colors" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                            <td className="p-3 sm:p-4 font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10 hover:bg-[#fbfbfd] truncate">{row.company_name}</td>
                            <td className="p-3 sm:p-4 text-center text-[#86868b] tabular-nums">{row.row_index}</td>
                            <td className="p-3 sm:p-4 text-center">{row.submission_status ? getStatusBadge(row.submission_status) : <span className="text-[#d2d2d7]">—</span>}</td>
                            {aggregationData.detail_fields.map((df) => (
                              <td key={df.id} className="p-3 sm:p-4 text-right tabular-nums">{row[df.field_name] ? (df.field_type === 'number' ? <span className="text-[#1d1d1f]">{Number(row[df.field_name]).toLocaleString()}</span> : <span className="text-[#424245]">{row[df.field_name]}</span>) : <span className="text-[#d2d2d7]">—</span>}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Matrix */}
          {activeTab === 'matrix' && (
            <div role="tabpanel" className="space-y-4">
              {matrixGroups.length === 0 ? (
                <div className="bg-white p-8 sm:p-10 text-center rounded-[14px] sm:rounded-[22px]" style={{ boxShadow: 'var(--sh-card)' }}>
                  <Grid3x3 className="w-10 h-10 text-[#aeaeb2] mx-auto mb-2" />
                  <div className="text-[12px] sm:text-[13px] font-semibold text-[#424245]">该模板暂无交叉表字段</div>
                  <p className="text-[11px] sm:text-[12px] text-[#86868b] mt-1">在模板编辑器中使用"创建交叉表"功能即可添加</p>
                </div>
              ) : (
                matrixGroups.map((group, gIdx) => (
                  <div key={gIdx} className="bg-white rounded-[14px] sm:rounded-[22px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
                    <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-[rgba(0,0,0,0.07)]">
                      <h3 className="text-[14px] sm:text-[15px] font-bold tracking-[-0.01em] text-[#1d1d1f] flex items-center gap-2">
                        <Grid3x3 className="w-4 h-4 text-[#6e6e73] shrink-0" />
                        <span>{group.rowLabel}交叉表</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px] sm:text-[13px]">
                        <thead>
                          <tr className="bg-[#f5f5f7] text-[#6e6e73] text-[11px] sm:text-[12px] font-semibold">
                            <th className="p-3 sm:p-4 w-32 sm:w-40 text-left sticky left-0 bg-[#f5f5f7] z-10">机构</th>
                            <th className="p-3 sm:p-4 w-24 sm:w-28 text-left">{group.rowLabel}</th>
                            {group.columns.map((col) => (
                              <th key={col.id} className="p-3 sm:p-4 min-w-[90px] sm:min-w-[110px] text-center font-semibold">{col.field_label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInst.flatMap((c) =>
                            group.rowOptions.map((rowOpt, rowIdx) => {
                              return (
                                <tr key={`${c.company_id}-${rowIdx}`} className="hover:bg-[#fbfbfd] transition-colors" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                                  <td className="p-3 sm:p-4 font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10 hover:bg-[#fbfbfd] truncate">{c.company_name}</td>
                                  <td className="p-3 sm:p-4 text-[#424245]">{rowOpt}</td>
                                  {group.columns.map((col) => {
                                    const detRow = aggregationData.detail_rows.find(
                                      (r) => r.company_name === c.company_name && r.row_index === rowIdx + 1
                                    );
                                    const val = detRow?.[col.field_name];
                                    return (
                                      <td key={col.id} className="p-3 sm:p-4 text-center tabular-nums">
                                        {val ? (
                                          col.field_type === 'number' ? (
                                            <span className="text-[#1d1d1f]">{Number(val).toLocaleString()}</span>
                                          ) : (
                                            <span className="text-[#424245]">{val}</span>
                                          )
                                        ) : (
                                          <span className="text-[#d2d2d7]">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {/* Summary row */}
                        {group.columns.some((c) => c.field_type === 'number') && (
                          <tfoot>
                            <tr className="bg-[#f5f5f7] font-bold text-[#1d1d1f]" style={{ borderTop: '2px solid rgba(0,0,0,0.07)' }}>
                              <td className="p-3 sm:p-4 sticky left-0 bg-[#f5f5f7] z-10" colSpan={2}>合计</td>
                              {group.columns.map((col) => {
                                if (col.field_type !== 'number') return <td key={col.id} className="p-3 sm:p-4 text-center text-[#d2d2d7]">—</td>;
                                const s = aggregationData.detail_summary[col.field_name];
                                return (
                                  <td key={col.id} className="p-3 sm:p-4 text-center">
                                    {s ? (
                                      <div>
                                        <div className="text-[12px] sm:text-[13px] font-bold text-[#1d1d1f] tabular-nums">{s.total.toLocaleString()}</div>
                                        <div className="text-[10px] sm:text-[11px] text-[#6e6e73] tabular-nums mt-0.5">均值 {s.average}</div>
                                      </div>
                                    ) : <span className="text-[#d2d2d7]">—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab: Progress */}
          {activeTab === 'progress' && (
            <div role="tabpanel" className="space-y-4">
              {/* Progress summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="apple-card bg-white p-4 rounded-[18px]" style={{ boxShadow: 'var(--sh-card)' }}>
                  <div className="text-[12px] text-[#6e6e73] font-medium">应填报机构</div>
                  <div className="text-[28px] font-bold tabular-nums text-[#1d1d1f] mt-1 tracking-[-0.02em]">{progressStats.total}</div>
                </div>
                <div className="apple-card bg-white p-4 rounded-[18px]" style={{ boxShadow: 'var(--sh-card)' }}>
                  <div className="text-[12px] text-[#6e6e73] font-medium">已提交</div>
                  <div className="text-[28px] font-bold tabular-nums text-[#1d1d1f] mt-1 tracking-[-0.02em]">{progressStats.submitted}</div>
                </div>
                <div className="apple-card bg-white p-4 rounded-[18px]" style={{ boxShadow: 'var(--sh-card)' }}>
                  <div className="text-[12px] text-[#6e6e73] font-medium">审批通过</div>
                  <div className="text-[28px] font-bold tabular-nums text-[#1d1d1f] mt-1 tracking-[-0.02em]">{progressStats.approved}</div>
                </div>
                <div className="apple-card bg-white p-4 rounded-[18px]" style={{ boxShadow: 'var(--sh-card)' }}>
                  <div className="text-[12px] text-[#6e6e73] font-medium">提交率</div>
                  <div className="text-[28px] font-bold tabular-nums text-[#1d1d1f] mt-1 tracking-[-0.02em]">{progressStats.rate}<span className="text-[18px] text-[#6e6e73] ml-0.5">%</span></div>
                </div>
              </div>

              {/* Progress bar panel */}
              <div className="bg-white p-5 rounded-[22px]" style={{ boxShadow: 'var(--sh-panel)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-semibold text-[#1d1d1f]">填报进度</span>
                  <span className="text-[12px] text-[#6e6e73] tabular-nums">{progressStats.submitted} / {progressStats.total} 已提交</span>
                </div>
                <div className="w-full h-2.5 bg-[#f5f5f7] rounded-full overflow-hidden flex">
                  <div className="bg-[#1d1d1f] h-full transition-all" style={{ width: `${progressStats.total > 0 ? (progressStats.approved / progressStats.total) * 100 : 0}%` }} title={`审批通过: ${progressStats.approved}`} />
                  <div className="bg-[#0071e3] h-full transition-all" style={{ width: `${progressStats.total > 0 ? (progressStats.pending / progressStats.total) * 100 : 0}%` }} title={`审批中: ${progressStats.pending}`} />
                </div>
                <div className="flex items-center gap-5 mt-3 text-[12px] text-[#6e6e73]">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#1d1d1f] rounded-full" /><span>审批通过 <span className="tabular-nums">{progressStats.approved}</span></span></span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#0071e3] rounded-full" /><span>审批中 <span className="tabular-nums">{progressStats.pending}</span></span></span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#d2d2d7] rounded-full" /><span>未提交 <span className="tabular-nums">{progressStats.total - progressStats.submitted}</span></span></span>
                </div>
              </div>

              {/* Detail table */}
              <div className="bg-white rounded-[22px] overflow-hidden" style={{ boxShadow: 'var(--sh-panel)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead><tr className="bg-[#f5f5f7] text-[#6e6e73] text-[12px] font-semibold">
                      <th className="p-4 w-40 text-left">机构</th>
                      <th className="p-4 w-28 text-left">任务状态</th>
                      <th className="p-4 w-28 text-left">提交状态</th>
                      <th className="p-4 w-20 text-center">版本</th>
                    </tr></thead>
                    <tbody>
                      {progressItems.map((p) => (
                        <tr key={p.companyId} className="hover:bg-[#fbfbfd] transition-colors" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                          <td className="p-4 font-semibold text-[#1d1d1f]">{p.companyName}</td>
                          <td className="p-4"><span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#424245] bg-[#e8e8ed]">{p.assignmentStatus}</span></td>
                          <td className="p-4">{p.submissionStatus ? getStatusBadge(p.submissionStatus) : <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#86868b] bg-[#f5f5f7]">未提交</span>}</td>
                          <td className="p-4 text-center text-[#6e6e73] tabular-nums">{p.version || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : periods.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-[22px]" style={{ boxShadow: 'var(--sh-card)' }}>
          <div className="text-[15px] font-semibold text-[#1d1d1f]">该模板暂无下发任务</div>
          <p className="text-[13px] text-[#86868b] mt-1">请先创建并下发报表周期后再查看汇总。</p>
        </div>
      ) : null}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-[22px] max-w-4xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150" style={{ boxShadow: 'var(--sh-overlay)' }}>
            <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.07)] pb-3">
              <h2 className="text-[17px] font-bold tracking-[-0.01em] text-[#1d1d1f] flex items-center gap-2">
                <History className="w-4 h-4 text-[#0071e3]" />
                <span>填报历史版本</span>
                <span className="text-[12px] text-[#86868b] font-normal">({templates.find((t) => t.id === selectedTemplateId)?.name})</span>
              </h2>
              <button onClick={() => setShowHistory(false)} className="text-[#86868b] hover:text-[#1d1d1f] transition-colors"><X size={18} /></button>
            </div>
            {historyLoading ? (
              <div className="py-12 text-center text-[13px] text-[#aeaeb2]">正在加载历史记录...</div>
            ) : !historyData || historyData.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-[#aeaeb2]">暂无历史记录</div>
            ) : (
              <div className="space-y-3">
                {historyData.map((h) => (
                  <div key={h.assignment_id} className="bg-white rounded-[18px] overflow-hidden border border-[rgba(0,0,0,0.07)]">
                    <div className="bg-[#f5f5f7] px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#86868b]" />
                        <span className="text-[13px] font-semibold text-[#1d1d1f]">{h.company_name}</span>
                        <span className="text-[12px] text-[#86868b] tabular-nums">{h.period_label}</span>
                      </div>
                      <span className="text-[12px] text-[#6e6e73]">任务状态 {h.status}</span>
                    </div>
                    {h.submissions_history.length === 0 ? (
                      <div className="px-4 py-3 text-[12px] text-[#aeaeb2]">暂无提交记录</div>
                    ) : (
                      <table className="w-full text-[12px]">
                        <thead><tr className="text-[#6e6e73] border-b border-[rgba(0,0,0,0.07)]">
                          <th className="p-3 text-left font-semibold">版本</th>
                          <th className="p-3 text-left font-semibold">状态</th>
                          <th className="p-3 text-left font-semibold">提交人</th>
                          <th className="p-3 text-left font-semibold">提交时间</th>
                          <th className="p-3 text-left font-semibold">备注</th>
                        </tr></thead>
                        <tbody>
                          {h.submissions_history.map((s: any) => (
                            <tr key={s.submission_id} className="hover:bg-[#fbfbfd] transition-colors" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                              <td className="p-3 font-bold text-[#1d1d1f] tabular-nums">v{s.version}</td>
                              <td className="p-3">{getStatusBadge(s.status)}</td>
                              <td className="p-3 text-[#424245]">{s.submitted_by_name || '—'}</td>
                              <td className="p-3 text-[#6e6e73] tabular-nums">{s.submitted_at ? new Date(s.submitted_at).toLocaleString('zh-CN') : '—'}</td>
                              <td className="p-3 text-[#6e6e73] max-w-xs truncate">{s.comment || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[60] h-11 px-5 rounded-full flex items-center text-[13px] font-semibold shadow-[0_12px_32px_rgba(0,0,0,0.1)] animate-in fade-in slide-in-from-top-2 duration-200 ${toast.type === 'error' ? 'bg-[#ff6b00] text-white' : 'bg-[#0071e3] text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};
