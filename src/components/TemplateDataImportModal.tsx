import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, X, FileDown, AlertCircle } from './icons';
import { api, useAssignments } from '../services/api';
import { toast } from '../utils/toast';
import type { DataImportResult, ReportTemplate, ReportTemplateField } from '../types';
import { currentPeriodLabel } from '../utils/periodSchedule';
import {
  autoMapColumns,
  buildImportRows,
  validateMappings,
  type ColumnTarget,
  type ImportFieldRef,
} from '../utils/dataImportMapping';

interface TemplateDataImportModalProps {
  template: ReportTemplate;
  onClose: () => void;
  onImported?: () => void;
}

type ImportMode = 'archive' | 'prefill';
type Step = 'config' | 'mapping' | 'result';

/**
 * 数据初始化导入弹窗：历史归档（直接进汇总）/ 期初预填（生成草稿由经办人提交）。
 * 前端解析 Excel → 字段映射预览 → 提交后端统一校验写入。
 */
export const TemplateDataImportModal: React.FC<TemplateDataImportModalProps> = ({
  template,
  onClose,
  onImported,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: assignments = [] } = useAssignments();

  const [mode, setMode] = useState<ImportMode>('archive');
  const [periodLabel, setPeriodLabel] = useState(() => currentPeriodLabel(template.period_type));
  const [fields, setFields] = useState<ReportTemplateField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);

  const [step, setStep] = useState<Step>('config');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnTarget[]>([]);
  const [clientErrors, setClientErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<DataImportResult | null>(null);

  // 加载模板字段
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await api.getTemplateDetail(template.id);
        if (cancelled) return;
        setFields((detail.fields || []).filter((f) => f.status === 'active'));
      } catch (err: any) {
        if (!cancelled) toast(err.message || '读取模板字段失败', 'error');
      } finally {
        if (!cancelled) setLoadingFields(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [template.id]);

  const fieldRefs = useMemo<ImportFieldRef[]>(
    () => fields.map((f) => ({ id: f.id, field_label: f.field_label, data_type: f.data_type })),
    [fields],
  );
  const fieldsById = useMemo(() => new Map(fieldRefs.map((f) => [f.id, f])), [fieldRefs]);

  // prefill 模式可选周期：该模板已下发任务的 period_label
  const assignedPeriods = useMemo(() => {
    const labels = assignments
      .filter((a) => a.template_id === template.id)
      .map((a) => a.period_label)
      .filter(Boolean);
    return Array.from(new Set(labels)).sort().reverse();
  }, [assignments, template.id]);

  useEffect(() => {
    if (mode === 'prefill' && assignedPeriods.length > 0 && !assignedPeriods.includes(periodLabel)) {
      setPeriodLabel(assignedPeriods[0]);
    }
  }, [mode, assignedPeriods, periodLabel]);

  const resetFile = () => {
    setFileName('');
    setHeaders([]);
    setDataRows([]);
    setMappings([]);
    setClientErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** 下载导入模板：首列分公司编码 + 汇总字段 + 明细字段标签 */
  const handleDownloadTemplate = async () => {
    const summaryLabels = fields.filter((f) => f.data_type === 'summary').map((f) => f.field_label);
    const detailLabels = fields.filter((f) => f.data_type !== 'summary').map((f) => f.field_label);
    const header = ['分公司编码', ...summaryLabels, ...detailLabels];
    const { utils, writeFile } = await import('xlsx');
    const ws = utils.aoa_to_sheet([header]);
    ws['!cols'] = header.map(() => ({ wch: 18 }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, '数据导入');
    writeFile(wb, `${template.name}-导入模板.xlsx`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast('请上传 .xlsx、.xls 或 .csv 格式的文件', 'error');
      return;
    }
    try {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error('Excel 文件中没有找到工作表');
      const rows: string[][] = utils.sheet_to_json(workbook.Sheets[firstSheet], {
        header: 1,
        defval: '',
      });
      if (rows.length < 2) throw new Error('Excel 中没有数据行（第一行须为表头）');
      const headerRow = (rows[0] as string[]).map((h) => String(h ?? '').trim());
      if (headerRow.every((h) => !h)) throw new Error('未找到有效的表头列');
      setFileName(file.name);
      setHeaders(headerRow);
      setDataRows(rows.slice(1) as string[][]);
      setMappings(autoMapColumns(headerRow, fieldRefs));
      setClientErrors([]);
      setStep('mapping');
    } catch (err: any) {
      toast(err.message || 'Excel 解析失败', 'error');
      resetFile();
    }
  };

  const handleMappingChange = (colIdx: number, raw: string) => {
    const value: ColumnTarget = raw === 'ignore' ? 'ignore' : raw === 'company' ? 'company' : Number(raw);
    setMappings((prev) => prev.map((m, i) => (i === colIdx ? value : m)));
  };

  const handleSubmit = async () => {
    const mappingError = validateMappings(mappings);
    if (mappingError) return toast(mappingError, 'error');
    if (!periodLabel.trim()) return toast('请指定数据所属周期标签', 'error');

    const { rows, errors } = buildImportRows(dataRows, mappings, fieldsById);
    setClientErrors(errors);
    if (rows.length === 0) return;

    setImporting(true);
    try {
      const res = await api.importTemplateData(template.id, {
        mode,
        period_label: periodLabel.trim(),
        rows,
      });
      setResult(res);
      setStep('result');
      if (res.imported > 0) onImported?.();
    } catch (err: any) {
      toast(err.message || '导入失败', 'error');
    } finally {
      setImporting(false);
    }
  };

  const summaryFields = fieldRefs.filter((f) => f.data_type === 'summary');
  const detailFields = fieldRefs.filter((f) => f.data_type !== 'summary');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)' }}>
      <div
        className="bg-white rounded-[12px] max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: 'var(--sh-overlay)' }}
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="text-base font-semibold text-ink tracking-[-0.01em] flex items-center gap-2">
              <Upload className="w-4 h-4 text-ink" />
              <span>数据初始化导入</span>
            </h2>
            <div className="text-xs text-mute mt-0.5">模板: {template.name}</div>
          </div>
          <button onClick={onClose} disabled={importing} className="text-mute hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        {step === 'config' && (
          <div className="space-y-4">
            {/* 模式选择 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  {
                    value: 'archive',
                    title: '历史归档',
                    desc: '导入后直接成为已签收历史数据，立即参与汇总统计',
                  },
                  {
                    value: 'prefill',
                    title: '期初预填',
                    desc: '为已下发任务生成填报草稿，由分公司经办人核对后提交',
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={`px-4 py-3 rounded-[12px] cursor-pointer border transition-colors ${
                    mode === opt.value
                      ? 'bg-[rgba(17,17,17,0.06)] border-[rgba(17,17,17,0.25)]'
                      : 'bg-canvas border-line hover:bg-hoverbg'
                  }`}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === opt.value}
                    onChange={() => setMode(opt.value)}
                    className="sr-only"
                  />
                  <div className="text-sm font-medium text-ink">{opt.title}</div>
                  <div className="text-xs text-mute mt-1 leading-[1.6]">{opt.desc}</div>
                </label>
              ))}
            </div>

            {/* 周期标签 */}
            <div>
              <label className="block text-xs font-medium text-body mb-1.5">数据所属周期标签</label>
              {mode === 'prefill' ? (
                assignedPeriods.length > 0 ? (
                  <select
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink focus:outline-none focus:border-ink"
                  >
                    {assignedPeriods.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3.5 py-2.5 bg-[#FBF3DB] text-[#956400] rounded-[12px] text-xs">
                    该模板尚未下发任何任务，期初预填前请先在「按周期下发」中下发任务
                  </div>
                )
              ) : (
                <input
                  type="text"
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                  placeholder="如: 2026年07月"
                  className="w-full px-3.5 py-2.5 bg-white border border-line rounded-[12px] text-sm text-ink placeholder:text-faint focus:outline-none focus:border-ink"
                />
              )}
            </div>

            {/* 模板下载与上传 */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={loadingFields || fields.length === 0}
                className="h-10 px-4 bg-canvas hover:bg-line text-ink font-medium text-sm rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40"
              >
                <FileDown className="w-4 h-4" />
                <span>下载导入模板</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loadingFields || (mode === 'prefill' && assignedPeriods.length === 0)}
                className="h-10 px-4 bg-ink hover:bg-inkhover text-white font-medium text-sm rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40"
              >
                <Upload className="w-4 h-4" />
                <span>上传 Excel 文件</span>
              </button>
            </div>

            <div className="bg-canvas rounded-[12px] p-4 text-xs text-mute leading-[1.7]">
              <p className="font-medium text-body mb-1.5">Excel 格式要求：</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>第一行：表头（首列固定为「分公司编码」，其余列为字段标签）</li>
                <li>汇总字段每家公司只需在首行填写；明细字段每行一条</li>
                <li>同一家公司多条明细时连续多行填写，公司编码可留空沿用上一行</li>
              </ul>
            </div>
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4">
            <div className="text-xs text-mute">
              文件：{fileName} · 共 {dataRows.filter((r) => r.some((c) => String(c ?? '').trim())).length} 行数据
            </div>

            <div className="border border-line rounded-[12px] overflow-hidden">
              <div className="px-3 py-2 bg-canvas border-b border-line text-xs font-medium text-mute">
                字段映射（已按标签自动匹配，可人工调整）
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-canvas">
                      <th className="px-3 py-2 text-left font-medium text-mute">Excel 列</th>
                      <th className="px-3 py-2 text-left font-medium text-mute">映射到</th>
                      <th className="px-3 py-2 text-left font-medium text-mute">首行示例</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h, ci) => {
                      const m = mappings[ci];
                      const sample = String(dataRows[0]?.[ci] ?? '').trim();
                      return (
                        <tr key={ci} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-ink font-medium whitespace-nowrap">{h || `列${ci + 1}`}</td>
                          <td className="px-3 py-2">
                            <select
                              value={m === 'company' ? 'company' : m === 'ignore' ? 'ignore' : String(m)}
                              onChange={(e) => handleMappingChange(ci, e.target.value)}
                              className="px-2 py-1.5 border border-line rounded-md text-xs text-ink bg-white focus:outline-none focus:border-ink"
                            >
                              <option value="ignore">忽略该列</option>
                              <option value="company">分公司编码</option>
                              {summaryFields.length > 0 && (
                                <optgroup label="汇总字段">
                                  {summaryFields.map((f) => (
                                    <option
                                      key={f.id}
                                      value={f.id}
                                      disabled={mappings.some((x, xi) => xi !== ci && x === f.id)}
                                    >
                                      {f.field_label}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {detailFields.length > 0 && (
                                <optgroup label="明细字段">
                                  {detailFields.map((f) => (
                                    <option
                                      key={f.id}
                                      value={f.id}
                                      disabled={mappings.some((x, xi) => xi !== ci && x === f.id)}
                                    >
                                      {f.field_label}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-mute max-w-[160px] truncate" title={sample}>
                            {sample || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {clientErrors.length > 0 && (
              <div className="p-3 bg-[#FDEBEC] text-[#9F2F2D] rounded-[12px] text-xs space-y-1">
                {clientErrors.slice(0, 5).map((e) => (
                  <div key={e} className="flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
                    <span>{e}</span>
                  </div>
                ))}
                {clientErrors.length > 5 && <div>… 共 {clientErrors.length} 条</div>}
              </div>
            )}

            <div className="pt-3 border-t border-line flex justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  resetFile();
                  setStep('config');
                }}
                disabled={importing}
                className="h-10 px-4 text-mute hover:text-ink font-medium text-sm transition-colors"
              >
                重新上传
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={importing}
                className="h-10 px-5 bg-ink hover:bg-inkhover text-white font-medium text-sm rounded-md transition-colors disabled:opacity-50"
              >
                {importing ? '导入中...' : `按「${mode === 'archive' ? '历史归档' : '期初预填'}」提交导入`}
              </button>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4">
            <div
              className={`px-4 py-3 rounded-[12px] text-sm ${
                result.imported > 0 ? 'bg-[#E8F2E9] text-[#346538]' : 'bg-[#FDEBEC] text-[#9F2F2D]'
              }`}
            >
              {result.message}
            </div>

            {result.errors.length > 0 && (
              <div className="border border-line rounded-[12px] overflow-hidden">
                <div className="px-3 py-2 bg-canvas border-b border-line text-xs font-medium text-mute">
                  行级错误（{result.errors.length}）
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-canvas">
                        <th className="px-3 py-2 text-left font-medium text-mute w-16">行号</th>
                        <th className="px-3 py-2 text-left font-medium text-mute w-32">分公司编码</th>
                        <th className="px-3 py-2 text-left font-medium text-mute">原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 tabular-nums text-mute">{e.row}</td>
                          <td className="px-3 py-2 text-ink font-medium">{e.company_code || '-'}</td>
                          <td className="px-3 py-2 text-mute">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-line flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  resetFile();
                  setResult(null);
                  setStep('config');
                }}
                className="h-10 px-5 bg-canvas hover:bg-line text-ink font-medium text-sm rounded-md transition-colors"
              >
                继续导入
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-5 bg-ink hover:bg-inkhover text-white font-medium text-sm rounded-md transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
