import React, { useCallback, useRef, useState } from 'react';
import type { DataType, FieldType } from '../types';
import type { ParsedExcelField } from '../utils/excelFieldParser';
import { parseExcelFields } from '../utils/excelFieldParser';

interface ExcelFieldImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (fields: ImportFieldItem[]) => void;
}

export interface ImportFieldItem {
  field_name: string;
  field_label: string;
  field_type: FieldType;
  data_type: DataType;
  sort_order: number;
}

export default function ExcelFieldImportModal({
  open,
  onClose,
  onImport,
}: ExcelFieldImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [parsedFields, setParsedFields] = useState<ParsedExcelField[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setParsedFields([]);
    setPreviewRows([]);
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

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (
        !file.name.match(/\.(xlsx|xls|csv)$/i)
      ) {
        setError('请上传 .xlsx、.xls 或 .csv 格式的文件');
        return;
      }

      setError('');
      setFileName(file.name);

      try {
        const result = await parseExcelFields(file);
        setParsedFields(result.fields);
        // 保留前3行作为预览（包括表头行）
        setPreviewRows(result.rows.slice(0, 4));
        setStep('preview');
      } catch (err: any) {
        setError(err.message || 'Excel 解析失败');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    []
  );

  const handleFieldTypeChange = useCallback(
    (index: number, fieldType: FieldType) => {
      setParsedFields((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, field_type: fieldType } : f
        )
      );
    },
    []
  );

  const handleDataTypeChange = useCallback(
    (index: number, dataType: DataType) => {
      setParsedFields((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, data_type: dataType } : f
        )
      );
    },
    []
  );

  const handleFieldNameChange = useCallback(
    (index: number, fieldName: string) => {
      setParsedFields((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, field_name: fieldName } : f
        )
      );
    },
    []
  );

  const handleBulkDataType = useCallback((dataType: DataType) => {
    setParsedFields((prev) =>
      prev.map((f) => ({ ...f, data_type: dataType }))
    );
  }, []);

  const handleImport = useCallback(async () => {
    if (parsedFields.length === 0) return;

    const importItems: ImportFieldItem[] = parsedFields.map((f) => ({
      field_name: f.field_name,
      field_label: f.field_label,
      field_type: f.field_type,
      data_type: f.data_type,
      sort_order: f.sort_order,
    }));

    setImporting(true);
    try {
      await onImport(importItems);
      reset();
      onClose();
    } catch (err: any) {
      setError(err.message || '导入失败');
      setImporting(false);
    }
  }, [parsedFields, onImport, reset, onClose]);

  if (!open) return null;

  const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
    { value: 'text', label: '文本' },
    { value: 'number', label: '数字' },
    { value: 'date', label: '日期' },
    { value: 'select', label: '下拉' },
    { value: 'textarea', label: '多行文本' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-[12px] w-full max-w-4xl max-h-[85vh] flex flex-col mx-4" style={{ boxShadow: 'var(--sh-overlay)', border: '1px solid var(--hairline)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h3 className="text-lg font-semibold text-ink">
            {step === 'upload'
              ? '从 Excel 导入表头'
              : step === 'preview'
              ? `预览导入 - ${fileName}`
              : '正在导入...'}
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
                上传 Excel 文件，系统将自动识别第一行作为表头字段
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
              <p className="mt-4 text-xs text-faint">
                支持 .xlsx、.xls、.csv 格式
              </p>
              <div className="mt-6 w-full max-w-md bg-canvas rounded-lg p-4 text-sm text-mute">
                <p className="font-medium mb-2">Excel 格式要求：</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>第一行：字段名称（表头）</li>
                  <li>第二行起（可选）：数据样本，用于自动推断字段类型</li>
                  <li>支持中文、英文表头</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {/* 批量操作 */}
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
                  共 {parsedFields.length} 个字段
                </span>
              </div>

              {/* Excel 原始数据预览 */}
              {previewRows.length > 0 && (
                <div className="border border-line rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-canvas border-b border-line text-xs font-medium text-mute">
                    Excel 原始数据预览（前 {previewRows.length} 行）
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr>
                          {previewRows[0]?.map((cell, i) => (
                            <th
                              key={i}
                              className="px-3 py-1.5 bg-[#E1F3FE] border-b border-line text-left font-medium text-blue-700 whitespace-nowrap"
                            >
                              {cell || `列${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(1).map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className="px-3 py-1 border-b border-gray-100 text-mute whitespace-nowrap"
                              >
                                {cell || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 字段配置预览 */}
              <div className="border border-line rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-canvas border-b border-line text-xs font-medium text-mute">
                  字段配置预览
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-canvas">
                        <th className="px-3 py-2 text-left text-xs font-medium text-mute w-12">
                          #
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-mute">
                          字段标签
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-mute">
                          字段名 (Field Name)
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-mute w-28">
                          字段类型
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-mute w-28">
                          数据类型
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-mute w-48">
                          数据样本
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedFields.map((field, index) => (
                        <tr
                          key={index}
                          className="border-t border-gray-100 hover:bg-canvas"
                        >
                          <td className="px-3 py-2 text-faint text-xs">
                            {field.sort_order}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={field.field_label}
                              className="w-full px-2 py-1 border border-line rounded text-sm bg-canvas text-mute"
                              disabled
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={field.field_name}
                              onChange={(e) =>
                                handleFieldNameChange(index, e.target.value)
                              }
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={field.field_type}
                              onChange={(e) =>
                                handleFieldTypeChange(
                                  index,
                                  e.target.value as FieldType
                                )
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
                                handleDataTypeChange(
                                  index,
                                  e.target.value as DataType
                                )
                              }
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="summary">摘要数据</option>
                              <option value="detail">明细数据</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 flex-wrap">
                              {field.sample_values.length > 0 ? (
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
                                <span className="text-xs text-gray-300">
                                  无样本
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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
                disabled={importing || parsedFields.length === 0}
                className="px-6 py-2 text-sm bg-ink text-white rounded-md hover:bg-inkhover transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? '导入中...' : `导入 ${parsedFields.length} 个字段`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
