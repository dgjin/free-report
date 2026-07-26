import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  ArrowLeft,
  Save,
  Send,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  History,
  Building2,
  UserCheck,
  CheckSquare,
  XCircle,
  Upload,
  X,
  Download,
  Grid3x3,
} from '../components/icons';
import { api, getStoredUser } from '../services/api';
import { toast, confirmDialog } from '../utils/toast';
import {
  ReportAssignment,
  ReportTemplateField,
  ReportSubmissionDetail,
  UserInfo,
} from '../types';
import { getSubmissionWorkflowView } from '../utils/submissionWorkflow';
import { getClientAccess } from '../utils/access';

export const ReportFill: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<ReportAssignment | null>(null);
  const [fields, setFields] = useState<ReportTemplateField[]>([]);
  const [submission, setSubmission] = useState<ReportSubmissionDetail | null>(null);

  // Form State
  const [summaryForm, setSummaryForm] = useState<Record<string, string>>({});
  const [detailRows, setDetailRows] = useState<Array<Record<string, string>>>([]);
  const [comment, setComment] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [user, setUser] = useState<UserInfo | null>(getStoredUser());

  // Excel Import State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [importMapping, setImportMapping] = useState<
    Array<{ excelHeader: string; matchedFieldId: number | null; fieldLabel: string }>
  >([]);
  const [importPreviewRows, setImportPreviewRows] = useState<Array<Record<string, string>>>([]);
  const [importAllRows, setImportAllRows] = useState<Array<Record<string, string>>>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (assignmentId) {
      loadData();
    }
  }, [assignmentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const aId = parseInt(assignmentId!, 10);
      const aRes = await api.getAssignmentDetail(aId);
      setAssignment(aRes);

      const activeFields = (aRes.fields || []).filter((f) => f.status === 'active');
      setFields(activeFields);

      // Check if submission exists
      try {
        const subRes = await api.getSubmissionByAssignment(aId);
        setSubmission(subRes);
        if (!subRes) {
          setComment('');
          setSummaryForm({});
          setDetailRows([{}]);
          return;
        }
        setComment(subRes.comment || '');

        // Populate Summary Form
        const summaryDataMap: Record<string, string> = {};
        subRes.summary.forEach((item) => {
          summaryDataMap[item.field_id] = item.value;
        });
        setSummaryForm(summaryDataMap);

        // Populate Detail Rows
        const parsedDetailRows = subRes.details.map((rowItems) => {
          const rowObj: Record<string, string> = {};
          rowItems.forEach((item) => {
            rowObj[item.field_id] = item.value;
          });
          return rowObj;
        });

        if (parsedDetailRows.length > 0) {
          setDetailRows(parsedDetailRows);
        } else {
          setDetailRows([{}]); // default 1 empty detail row
        }
      } catch {
        // No submission yet -> default empty
        setDetailRows([{}]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const summaryFields = fields.filter((f) => f.data_type === 'summary');
  const detailFields = fields.filter((f) => f.data_type === 'detail');
  const matrixFields = fields.filter((f) => f.data_type === 'matrix');

  // Group matrix fields by their row_label (each group = one cross-tab table)
  const matrixGroups = useMemo(() => {
    const groups: Array<{
      rowLabel: string;
      rowOptions: string[];
      columns: ReportTemplateField[];
    }> = [];
    const groupMap = new Map<string, number>();

    matrixFields.forEach((field) => {
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
  }, [matrixFields]);

  // Ensure matrix rows exist in detailRows (matrix uses row_index 1..N for fixed rows)
  useEffect(() => {
    if (matrixGroups.length === 0) return;
    setDetailRows((prev) => {
      let needsUpdate = false;
      const updated = [...prev];
      // For each matrix group, ensure we have enough rows
      const maxRows = Math.max(...matrixGroups.map((g) => g.rowOptions.length), 0);
      while (updated.length < maxRows) {
        updated.push({});
        needsUpdate = true;
      }
      return needsUpdate ? updated : prev;
    });
  }, [matrixGroups]);

  const handleMatrixChange = (rowIndex: number, fieldId: number, value: string) => {
    setDetailRows((prev) => {
      const copy = [...prev];
      copy[rowIndex] = { ...copy[rowIndex], [fieldId]: value };
      return copy;
    });
  };

  const handleSummaryChange = (fieldId: number, value: string) => {
    setSummaryForm((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleDetailChange = (rowIndex: number, fieldId: number, value: string) => {
    setDetailRows((prev) => {
      const copy = [...prev];
      copy[rowIndex] = { ...copy[rowIndex], [fieldId]: value };
      return copy;
    });
  };

  const addDetailRow = () => {
    setDetailRows((prev) => [...prev, {}]);
  };

  const removeDetailRow = (index: number) => {
    if (detailRows.length <= 1) return;
    setDetailRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async (isSubmit: boolean) => {
    if (!assignment) return;

    if (isSubmit) {
      if (!(await confirmDialog('确定提交该报表？提交后将发送至下发部门签收，签收前不能再次修改。'))) return;
      setSubmitting(true);
    } else {
      setSaving(true);
    }

    try {
      const res = await api.saveOrSubmitReport({
        assignment_id: assignment.id,
        summary: summaryForm,
        details: detailRows,
        comment,
        action: isSubmit ? 'submit' : 'draft',
      });

      setSubmission(res.submission);
      toast(isSubmit ? '提交成功，报表已发送至下发部门等待签收。' : res.message, 'success');
      await loadData();
    } catch (err: any) {
      toast(err.message || '保存或提交失败', 'error');
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  // ── Excel Import ──
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: string[][] = utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
      });

      if (rawRows.length < 2) {
        toast('Excel 文件数据不足，至少需要包含表头和一行数据', 'error');
        return;
      }

      const headers = rawRows[0].map((h) => String(h).trim());
      const dataRows = rawRows.slice(1).filter((r) =>
        r.some((cell) => String(cell).trim() !== '')
      );

      if (dataRows.length === 0) {
        toast('Excel 文件中未找到有效数据行', 'error');
        return;
      }

      // 匹配表头与 detailFields
      const mapping = headers.map((header) => {
        const matched = detailFields.find((f) => {
          const a = f.field_label.trim();
          const b = header;
          return a === b || a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
        });
        return {
          excelHeader: header,
          matchedFieldId: matched?.id ?? null,
          fieldLabel: matched?.field_label ?? '',
        };
      });

      setImportMapping(mapping);

      // 构建所有导入行
      const allRows: Array<Record<string, string>> = dataRows.map((row) => {
        const obj: Record<string, string> = {};
        mapping.forEach((m, idx) => {
          if (m.matchedFieldId !== null) {
            obj[m.matchedFieldId] = String(row[idx] ?? '');
          }
        });
        return obj;
      });

      setImportAllRows(allRows);
      setImportPreviewRows(allRows.slice(0, 5));
      setImportModalOpen(true);
    } catch (err: any) {
      toast(err.message || 'Excel 解析失败', 'error');
    } finally {
      setImporting(false);
      // reset file input
      e.target.value = '';
    }
  };

  const confirmImport = () => {
    const matchedCount = importMapping.filter((m) => m.matchedFieldId !== null).length;
    if (matchedCount === 0) {
      toast('未找到匹配的字段，请检查 Excel 表头是否与字段名称一致', 'error');
      return;
    }

    if (importMode === 'replace') {
      setDetailRows(importAllRows);
    } else {
      setDetailRows((prev) => [...prev, ...importAllRows]);
    }

    setImportModalOpen(false);
    setImportAllRows([]);
    setImportPreviewRows([]);
    setImportMapping([]);
    toast(`成功导入 ${importAllRows.length} 行数据`, 'success');
  };

  const downloadTemplate = async () => {
    if (detailFields.length === 0) {
      toast('当前模板暂无明细字段，无法生成导入模板', 'error');
      return;
    }
    try {
      const { utils, writeFile } = await import('xlsx');
      const headers = detailFields.map((f) => f.field_label);
      // 生成一行示例数据提示
      const sampleRow = detailFields.map((f) => {
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
      const safeName = (assignment?.title || '报表').replace(/[\\/:*?"<>|]/g, '_');
      writeFile(workbook, `${safeName}_导入模板.xlsx`);
    } catch (err: any) {
      toast(err.message || '模板下载失败', 'error');
    }
  };

  if (loading || !assignment) {
    return (
      <div className="max-w-[1080px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)]">
        <div className="text-center text-xs text-mute py-12">正在加载填报页面数据...</div>
      </div>
    );
  }

  const workflowView = getSubmissionWorkflowView(submission?.status);
  const canFill = user ? getClientAccess(user).canFill : false;
  const isReadOnly = workflowView.isReadOnly || !canFill;

  const isRejected = submission?.status === 'rejected' || submission?.status === 'returned';

  // Status badge: muted pastel semantics (done=green / progress=blue / warn=red)
  const getStatusBadgeClass = (status?: string) => {
    if (status === 'approved' || status === 'completed' || status === 'signed') {
      return 'bg-[#EDF3EC] text-[#346538]';
    }
    if (status === 'rejected' || status === 'returned') {
      return 'bg-[#FDEBEC] text-[#9F2F2D]';
    }
    return 'bg-[#E1F3FE] text-[#1F6C9F]';
  };

  // Approval row badge by approval status
  const getApprovalBadgeClass = (status?: string) => {
    if (status === 'approved') return 'bg-[#EDF3EC] text-[#346538]';
    if (status === 'rejected') return 'bg-[#FDEBEC] text-[#9F2F2D]';
    return 'bg-[#E1F3FE] text-[#1F6C9F]';
  };

  return (
    <div className="reveal max-w-[1080px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-5 pb-12">
      {/* Header */}
      <div
        className="bg-white rounded-[12px] p-6 sm:p-7 space-y-4"
        style={{ boxShadow: 'var(--sh-panel)' }}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/fill')}
            className="text-xs text-mute hover:text-ink flex items-center space-x-1 font-medium rounded-full px-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回任务列表</span>
          </button>

          <div className="flex items-center space-x-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(submission?.status)}`}
            >
              {workflowView.label}
            </span>
            {submission && (
              <span className="px-2.5 py-0.5 bg-canvas text-body text-[11px] font-mono font-semibold rounded-full tabular-nums">
                版本 v{submission.version}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <h1 className="t-serif text-[26px] text-ink leading-tight">
              {assignment.title}
            </h1>
            <div className="text-xs text-mute flex items-center flex-wrap gap-x-4 gap-y-1">
              <span>周期: {assignment.period_label}</span>
              <span>模板: {assignment.template_name}</span>
              <span>截止日期: {assignment.deadline}</span>
            </div>
          </div>

          {!isReadOnly && (
            <div className="flex items-center space-x-3 shrink-0">
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={saving || submitting}
                className="h-11 px-5 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? '保存草稿中...' : '保存为草稿'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving || submitting}
                className="h-11 px-5 bg-ink hover:bg-inkhover text-white font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? '提交中...' : '提交至下发部门'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rejection Alert if rejected */}
      {isRejected && (
        <div
          className="bg-[#FDEBEC] rounded-[12px] px-5 py-4 flex items-start space-x-3 text-xs"
          style={{ border: '1px solid #FDEBEC' }}
        >
          <XCircle className="w-[18px] h-[18px] text-[#9F2F2D] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-ink">您的填报数据已被退回</div>
            <div className="text-mute leading-relaxed">
              请根据审核意见修改下方数据后重新提交（提交后系统将自动升级至版本 v
              {(submission?.version || 1) + 1}）。
            </div>
          </div>
        </div>
      )}

      {/* Summary Form Section (汇总字段) */}
      {summaryFields.length > 0 && (
        <div
          className="bg-white rounded-[12px] p-6 sm:p-7 space-y-5"
          style={{ boxShadow: 'var(--sh-panel)' }}
        >
          <div
            className="flex items-center justify-between pb-4"
            style={{ borderBottom: '1px solid var(--hairline)' }}
          >
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-canvas text-ink rounded-[10px]">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink tracking-[-0.01em]">
                  一、汇总指标数据 (Summary Data)
                </h2>
                <p className="text-[11px] text-mute mt-0.5">请按要求填写分公司整体汇总考核数据</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaryFields.map((field) => {
              const val = summaryForm[field.id] || '';
              const config =
                typeof field.field_config === 'string'
                  ? JSON.parse(field.field_config || '{}')
                  : field.field_config || {};

              return (
                <div key={field.id} className="space-y-1.5">
                  <label className="block text-xs font-semibold text-ink">
                    {field.field_label}
                    {config.required && <span className="text-[#9F2F2D] ml-1">*</span>}
                  </label>

                  {field.field_type === 'select' ? (
                    <select
                      disabled={isReadOnly}
                      value={val}
                      onChange={(e) => handleSummaryChange(field.id, e.target.value)}
                      className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none disabled:opacity-60 disabled:text-mute"
                    >
                      <option value="">-- 请选择 --</option>
                      {(config.options || []).map((opt: string) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.field_type === 'textarea' ? (
                    <textarea
                      disabled={isReadOnly}
                      rows={2}
                      value={val}
                      onChange={(e) => handleSummaryChange(field.id, e.target.value)}
                      placeholder="请输入..."
                      className="w-full px-3.5 py-2.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none disabled:opacity-60 disabled:text-mute"
                    />
                  ) : (
                    <input
                      type={
                        field.field_type === 'number'
                          ? 'number'
                          : field.field_type === 'date'
                          ? 'date'
                          : 'text'
                      }
                      disabled={isReadOnly}
                      value={val}
                      onChange={(e) => handleSummaryChange(field.id, e.target.value)}
                      placeholder="请输入..."
                      className={`w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none disabled:opacity-60 disabled:text-mute ${
                        field.field_type === 'number' ? 'tabular-nums' : ''
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Detail Grid Section (明细字段) */}
      {detailFields.length > 0 && (
        <div
          className="bg-white rounded-[12px] p-6 sm:p-7 space-y-5"
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
                  {summaryFields.length > 0 ? '二' : '一'}、明细清单填写 (Detail Rows)
                </h2>
                <p className="text-[11px] text-mute mt-0.5">支持多行表格展开添加，系统将自动对数值类型汇总计算</p>
              </div>
            </div>

            {!isReadOnly && (
              <div className="flex items-center space-x-2 flex-wrap">
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
              </div>
            )}
          </div>

          <div
            className="overflow-x-auto rounded-[12px]"
            style={{ border: '1px solid var(--hairline)' }}
          >
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-canvas text-ink font-semibold">
                  <th className="p-3 w-12 text-center tabular-nums">#</th>
                  {detailFields.map((df) => (
                    <th key={df.id} className="p-3 min-w-[140px]">
                      {df.field_label}
                    </th>
                  ))}
                  {!isReadOnly && <th className="p-3 w-16 text-center">操作</th>}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-hoverbg">
                    <td
                      className="p-3 text-center text-mute font-mono font-semibold tabular-nums"
                      style={{ borderTop: rowIndex === 0 ? 'none' : '1px solid var(--hairline)' }}
                    >
                      {rowIndex + 1}
                    </td>

                    {detailFields.map((df, dfIdx) => {
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
      )}

      {/* 3. Matrix Cross-Tab Section (交叉表字段) */}
      {matrixGroups.length > 0 && matrixGroups.map((group, groupIdx) => {
        const sectionNum = summaryFields.length > 0 ? (detailFields.length > 0 ? '三' : '二') : (detailFields.length > 0 ? '二' : '一');
        return (
          <div
            key={groupIdx}
            className="bg-white rounded-[12px] p-6 sm:p-7 space-y-5"
            style={{ boxShadow: 'var(--sh-panel)' }}
          >
            <div
              className="flex items-center justify-between pb-4"
              style={{ borderBottom: '1px solid var(--hairline)' }}
            >
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-canvas text-ink rounded-[10px]">
                  <Grid3x3 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-ink tracking-[-0.01em]">
                    {sectionNum}、{group.rowLabel}交叉表 (Cross-Tab)
                  </h2>
                  <p className="text-[11px] text-mute mt-0.5">固定行 × 动态列，数值列将自动合计</p>
                </div>
              </div>
            </div>

            <div
              className="overflow-x-auto rounded-[12px]"
              style={{ border: '1px solid var(--hairline)' }}
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-canvas text-ink font-semibold">
                    <th className="p-3 min-w-[120px]">{group.rowLabel}</th>
                    {group.columns.map((col) => (
                      <th key={col.id} className="p-3 min-w-[100px] text-center">{col.field_label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rowOptions.map((rowOpt, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-hoverbg">
                      <td
                        className="p-3 font-semibold text-ink"
                        style={{ borderTop: rowIdx === 0 ? 'none' : '1px solid var(--hairline)' }}
                      >
                        {rowOpt}
                      </td>
                      {group.columns.map((col, colIdx) => {
                        const val = detailRows[rowIdx]?.[col.id] || '';
                        const colType = col.field_type;
                        return (
                          <td
                            key={col.id}
                            className="p-2 text-center"
                            style={{ borderTop: rowIdx === 0 && colIdx === 0 ? 'none' : '1px solid var(--hairline)' }}
                          >
                            {isReadOnly ? (
                              <span className="text-body font-mono tabular-nums">
                                {val || <span className="text-line">—</span>}
                              </span>
                            ) : colType === 'select' ? (
                              <select disabled={isReadOnly} value={val}
                                onChange={(e) => handleMatrixChange(rowIdx, col.id, e.target.value)}
                                className="w-full h-9 px-2.5 bg-canvas rounded-[10px] text-xs text-ink focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none">
                                <option value="">-- 选择 --</option>
                              </select>
                            ) : (
                              <input type={colType === 'number' ? 'number' : colType === 'date' ? 'date' : 'text'}
                                disabled={isReadOnly} value={val}
                                onChange={(e) => handleMatrixChange(rowIdx, col.id, e.target.value)}
                                placeholder="..."
                                className={`w-full h-9 px-2.5 bg-canvas rounded-[10px] text-xs text-center text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none ${
                                  colType === 'number' ? 'tabular-nums' : ''
                                }`} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {/* Summary row for number columns */}
                {group.columns.some((c) => c.field_type === 'number') && (
                  <tfoot>
                    <tr className="bg-canvas font-bold text-ink">
                      <td className="p-3" style={{ borderTop: '2px solid var(--hairline)' }}>合计</td>
                      {group.columns.map((col) => {
                        if (col.field_type !== 'number') {
                          return <td key={col.id} className="p-3 text-center text-line" style={{ borderTop: '2px solid var(--hairline)' }}>—</td>;
                        }
                        const total = group.rowOptions.reduce((sum, _, idx) => {
                          const v = detailRows[idx]?.[col.id];
                          return v && !isNaN(Number(v)) ? sum + Number(v) : sum;
                        }, 0);
                        return <td key={col.id} className="p-3 text-center text-ink font-mono tabular-nums" style={{ borderTop: '2px solid var(--hairline)' }}>{total.toLocaleString()}</td>;
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        );
      })}

      {/* Comment input */}
      {!isReadOnly && (
        <div
          className="bg-white rounded-[12px] p-5 sm:p-6 space-y-3"
          style={{ boxShadow: 'var(--sh-card)' }}
        >
          <label className="block text-xs font-semibold text-ink">填报备注说明 (选填)</label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="说明特殊情况、数据口径或提交注意事项"
            className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none"
          />
        </div>
      )}

      {/* 3. Approval Flow Records Tracker */}
      {submission && submission.approvals && submission.approvals.length > 0 && (
        <div
          className="bg-white rounded-[12px] p-6 sm:p-7"
          style={{ boxShadow: 'var(--sh-panel)' }}
        >
          <div
            className="flex items-center justify-between pb-4"
            style={{ borderBottom: '1px solid var(--hairline)' }}
          >
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-canvas text-ink rounded-[10px]">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink tracking-[-0.01em]">三级审批流程监控 (Approval History)</h2>
                <p className="text-[11px] text-mute mt-0.5">经办提交 → 复核审核 → 审批终审</p>
              </div>
            </div>
          </div>

          <div>
            {submission.approvals.map((app, idx) => {
              const levelNames: Record<string, string> = {
                handler: '1. 经办人提交',
                reviewer: '2. 复核人审核',
                approver: '3. 审批人终审',
              };

              const isAppApproved = app.status === 'approved';
              const isAppRejected = app.status === 'rejected';

              return (
                <div
                  key={app.id || idx}
                  className="apple-row px-1 py-4 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-ink tracking-[-0.01em]">
                        {levelNames[app.approval_level]}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${getApprovalBadgeClass(app.status)}`}
                      >
                        {isAppApproved ? '通过' : isAppRejected ? '驳回' : '等候中'}
                      </span>
                    </div>

                    <div className="text-xs text-mute">
                      处理人: <span className="font-semibold text-ink">{app.approver_name}</span>
                    </div>

                    {app.comment && (
                      <div
                        className="text-xs text-body bg-canvas px-3 py-2 rounded-[10px]"
                        style={{ border: '1px solid var(--hairline)' }}
                      >
                        "{app.comment}"
                      </div>
                    )}

                    <div className="text-[10px] text-faint tabular-nums">{app.updated_at || app.created_at}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {importModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
                  共识别到 <span className="tabular-nums">{importAllRows.length}</span> 行数据，以下展示前 <span className="tabular-nums">{importPreviewRows.length}</span> 行预览
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
                      {detailFields.map((df) => {
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
                    </tr>
                  </thead>
                  <tbody>
                    {importPreviewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-hoverbg">
                        <td
                          className="p-2.5 text-center text-mute font-mono tabular-nums"
                          style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--hairline)' }}
                        >
                          {idx + 1}
                        </td>
                        {detailFields.map((df, dfIdx) => (
                          <td
                            key={df.id}
                            className="p-2 text-body tabular-nums"
                            style={{ borderTop: idx === 0 && dfIdx === 0 ? 'none' : '1px solid var(--hairline)' }}
                          >
                            {row[df.id] || (
                              <span className="text-line">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {importAllRows.length > importPreviewRows.length && (
                      <tr>
                        <td
                          colSpan={detailFields.length + 1}
                          className="p-2.5 text-center text-[11px] text-mute"
                          style={{ borderTop: '1px solid var(--hairline)' }}
                        >
                          … 还有 <span className="tabular-nums">{importAllRows.length - importPreviewRows.length}</span> 行数据未展示 …
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
                disabled={importMapping.filter((m) => m.matchedFieldId !== null).length === 0}
                className="h-11 px-5 bg-ink hover:bg-inkhover text-white font-semibold text-xs rounded-md transition-colors disabled:opacity-50"
              >
                确认导入 (<span className="tabular-nums">{importAllRows.length}</span> 行)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
