import React, { useState } from 'react';
import { CheckSquare, Plus, Trash2, Upload, Download, X } from '../icons';
import { toast } from '../../utils/toast';
import { ReportTemplateField } from '../../types';
import { parseDetailRows, type DetailImportField, type DetailImportCellError } from '../../utils/detailImport';
import { FullscreenButton, fullscreenSectionClass, useFullscreen } from '../FullscreenToggle';

interface DetailTableProps {
  fields: ReportTemplateField[];
  rows: Array<Record<string, string>>;
  isReadOnly: boolean;
  sectionNumber: string;
  templateTitle?: string;
  onRowsChange: (rows: Array<Record<string, string>>) => void;
}

/** 明细数据表格区（含 Excel 导入/导出与导入预览弹窗） */
export const DetailTable: React.FC<DetailTableProps> = ({
  fields,
  rows,
  isReadOnly,
  sectionNumber,
  templateTitle,
  onRowsChange,
}) => {
  // Excel 导入状态（组件内部自管理）
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [importMapping, setImportMapping] = useState<
    Array<{ excelHeader: string; matchedFieldId: number | null; fieldLabel: string }>
  >([]);
  const [importAllRows, setImportAllRows] = useState<Array<Record<string, string>>>([]);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  // 格式有问题的单元格（红框标注，不阻断导入，提交时兜底强校验）
  const [importCellErrors, setImportCellErrors] = useState<DetailImportCellError[]>([]);
  const [importing, setImporting] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  if (fields.length === 0) return null;

  const handleDetailChange = (rowIndex: number, fieldId: number, value: string) => {
    const copy = [...rows];
    copy[rowIndex] = { ...copy[rowIndex], [fieldId]: value };
    onRowsChange(copy);
  };

  const addDetailRow = () => {
    onRowsChange([...rows, {}]);
  };

  const removeDetailRow = (index: number) => {
    if (rows.length <= 1) return;
    onRowsChange(rows.filter((_, idx) => idx !== index));
  };

  // ── Excel 导入 ──
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      // cellDates: true → 日期单元格解析为 Date，便于统一归一为 YYYY-MM-DD
      const workbook = read(buffer, { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: unknown[][] = utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
      });

      if (rawRows.length < 2) {
        toast('Excel 文件数据不足，至少需要包含表头和一行数据', 'error');
        return;
      }

      // 字段引用（含 select 选项与 number 范围，用于值归一与校验）
      const fieldRefs: DetailImportField[] = fields.map((f) => {
        const config =
          typeof f.field_config === 'string'
            ? JSON.parse(f.field_config || '{}')
            : f.field_config || {};
        return {
          id: f.id,
          field_label: f.field_label,
          field_type: f.field_type,
          options: f.field_type === 'select' ? (config.options || []) : undefined,
          min: typeof config.min === 'number' ? config.min : undefined,
          max: typeof config.max === 'number' ? config.max : undefined,
        };
      });

      // 智能解析：自动定位表头、过滤落款/空行、按类型规范化值
      const result = parseDetailRows(rawRows, fieldRefs);

      if (result.rows.length === 0) {
        const matchedCount = result.mapping.filter((m) => m.matchedFieldId !== null).length;
        toast(
          matchedCount === 0
            ? '未找到匹配的字段，请检查 Excel 表头是否与字段名称一致'
            : 'Excel 文件中未找到有效数据行',
          'error'
        );
        return;
      }

      setImportMapping(result.mapping);
      setImportAllRows(result.rows);
      setImportNotes(result.notes);
      setImportCellErrors(result.cellErrors);
      setImportModalOpen(true);
    } catch (err: any) {
      toast(err.message || 'Excel 解析失败', 'error');
    } finally {
      setImporting(false);
      // reset file input
      e.target.value = '';
    }
  };

  /** 删除预览中的某一行（导入前剔除不需要的数据），单元格错误联动重算行号 */
  const removeImportRow = (index: number) => {
    setImportAllRows((prev) => prev.filter((_, idx) => idx !== index));
    setImportCellErrors((prev) =>
      prev
        .filter((e) => e.rowIdx !== index)
        .map((e) => (e.rowIdx > index ? { ...e, rowIdx: e.rowIdx - 1 } : e)),
    );
  };

  const confirmImport = () => {
    const matchedCount = importMapping.filter((m) => m.matchedFieldId !== null).length;
    if (matchedCount === 0) {
      toast('未找到匹配的字段，请检查 Excel 表头是否与字段名称一致', 'error');
      return;
    }
    if (importAllRows.length === 0) {
      toast('没有可导入的数据行', 'error');
      return;
    }

    if (importMode === 'replace') {
      onRowsChange(importAllRows);
    } else {
      onRowsChange([...rows, ...importAllRows]);
    }

    setImportModalOpen(false);
    setImportAllRows([]);
    setImportMapping([]);
    setImportNotes([]);
    setImportCellErrors([]);
    toast(`成功导入 ${importAllRows.length} 行数据`, 'success');
  };

  // 预览单元格错误查找：`行下标#字段id` → 错误信息
  const cellErrorMap = new Map(importCellErrors.map((e) => [`${e.rowIdx}#${e.fieldId}`, e.message]));

  const downloadTemplate = async () => {
    try {
      const { utils, writeFile } = await import('xlsx');
      const headers = fields.map((f) => f.field_label);
      // 生成一行示例数据提示
      const sampleRow = fields.map((f) => {
        const config =
          typeof f.field_config === 'string'
            ? JSON.parse(f.field_config || '{}')
            : f.field_config || {};
        if (f.field_type === 'date') return '2026-07-23';
        if (f.field_type === 'number') return '100.5';
        if (f.field_type === 'select') {
          return (config.options || ['示例选项'])[0];
        }
        return '示例文本';
      });
      const aoa = [headers, sampleRow];
      const worksheet = utils.aoa_to_sheet(aoa);
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet, '导入模板');
      const safeName = (templateTitle || '报表').replace(/[\\/:*?"<>|]/g, '_');
      writeFile(workbook, `${safeName}_导入模板.xlsx`);
    } catch (err: any) {
      toast(err.message || '模板下载失败', 'error');
    }
  };

  return (
    <>
      <div
        className={`bg-white p-6 sm:p-7 space-y-5 ${fullscreenSectionClass(isFullscreen, 'rounded-[12px]')}`}
        style={{ boxShadow: 'var(--sh-panel)' }}
      >
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-canvas text-ink rounded-[10px]">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink tracking-[-0.01em]">
                {sectionNumber}、明细清单填写 (Detail Rows)
              </h2>
              <p className="text-[11px] text-mute mt-0.5">支持多行表格展开添加，系统将自动对数值类型汇总计算</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-wrap">
            {!isReadOnly && (
              <>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="h-9 px-3 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载模板</span>
                </button>
                <label className="h-9 px-3 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{importing ? '解析中...' : '导入Excel'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={importing}
                  />
                </label>
                <button
                  type="button"
                  onClick={addDetailRow}
                  className="h-9 px-3 bg-ink hover:bg-inkhover text-white font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加一行明细</span>
                </button>
              </>
            )}
            <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
          </div>
        </div>

        <div
          className="overflow-x-auto rounded-[12px]"
          style={{ border: '1px solid var(--hairline)' }}
        >
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas text-ink font-semibold">
                <th className="p-3 w-12 text-center tabular-nums">#</th>
                {fields.map((df) => (
                  <th key={df.id} className="p-3 min-w-[140px]">
                    {df.field_label}
                  </th>
                ))}
                {!isReadOnly && <th className="p-3 w-16 text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-hoverbg">
                  <td
                    className="p-3 text-center text-mute font-mono font-semibold tabular-nums"
                    style={{ borderTop: rowIndex === 0 ? 'none' : '1px solid var(--hairline)' }}
                  >
                    {rowIndex + 1}
                  </td>

                  {fields.map((df, dfIdx) => {
                    const val = row[df.id] || '';
                    const config =
                      typeof df.field_config === 'string'
                        ? JSON.parse(df.field_config || '{}')
                        : df.field_config || {};

                    return (
                      <td
                        key={df.id}
                        className="p-2"
                        style={{ borderTop: rowIndex === 0 && dfIdx === 0 ? 'none' : '1px solid var(--hairline)' }}
                      >
                        {df.field_type === 'select' ? (
                          <select
                            disabled={isReadOnly}
                            value={val}
                            onChange={(e) => handleDetailChange(rowIndex, df.id, e.target.value)}
                            className="w-full h-9 px-2.5 bg-canvas rounded-[10px] text-xs text-ink focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none disabled:opacity-60"
                          >
                            <option value="">-- 选择 --</option>
                            {(config.options || []).map((opt: string) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={df.field_type === 'number' ? 'number' : 'text'}
                            disabled={isReadOnly}
                            value={val}
                            onChange={(e) => handleDetailChange(rowIndex, df.id, e.target.value)}
                            placeholder="..."
                            className={`w-full h-9 px-2.5 bg-canvas rounded-[10px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none disabled:opacity-60 ${
                              df.field_type === 'number' ? 'tabular-nums' : ''
                            }`}
                          />
                        )}
                      </td>
                    );
                  })}

                  {!isReadOnly && (
                    <td
                      className="p-2 text-center"
                      style={{ borderTop: rowIndex === 0 ? 'none' : '1px solid var(--hairline)' }}
                    >
                      <button
                        type="button"
                        onClick={() => removeDetailRow(rowIndex)}
                        className="p-1.5 text-faint hover:text-[#9F2F2D] hover:bg-[#FDEBEC] rounded-full transition-colors"
                        title="删除本行"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Excel 导入预览弹窗 */}
      {importModalOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.35)' }}
        >
          <div
            className="bg-white rounded-[12px] max-w-4xl w-full max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            style={{ boxShadow: 'var(--sh-overlay)' }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between p-5 sm:p-6 shrink-0"
              style={{ borderBottom: '1px solid var(--hairline)' }}
            >
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-ink tracking-[-0.01em]">Excel 数据导入预览</h2>
                <p className="text-[11px] text-mute">
                  共识别到 <span className="tabular-nums">{importAllRows.length}</span> 行数据，可在下方逐行删除不需要的数据
                </p>
              </div>
              <button
                onClick={() => setImportModalOpen(false)}
                className="text-faint hover:text-ink p-1 rounded-full hover:bg-canvas"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
              {/* Field Mapping */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-ink">字段匹配结果</h3>
                <div className="flex flex-wrap gap-2">
                  {importMapping.map((m, idx) => (
                    <span
                      key={idx}
                      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                        m.matchedFieldId !== null
                          ? 'bg-line text-ink'
                          : 'bg-canvas text-faint line-through'
                      }`}
                    >
                      <span>Excel: {m.excelHeader}</span>
                      {m.matchedFieldId !== null && (
                        <>
                          <span className="text-faint">→</span>
                          <span>{m.fieldLabel}</span>
                        </>
                      )}
                    </span>
                  ))}
                </div>
                {importMapping.some((m) => m.matchedFieldId === null) && (
                  <p className="text-[11px] text-[#9F2F2D]">
                    部分 Excel 列未匹配到对应字段（灰色标记），这些数据将被忽略。
                  </p>
                )}
                {importNotes.length > 0 && (
                  <ul className="text-[11px] text-mute space-y-0.5 list-disc pl-4">
                    {importNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                )}
                {importCellErrors.length > 0 && (
                  <p className="text-[11px] text-[#9F2F2D]">
                    {importCellErrors.length} 个单元格存在格式问题（红框标注），导入后请在表格中修正。
                  </p>
                )}
              </div>

              {/* Import Mode */}
              <div className="flex items-center space-x-4 flex-wrap gap-y-2">
                <span className="text-xs font-semibold text-ink">导入方式:</span>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="append"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                    className="accent-ink"
                  />
                  <span className="text-xs text-ink">追加到现有数据后</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="accent-ink"
                  />
                  <span className="text-xs text-ink">覆盖现有明细数据</span>
                </label>
              </div>

              {/* Preview Table */}
              <div
                className="overflow-x-auto rounded-[12px]"
                style={{ border: '1px solid var(--hairline)' }}
              >
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-canvas text-ink font-semibold">
                      <th className="p-2.5 w-10 text-center tabular-nums">#</th>
                      {fields.map((df) => {
                        const isMapped = importMapping.some((m) => m.matchedFieldId === df.id);
                        return (
                          <th
                            key={df.id}
                            className={`p-2.5 min-w-[120px] ${!isMapped ? 'text-faint' : ''}`}
                          >
                            {df.field_label}
                            {!isMapped && (
                              <span className="ml-1 text-[10px] text-faint">(未匹配)</span>
                            )}
                          </th>
                        );
                      })}
                      <th className="p-2.5 w-16 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importAllRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-hoverbg">
                        <td
                          className="p-2.5 text-center text-mute font-mono tabular-nums"
                          style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--hairline)' }}
                        >
                          {idx + 1}
                        </td>
                        {fields.map((df, dfIdx) => {
                          const errMsg = cellErrorMap.get(`${idx}#${df.id}`);
                          return (
                            <td
                              key={df.id}
                              className={`p-2 text-body tabular-nums ${
                                errMsg ? 'ring-1 ring-inset ring-[#9F2F2D] bg-[#FDEBEC]' : ''
                              }`}
                              title={errMsg}
                              style={{ borderTop: idx === 0 && dfIdx === 0 ? 'none' : '1px solid var(--hairline)' }}
                            >
                              {row[df.id] || (
                                <span className="text-line">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td
                          className="p-2 text-center"
                          style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--hairline)' }}
                        >
                          <button
                            type="button"
                            onClick={() => removeImportRow(idx)}
                            className="p-1.5 text-faint hover:text-[#9F2F2D] hover:bg-[#FDEBEC] rounded-full transition-colors"
                            title="删除本行，不参与导入"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {importAllRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={fields.length + 2}
                          className="p-6 text-center text-[12px] text-faint"
                          style={{ borderTop: '1px solid var(--hairline)' }}
                        >
                          所有行均已删除，请取消后重新选择文件
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="p-5 sm:p-6 flex justify-end space-x-3 shrink-0"
              style={{ borderTop: '1px solid var(--hairline)' }}
            >
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="h-11 px-5 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={
                  importMapping.filter((m) => m.matchedFieldId !== null).length === 0 ||
                  importAllRows.length === 0
                }
                className="h-11 px-5 bg-ink hover:bg-inkhover text-white font-semibold text-xs rounded-md transition-colors disabled:opacity-50"
              >
                确认导入 (<span className="tabular-nums">{importAllRows.length}</span> 行)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
