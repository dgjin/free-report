import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  FileSpreadsheet,
  Building2,
  CheckCircle2,
  Clock,
  Layers,
  Calculator,
  Download,
  Copy,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { api } from '../services/api';
import { AggregationResponse, ReportTemplate } from '../types';

export const AggregationView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const templateIdParam = searchParams.get('template_id');

  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(
    templateIdParam ? parseInt(templateIdParam, 10) : 1
  );

  const [aggregationData, setAggregationData] = useState<AggregationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      loadAggregation(selectedTemplateId);
    }
  }, [selectedTemplateId]);

  const loadInitialData = async () => {
    try {
      const tList = await api.getTemplates();
      setTemplates(tList);
      if (tList.length > 0 && !templateIdParam) {
        setSelectedTemplateId(tList[0].id);
      }
    } catch {
      // ignore
    }
  };

  const loadAggregation = async (tId: number) => {
    setLoading(true);
    try {
      const data = await api.getAggregationByTemplate(tId);
      setAggregationData(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const copySummaryJSON = () => {
    if (!aggregationData) return;
    const jsonStr = JSON.stringify(aggregationData.summary, null, 2);
    navigator.clipboard.writeText(jsonStr);
    alert('汇总指标计算结果已成功复制至剪贴板');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Template Picker */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <span>总部多维汇总报表</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            横向对比各分公司上报数据、智能计算数值型字段合计与平均值，合并所有明细行。
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-700">选择汇总模板:</span>
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                const newId = parseInt(e.target.value, 10);
                setSelectedTemplateId(newId);
                setSearchParams({ template_id: newId.toString() });
              }}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.period_type})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={copySummaryJSON}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1.5"
            title="导出/复制数据JSON"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>复制指标结果</span>
          </button>
        </div>
      </div>

      {loading || !aggregationData ? (
        <div className="py-12 text-center text-xs text-slate-400">正在按维度汇总运算各分公司数据...</div>
      ) : (
        <div className="space-y-6">
          {/* Top Aggregated Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {aggregationData.summary_fields
              .filter((f) => f.field_type === 'number')
              .map((sf) => {
                const stat = aggregationData.summary[sf.field_name] || {
                  total: 0,
                  count: 0,
                  average: 0,
                };

                return (
                  <div
                    key={sf.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2"
                  >
                    <div className="text-xs font-bold text-slate-500 flex items-center justify-between">
                      <span>{sf.field_label} (合计)</span>
                      <Calculator className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                      {stat.total.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                      <span>已提交分公司: {stat.count} 个</span>
                      <span>均值: {stat.average}</span>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* 1. Branch Summary Cross Table (分公司汇总对比表) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>一、各分公司汇总指标对比网格</span>
              </h2>
              <span className="text-xs text-slate-500">
                已统计 {aggregationData.company_data.filter((c) => c.has_submitted).length} /{' '}
                {aggregationData.company_data.length} 个分公司
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3">分公司名称</th>
                    <th className="p-3 w-28 text-center">填报状态</th>
                    {aggregationData.summary_fields.map((f) => (
                      <th key={f.id} className="p-3 min-w-[120px]">
                        {f.field_label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {aggregationData.company_data.map((company) => (
                    <tr key={company.company_id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900 flex items-center space-x-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>{company.company_name} ({company.company_code})</span>
                      </td>

                      <td className="p-3 text-center">
                        {company.has_submitted ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded border border-emerald-200">
                            已上报 (v{company.submission_version})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[11px] font-medium rounded">
                            未填报/审核中
                          </span>
                        )}
                      </td>

                      {aggregationData.summary_fields.map((f) => {
                        const val = company.values[f.field_name];
                        return (
                          <td key={f.id} className="p-3 font-medium text-slate-800">
                            {val !== undefined && val !== '' ? val : <span className="text-slate-300">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Automatic Sum Row */}
                  <tr className="bg-indigo-50/70 font-bold text-indigo-900 border-t-2 border-indigo-200">
                    <td className="p-3">系统统计: 数值字段合计</td>
                    <td className="p-3 text-center">-</td>
                    {aggregationData.summary_fields.map((f) => {
                      if (f.field_type === 'number') {
                        const total = aggregationData.summary[f.field_name]?.total || 0;
                        return (
                          <td key={f.id} className="p-3 font-extrabold text-indigo-900">
                            {total.toLocaleString()}
                          </td>
                        );
                      }
                      return (
                        <td key={f.id} className="p-3 text-indigo-400 font-normal">
                          -
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Detail Rows Combined Grid (所有分公司明细合并表) */}
          {aggregationData.detail_fields.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  <span>二、所有分公司明细行汇总透视 (Detail Rows Merge)</span>
                </h2>
                <span className="text-xs text-slate-500">
                  共计 {aggregationData.detail_rows.length} 条明细条目
                </span>
              </div>

              {aggregationData.detail_rows.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">暂无已审上报的明细行</div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <th className="p-3 w-32">归属分公司</th>
                        <th className="p-3 w-12 text-center">#</th>
                        {aggregationData.detail_fields.map((df) => (
                          <th key={df.id} className="p-3 min-w-[120px]">
                            {df.field_label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {aggregationData.detail_rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-800">
                            {row.company_name}
                          </td>
                          <td className="p-3 text-center text-slate-400 font-mono">{row.row_index}</td>

                          {aggregationData.detail_fields.map((df) => (
                            <td key={df.id} className="p-3 text-slate-800">
                              {row[df.field_name] || <span className="text-slate-300">-</span>}
                            </td>
                          ))}
                        </tr>
                      ))}

                      {/* Detail Numeric Summary Row */}
                      <tr className="bg-emerald-50/70 font-bold text-emerald-900 border-t-2 border-emerald-200">
                        <td className="p-3">明细数值小计</td>
                        <td className="p-3 text-center">-</td>
                        {aggregationData.detail_fields.map((df) => {
                          if (df.field_type === 'number') {
                            const tot = aggregationData.detail_summary[df.field_name]?.total || 0;
                            return (
                              <td key={df.id} className="p-3 font-extrabold text-emerald-900">
                                {tot.toLocaleString()}
                              </td>
                            );
                          }
                          return (
                            <td key={df.id} className="p-3 text-emerald-400 font-normal">
                              -
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
