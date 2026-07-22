import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { api, getStoredUser } from '../services/api';
import {
  ReportAssignment,
  ReportTemplateField,
  ReportSubmissionDetail,
  UserInfo,
} from '../types';

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
      if (!confirm('确定提交该报表？提交后数据将发送至复核人进行合规审核。')) return;
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

      alert(res.message);
      loadData();
    } catch (err: any) {
      alert(err.message || '保存或提交失败');
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  if (loading || !assignment) {
    return <div className="py-12 text-center text-xs text-slate-400">正在加载填报页面数据...</div>;
  }

  const isReadOnly =
    submission &&
    (submission.status === 'pending_review' ||
      submission.status === 'pending_approval' ||
      submission.status === 'approved');

  const isRejected = submission?.status === 'rejected';

  const statusLabels: Record<string, { label: string; color: string }> = {
    draft: { label: '草稿保存中', color: 'bg-slate-100 text-slate-700' },
    pending_review: { label: '已提交 · 待复核人审核', color: 'bg-amber-50 text-amber-700' },
    pending_approval: { label: '复核通过 · 待审批人终审', color: 'bg-blue-50 text-blue-700' },
    approved: { label: '终审通过 · 报表归档', color: 'bg-emerald-50 text-emerald-700' },
    rejected: { label: '被驳回 · 需修正后重新提交', color: 'bg-rose-50 text-rose-700' },
  };

  const currentStatusInfo = statusLabels[submission?.status || 'draft'] || statusLabels.draft;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/fill')}
            className="text-xs text-slate-500 hover:text-blue-600 flex items-center space-x-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回任务列表</span>
          </button>

          <div className="flex items-center space-x-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${currentStatusInfo.color}`}
            >
              {currentStatusInfo.label}
            </span>
            {submission && (
              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 text-xs font-mono font-bold rounded">
                版本 v{submission.version}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{assignment.title}</h1>
            <div className="text-xs text-slate-500 mt-1 flex items-center space-x-4">
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
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? '保存草稿中...' : '保存为草稿'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving || submitting}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? '提交审核中...' : '提交三级审批'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rejection Alert if rejected */}
      {isRejected && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-3 text-xs text-rose-900 shadow-sm">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">您的填报数据已被驳回退回草稿</div>
            <div className="mt-1">
              请根据审核意见修改下方数据后重新提交（提交后系统将自动升级至版本 v
              {(submission?.version || 1) + 1}）。
            </div>
          </div>
        </div>
      )}

      {/* Summary Form Section (汇总字段) */}
      {summaryFields.length > 0 && <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>一、汇总指标数据 (Summary Data)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">请按要求填写分公司整体汇总考核数据</p>
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
              <div key={field.id} className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  {field.field_label}
                  {config.required && <span className="text-red-500 ml-1">*</span>}
                </label>

                {field.field_type === 'select' ? (
                  <select
                    disabled={isReadOnly}
                    value={val}
                    onChange={(e) => handleSummaryChange(field.id, e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500"
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
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500"
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
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>}

      {/* 2. Detail Grid Section (明细字段) */}
      {detailFields.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                <span>{summaryFields.length > 0 ? '二' : '一'}、明细清单填写 (Detail Rows)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">支持多行表格展开添加，系统将自动对数值类型汇总计算</p>
            </div>

            {!isReadOnly && (
              <button
                type="button"
                onClick={addDetailRow}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg transition-colors flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加一行明细</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3 w-12 text-center">#</th>
                  {detailFields.map((df) => (
                    <th key={df.id} className="p-3 min-w-[140px]">
                      {df.field_label}
                    </th>
                  ))}
                  {!isReadOnly && <th className="p-3 w-16 text-center">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50/50">
                    <td className="p-3 text-center text-slate-400 font-mono font-semibold">
                      {rowIndex + 1}
                    </td>

                    {detailFields.map((df) => {
                      const val = row[df.id] || '';
                      const config =
                        typeof df.field_config === 'string'
                          ? JSON.parse(df.field_config || '{}')
                          : df.field_config || {};

                      return (
                        <td key={df.id} className="p-2">
                          {df.field_type === 'select' ? (
                            <select
                              disabled={isReadOnly}
                              value={val}
                              onChange={(e) => handleDetailChange(rowIndex, df.id, e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:bg-slate-100"
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
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:bg-slate-100"
                            />
                          )}
                        </td>
                      );
                    })}

                    {!isReadOnly && (
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeDetailRow(rowIndex)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

      {/* Comment input */}
      {!isReadOnly && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-2">
          <label className="block text-xs font-bold text-slate-700">填报备注说明 (选填)</label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="说明特殊情况、数据口径或提交注意事项"
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </div>
      )}

      {/* 3. Approval Flow Records Tracker */}
      {submission && submission.approvals && submission.approvals.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span>三级审批流程监控 (Approval History)</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  className={`p-4 rounded-xl border space-y-2 relative ${
                    isAppApproved
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : isAppRejected
                      ? 'bg-rose-50/50 border-rose-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800">{levelNames[app.approval_level]}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        isAppApproved
                          ? 'bg-emerald-100 text-emerald-800'
                          : isAppRejected
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {isAppApproved ? '通过' : isAppRejected ? '驳回' : '等候中'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600">
                    处理人: <span className="font-semibold text-slate-900">{app.approver_name}</span>
                  </div>

                  {app.comment && (
                    <div className="text-xs text-slate-500 italic bg-white p-2 rounded-lg border border-slate-100">
                      "{app.comment}"
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400">{app.updated_at || app.created_at}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
