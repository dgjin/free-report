import React, { useCallback, useRef, useState } from 'react';
import type { DataType, FieldType } from '../types';
import type {
  MatrixDetection,
  ParsedExcelField,
  SheetAnalysis,
  TableFormat,
} from '../utils/excelFieldParser';
import { analyzeSheetData, parseExcelFields } from '../utils/excelFieldParser';

interface ExcelFieldImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (payload: ImportPayload) => void;
}

export interface ImportFieldItem {
  field_name: string;
  field_label: string;
  field_type: FieldType;
  data_type: DataType;
  sort_order: number;
  options?: string[];
  required?: boolean;
}

export interface ImportPayload {
  format: TableFormat;
  fields: ImportFieldItem[];
  matrix?: {
    row_label: string;
    row_options: string[];
    columns: Array<{ field_name: string; field_label: string; field_type: string }>;
  };
}

const FORMAT_LABELS: Record<TableFormat, string> = {
  detail: '明细表',
  summary: '汇总指标表',
  matrix: '交叉表',
};

export default function ExcelFieldImportModal({
  open,
  onClose,
  onImport,
}: ExcelFieldImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [analysis, setAnalysis] = useState<SheetAnalysis | null>(null);
  const [format, setFormat] = useState<TableFormat>('detail');
  const [fields, setFields] = useState<ParsedExcelField[]>([]);
  const [matrix, setMatrix] = useState<MatrixDetection | null>(null);
  // 交叉表：被排除（不导入）的列下标 + 新行选项输入
  const [excludedMatrixCols, setExcludedMatrixCols] = useState<Set<number>>(new Set());
  const [newRowOption, setNewRowOption] = useState('');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setAnalysis(null);
    setFormat('detail');
    setFields([]);
    setMatrix(null);
    setExcludedMatrixCols(new Set());
    setNewRowOption('');
    setError('');
    setFileName('');
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleClose = useCallback(() => {
    if (!importing) {
      reset();
      onClose();
    }
  }, [importing, reset, onClose]);

  const applyAnalysis = useCallback((a: SheetAnalysis) => {
    setAnalysis(a);
    setFormat(a.format);
    setFields(a.fields);
    setMatrix(a.matrix ?? null);
    setExcludedMatrixCols(new Set());
    setNewRowOption('');
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        setError('请上传 .xlsx、.xls 或 .csv 格式的文件');
        return;
      }

      setError('');
      setFileName(file.name);

      try {
        const result = await parseExcelFields(file);
        applyAnalysis(result);
        setStep('preview');
      } catch (err: any) {
        setError(err.message || 'Excel 解析失败');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [applyAnalysis]
  );

  /** 切换表格格式（基于原始网格重新分析，保持当前表头行选择） */
  const handleFormatChange = useCallback(
    (next: TableFormat) => {
      if (!analysis) return;
      const re = analyzeSheetData(analysis.grid, analysis.merges, next, analysis.headerRowIndex);
      setAnalysis(re);
      setFormat(re.format);
      setFields(re.fields);
      setMatrix(re.matrix ?? null);
      setExcludedMatrixCols(new Set());
      setNewRowOption('');
    },
    [analysis]
  );

  /** 手动选择表头行（保持当前格式选择重新分析） */
  const handleHeaderRowChange = useCallback(
    (rowIndex: number) => {
      if (!analysis || rowIndex === analysis.headerRowIndex) return;
      const re = analyzeSheetData(analysis.grid, analysis.merges, format, rowIndex);
      setAnalysis(re);
      setFormat(re.format);
      setFields(re.fields);
      setMatrix(re.matrix ?? null);
      setExcludedMatrixCols(new Set());
      setNewRowOption('');
    },
    [analysis, format]
  );

  const updateField = useCallback(
    (index: number, patch: Partial<ParsedExcelField>) => {
      setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
    },
    []
  );

  const handleBulkDataType = useCallback((dataType: DataType) => {
    setFields((prev) => prev.map((f) => ({ ...f, data_type: dataType })));
  }, []);

  const updateMatrixColumn = useCallback(
    (index: number, patch: Partial<{ field_type: FieldType }>) => {
      setMatrix((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((c, i) => (i === index ? { ...c, ...patch } : c)),
            }
          : prev
      );
    },
    []
  );

  /** 排除/恢复交叉表列（被排除的列不导入） */
  const toggleMatrixColumn = useCallback((index: number) => {
    setExcludedMatrixCols((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const updateMatrixRowLabel = useCallback((label: string) => {
    setMatrix((prev) => (prev ? { ...prev, row_label: label } : prev));
  }, []);

  const removeMatrixRowOption = useCallback((index: number) => {
    setMatrix((prev) =>
      prev ? { ...prev, row_options: prev.row_options.filter((_, i) => i !== index) } : prev
    );
  }, []);

  const addMatrixRowOption = useCallback(() => {
    const text = newRowOption.trim();
    if (!text) return;
    setMatrix((prev) => {
      if (!prev) return prev;
      if (prev.row_options.includes(text)) return prev;
      return { ...prev, row_options: [...prev.row_options, text] };
    });
    setNewRowOption('');
  }, [newRowOption]);

  const selectedFields = fields.filter((f) => !f.skipped);

  const handleImport = useCallback(async () => {
    let payload: ImportPayload;
    if (format === 'matrix' && matrix) {
      const includedColumns = matrix.columns.filter((_, i) => !excludedMatrixCols.has(i));
      if (!matrix.row_label.trim()) {
        setError('请填写交叉表行维度名称');
        return;
      }
      if (matrix.row_options.length === 0) {
        setError('交叉表至少需要一个行选项');
        return;
      }
      if (includedColumns.length === 0) return;
      payload = {
        format: 'matrix',
        fields: [],
        matrix: {
          row_label: matrix.row_label.trim(),
          row_options: matrix.row_options,
          columns: includedColumns.map((c) => ({
            field_name: c.field_name,
            field_label: c.field_label,
            field_type: c.field_type,
          })),
        },
      };
    } else {
      if (selectedFields.length === 0) return;
      payload = {
        format,
        fields: selectedFields.map((f, i) => ({
          field_name: f.field_name,
          field_label: f.field_label,
          field_type: f.field_type,
          data_type: f.data_type,
          sort_order: i + 1,
          options:
            f.field_type === 'select'
              ? f.options && f.options.length > 0
                ? f.options
                : [...new Set(f.sample_values)]
              : undefined,
          required: f.required,
        })),
      };
    }

    setImporting(true);
    try {
      await onImport(payload);
      reset();
      onClose();
    } catch (err: any) {
      setError(err.message || '导入失败');
      setImporting(false);
    }
  }, [format, matrix, excludedMatrixCols, selectedFields, onImport, reset, onClose]);

  if (!open) return null;

  const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
    { value: 'text', label: '文本' },
    { value: 'number', label: '数字' },
    { value: 'date', label: '日期' },
    { value: 'select', label: '下拉' },
    { value: 'textarea', label: '多行文本' },
  ];

  const previewRows = analysis?.rows.slice(0, 8) ?? [];
  const headerRowOptions = analysis ? analysis.rows.slice(0, Math.min(10, analysis.rows.length)) : [];
  const importCount =
    format === 'matrix'
      ? (matrix?.columns.filter((_, i) => !excludedMatrixCols.has(i)).length ?? 0)
      : selectedFields.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-[12px] w-full max-w-6xl max-h-[85vh] flex flex-col mx-4"
        style={{ boxShadow: 'var(--sh-overlay)', border: '1px solid var(--hairline)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h3 className="text-lg font-semibold text-ink">
            {step === 'upload' ? '从 Excel 智能导入' : `预览导入 - ${fileName}`}
          </h3>
          <button
            onClick={handleClose}
            disabled={importing}
            className="text-faint hover:text-mute text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-[#FDEBEC] text-[#9F2F2D] rounded-md text-sm">
              {error}
            </div>
          )}

          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 text-5xl">📊</div>
              <p className="text-mute mb-6 text-center">
                上传 Excel 文件，系统将自动识别表格结构与表头字段
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2.5 bg-ink text-white rounded-md hover:bg-inkhover transition-colors font-medium"
              >
                选择 Excel 文件
              </button>
              <p className="mt-4 text-xs text-faint">支持 .xlsx、.xls、.csv 格式</p>
              <div className="mt-6 w-full max-w-lg bg-canvas rounded-lg p-4 text-sm text-mute">
                <p className="font-medium mb-2">智能识别能力：</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>自动跳过标题行、表头注释行、空白行与落款行（填表人/电话等），定位真实表头</li>
                  <li>识别不准时可手动调整：预览页可重新选择表头行、切换表格格式</li>
                  <li>自动判定表格格式：明细表 / 汇总指标表（键值表）/ 交叉表；普通表格也可强制按交叉表导入（首列作行维度）</li>
                  <li>自动推断字段类型：Excel 日期、数字（含万元/公里等单位）、低基数文本转下拉并提取选项</li>
                  <li>序号列默认不导入；数据完整的列自动建议必填</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'preview' && analysis && (
            <div className="space-y-4">
              {/* 识别结果 */}
              <div className="rounded-lg bg-canvas p-4 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  {analysis.tableName && (
                    <span className="text-sm font-semibold text-ink">
                      《{analysis.tableName}》
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-xs text-body">
                    表格格式：
                    <select
                      value={format}
                      onChange={(e) => handleFormatChange(e.target.value as TableFormat)}
                      className="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="detail">明细表</option>
                      <option value="summary">汇总指标表</option>
                      <option value="matrix">交叉表</option>
                    </select>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-body">
                    表头行：
                    <select
                      value={analysis.headerRowIndex}
                      onChange={(e) => handleHeaderRowChange(Number(e.target.value))}
                      className="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-48 truncate"
                    >
                      {headerRowOptions.map((row, ri) => {
                        const snippet = row.find((c) => c.trim() !== '')?.trim() ?? '（空行）';
                        return (
                          <option key={ri} value={ri}>
                            第 {ri + 1} 行：{snippet.length > 10 ? snippet.slice(0, 10) + '…' : snippet}
                          </option>
                        );
                      })}
                    </select>
                  </span>
                  <span className="text-xs text-faint ml-auto">
                    表头第 {analysis.headerRowIndex + 1} 行 · 有效数据 {analysis.dataRowCount} 行
                  </span>
                </div>
                {analysis.notes.length > 0 && (
                  <ul className="space-y-0.5">
                    {analysis.notes.map((n, i) => (
                      <li key={i} className="text-xs text-mute flex gap-1.5">
                        <span className="text-[#1F6C9F]">✓</span>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Excel 原始数据预览 */}
              {previewRows.length > 0 && (
                <div className="border border-line rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-canvas border-b border-line text-xs font-medium text-mute">
                    Excel 原始数据预览（前 {previewRows.length} 行，高亮行为表头，点击行号可改设表头）
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <tbody>
                        {previewRows.map((row, ri) => {
                          const isHeader = ri === analysis.headerRowIndex;
                          return (
                            <tr key={ri} className={isHeader ? 'bg-[#E1F3FE]' : ''}>
                              <td className="px-2 py-1.5 border-b border-gray-100 whitespace-nowrap w-14 text-center">
                                {isHeader ? (
                                  <span className="text-[#1F6C9F] font-medium">表头</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleHeaderRowChange(ri)}
                                    title="点击设为表头行"
                                    className="text-faint hover:text-[#1F6C9F] hover:underline"
                                  >
                                    第{ri + 1}行
                                  </button>
                                )}
                              </td>
                              {row.map((cell, ci) => (
                                <td
                                  key={ci}
                                  className={`px-3 py-1.5 border-b border-gray-100 whitespace-nowrap ${
                                    isHeader ? 'font-medium text-blue-700' : 'text-mute'
                                  }`}
                                >
                                  {cell || '-'}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 交叉表结构预览 */}
              {format === 'matrix' && matrix && (
                <div className="border border-line rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-canvas border-b border-line text-xs font-medium text-mute">
                    交叉表结构（行维度 × 列指标，行列结构将由模版预定义，可在下方调整）
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-ink shrink-0">行维度：</span>
                      <input
                        type="text"
                        value={matrix.row_label}
                        onChange={(e) => updateMatrixRowLabel(e.target.value)}
                        placeholder="如：产品/区域"
                        className="w-40 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <span className="font-medium text-body shrink-0 pt-0.5">
                        行选项（{matrix.row_options.length}）：
                      </span>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        {matrix.row_options.map((opt, oi) => (
                          <span
                            key={`${opt}-${oi}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-mute"
                          >
                            {opt}
                            <button
                              type="button"
                              onClick={() => removeMatrixRowOption(oi)}
                              title="删除该行选项"
                              className="text-faint hover:text-[#9F2F2D] leading-none"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          value={newRowOption}
                          onChange={(e) => setNewRowOption(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addMatrixRowOption();
                            }
                          }}
                          placeholder="新增行选项，回车添加"
                          className="w-36 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={addMatrixRowOption}
                          disabled={!newRowOption.trim()}
                          className="px-2 py-1 text-xs border border-gray-300 rounded text-body hover:bg-canvas transition-colors disabled:opacity-40"
                        >
                          添加
                        </button>
                      </div>
                    </div>
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-canvas">
                          <th className="px-3 py-2 text-center text-xs font-medium text-mute w-12">导入</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-mute w-12">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-mute">列标签</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-mute">字段名</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-mute w-28">字段类型</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.columns.map((col, index) => {
                          const excluded = excludedMatrixCols.has(index);
                          return (
                            <tr
                              key={index}
                              className={`border-t border-gray-100 ${excluded ? 'opacity-50' : ''}`}
                            >
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={!excluded}
                                  onChange={() => toggleMatrixColumn(index)}
                                  className="accent-[#111]"
                                />
                              </td>
                              <td className="px-3 py-2 text-faint text-xs">{index + 1}</td>
                              <td className="px-3 py-2 text-sm text-body">{col.field_label}</td>
                              <td className="px-3 py-2 text-sm font-mono text-mute">{col.field_name}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={col.field_type}
                                  onChange={(e) =>
                                    updateMatrixColumn(index, {
                                      field_type: e.target.value as FieldType,
                                    })
                                  }
                                  disabled={excluded}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-canvas"
                                >
                                  {FIELD_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 字段配置预览（明细/汇总） */}
              {format !== 'matrix' && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-[#E1F3FE] rounded-lg">
                    <span className="text-sm text-body font-medium">批量设置数据类型：</span>
                    <button
                      onClick={() => handleBulkDataType('detail')}
                      className="px-3 py-1 text-xs bg-white border border-[#E1F3FE] text-[#1F6C9F] rounded-md hover:bg-[#FDEBEC] transition-colors"
                    >
                      全部设为明细数据
                    </button>
                    <button
                      onClick={() => handleBulkDataType('summary')}
                      className="px-3 py-1 text-xs bg-white border border-[#E1F3FE] text-[#1F6C9F] rounded-md hover:bg-[#FDEBEC] transition-colors"
                    >
                      全部设为摘要数据
                    </button>
                    <span className="text-xs text-faint ml-auto">
                      待导入 {selectedFields.length} / {fields.length} 个字段
                    </span>
                  </div>

                  <div className="border border-line rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-canvas border-b border-line text-xs font-medium text-mute">
                      字段配置预览（{FORMAT_LABELS[format]}）
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-canvas">
                            <th className="px-3 py-2 text-center text-xs font-medium text-mute w-12">导入</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-mute w-10">#</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-mute">字段标签</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-mute">字段名</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-mute w-24">字段类型</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-mute w-24">数据类型</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-mute w-12">必填</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-mute w-52">数据样本 / 选项</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((field, index) => (
                            <tr
                              key={index}
                              className={`border-t border-gray-100 ${
                                field.skipped ? 'opacity-50' : 'hover:bg-canvas'
                              }`}
                            >
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={!field.skipped}
                                  onChange={(e) => updateField(index, { skipped: !e.target.checked })}
                                  className="accent-[#111]"
                                />
                              </td>
                              <td className="px-3 py-2 text-faint text-xs">{field.sort_order}</td>
                              <td className="px-3 py-2">
                                <span className="text-sm text-body">{field.field_label}</span>
                                {field.skip_reason && (
                                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-faint">
                                    {field.skip_reason}
                                  </span>
                                )}
                                {field.hint && (
                                  <div className="text-[10px] text-faint mt-0.5" title={field.hint}>
                                    {field.hint}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={field.field_name}
                                  onChange={(e) => updateField(index, { field_name: e.target.value })}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={field.field_type}
                                  onChange={(e) =>
                                    updateField(index, { field_type: e.target.value as FieldType })
                                  }
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {FIELD_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={field.data_type}
                                  onChange={(e) =>
                                    updateField(index, { data_type: e.target.value as DataType })
                                  }
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="summary">摘要数据</option>
                                  <option value="detail">明细数据</option>
                                </select>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(e) => updateField(index, { required: e.target.checked })}
                                  className="accent-[#111]"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1 flex-wrap">
                                  {field.field_type === 'select' && field.options && field.options.length > 0 ? (
                                    field.options.map((v, vi) => (
                                      <span
                                        key={vi}
                                        className="inline-block px-1.5 py-0.5 bg-[#E1F3FE] rounded text-xs text-[#1F6C9F] max-w-32 truncate"
                                        title={v}
                                      >
                                        {v}
                                      </span>
                                    ))
                                  ) : field.sample_values.length > 0 ? (
                                    field.sample_values.map((v, vi) => (
                                      <span
                                        key={vi}
                                        className="inline-block px-1.5 py-0.5 bg-gray-100 rounded text-xs text-mute max-w-32 truncate"
                                        title={v}
                                      >
                                        {v}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-gray-300">无样本</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-line">
            <button
              onClick={reset}
              disabled={importing}
              className="px-4 py-2 text-sm text-mute hover:text-gray-800 transition-colors"
            >
              重新上传
            </button>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                disabled={importing}
                className="px-4 py-2 text-sm border border-gray-300 text-body rounded-lg hover:bg-canvas transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={importing || importCount === 0}
                className="px-6 py-2 text-sm bg-ink text-white rounded-md hover:bg-inkhover transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing
                  ? '导入中...'
                  : format === 'matrix'
                  ? `导入交叉表（${importCount} 列）`
                  : `导入 ${importCount} 个字段`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
