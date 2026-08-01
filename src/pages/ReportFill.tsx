import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, XCircle } from '../components/icons';
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
import { buildMatrixGroups } from '../utils/aggregationView';
import { validateSubmission, ValidationIssue } from '../utils/dataValidation';
import { exportSubmissionToExcel } from '../utils/reportExport';
import { SummaryForm } from '../components/report/SummaryForm';
import { DetailTable } from '../components/report/DetailTable';
import { CrossTable, MatrixGroup } from '../components/report/CrossTable';
import { ApprovalTimeline } from '../components/report/ApprovalTimeline';
import { ReportActions } from '../components/report/ReportActions';

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  // 提交前校验发现的错误（保存草稿不校验）
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);

  const [user, setUser] = useState<UserInfo | null>(getStoredUser());

  useEffect(() => {
    if (assignmentId) {
      loadData();
    }
  }, [assignmentId]);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const aId = parseInt(assignmentId!, 10);
      if (isNaN(aId)) {
        setLoadError('任务 ID 无效');
        return;
      }
      const aRes = await api.getAssignmentDetail(aId);
      if (!aRes || aRes.status === 'recalled') {
        toast('该任务已撤回或不存在');
        navigate('/fill', { replace: true });
        return;
      }
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
        (subRes.summary || []).forEach((item) => {
          if (item.value) {
            summaryDataMap[item.field_id] = item.value;
          }
        });
        setSummaryForm(summaryDataMap);

        // Populate Detail Rows
        const parsedDetailRows: Array<Record<string, string>> = [];
        if (subRes.details && subRes.details.length > 0) {
          subRes.details.forEach((rowItems) => {
            const rowObj: Record<string, string> = {};
            rowItems.forEach((item) => {
              rowObj[item.field_id] = item.value;
            });
            parsedDetailRows.push(rowObj);
          });
        }

        // Fallback: 当 detail 字段数据被错误存储为 row_index=0 时
        // 会出现在 subRes.summary 中，用 data_type 识别并回补到 detailRows
        const detailTypeFields = activeFields.filter((f) => f.data_type === 'detail');
        if (parsedDetailRows.length === 0 && detailTypeFields.length > 0) {
          const orphanDetailRow: Record<string, string> = {};
          let hasDetailData = false;
          (subRes.summary || []).forEach((item) => {
            if (item.data_type === 'detail' && item.value) {
              orphanDetailRow[item.field_id] = item.value;
              hasDetailData = true;
            }
          });
          if (hasDetailData) {
            parsedDetailRows.push(orphanDetailRow);
          }
        }

        if (parsedDetailRows.length > 0) {
          setDetailRows(parsedDetailRows);
        } else {
          setDetailRows([{}]); // default 1 empty detail row
        }
      } catch (err: unknown) {
        // Log error and show empty form
        console.error('获取填报数据失败:', err);
        const message = err instanceof Error ? err.message : '获取填报数据失败，请稍后重试';
        setLoadError(message);
        setDetailRows([{}]);
      }
    } catch (err: unknown) {
      console.error('加载填报页面失败:', err);
      const message = err instanceof Error ? err.message : '加载填报页面数据失败，请稍后重试';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  };

  const summaryFields = fields.filter((f) => f.data_type === 'summary');
  const detailFields = fields.filter((f) => f.data_type === 'detail');
  const matrixFields = fields.filter((f) => f.data_type === 'matrix');

  // Group matrix fields by their row_label (each group = one cross-tab table)
  // 共享实现：与汇总视图一致，含 field_config 非法 JSON 容错
  const matrixGroups = useMemo<MatrixGroup[]>(
    () => buildMatrixGroups(matrixFields),
    [matrixFields],
  );

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

  const handleSave = async (isSubmit: boolean) => {
    if (!assignment) return;

    if (isSubmit) {
      // 提交时强校验并阻断；保存草稿不校验
      const issues = validateSubmission(fields, summaryForm, detailRows, matrixGroups);
      setValidationIssues(issues);
      if (issues.length > 0) {
        toast(`存在 ${issues.length} 项校验错误，请修正后提交`, 'error');
        return;
      }
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

  // 导出当前已填报数据到本地 Excel（填报信息 + 汇总指标 + 明细数据 + 交叉表）
  const handleExport = async () => {
    if (!assignment || exporting) return;
    setExporting(true);
    try {
      await exportSubmissionToExcel({
        assignment,
        summaryFields,
        detailFields,
        matrixGroups,
        summaryForm,
        detailRows,
        submission,
      });
      toast('导出成功，已保存到本地下载目录', 'success');
    } catch (err: any) {
      toast(err.message || '导出失败，请稍后重试', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading || !assignment) {
    return (
      <div className="max-w-[1280px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)]">
        {loadError ? (
          <div className="text-center py-12">
            <div className="text-red-500 text-sm mb-4">{loadError}</div>
            <button
              className="bg-primary text-white px-5 py-2 rounded-md text-sm hover:bg-primary/90 transition-colors"
              onClick={() => { setLoadError(null); loadData(); }}
            >
              重新加载
            </button>
          </div>
        ) : (
          <div className="text-center text-xs text-mute py-12">正在加载填报页面数据...</div>
        )}
      </div>
    );
  }

  const workflowView = getSubmissionWorkflowView(submission?.status);
  const canFill = user ? getClientAccess(user).canFill : false;
  const isReadOnly = workflowView.isReadOnly || !canFill;

  const isRejected = submission?.status === 'rejected' || submission?.status === 'returned';

  // 区块序号：汇总 → 明细 → 交叉表
  const detailSectionNum = summaryFields.length > 0 ? '二' : '一';
  const matrixSectionNum = summaryFields.length > 0
    ? (detailFields.length > 0 ? '三' : '二')
    : (detailFields.length > 0 ? '二' : '一');

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

  return (
    <div className="reveal max-w-[1280px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-5 pb-12">
      {/* 数据加载异常提示 */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-red-600 text-sm">{loadError}</span>
          <button
            className="text-red-600 hover:text-red-700 text-xs font-medium underline ml-4 shrink-0"
            onClick={() => { setLoadError(null); loadData(); }}
          >
            重试
          </button>
        </div>
      )}

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

          <div className="flex items-center gap-2 shrink-0">
            {submission && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-canvas text-[12px] font-semibold text-ink hover:bg-line transition-colors disabled:opacity-50"
                title="将已填报数据导出为 Excel 保存到本地"
              >
                <Download className="w-3.5 h-3.5" />
                {exporting ? '导出中...' : '导出数据'}
              </button>
            )}
            {!isReadOnly && (
              <ReportActions
                saving={saving}
                submitting={submitting}
                onSave={() => handleSave(false)}
                onSubmit={() => handleSave(true)}
              />
            )}
          </div>
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

      {/* 提交校验错误面板 */}
      {validationIssues.length > 0 && (
        <div
          className="bg-[#FDEBEC] rounded-[12px] px-5 py-4 flex items-start space-x-3 text-xs"
          style={{ border: '1px solid #FDEBEC' }}
        >
          <XCircle className="w-[18px] h-[18px] text-[#9F2F2D] shrink-0 mt-0.5" />
          <div className="space-y-1.5 min-w-0">
            <div className="font-bold text-ink">
              存在 {validationIssues.length} 项校验错误，请修正后重新提交
            </div>
            <ul className="text-[#9F2F2D] leading-relaxed space-y-0.5 list-disc list-inside">
              {validationIssues.slice(0, 10).map((issue, idx) => (
                <li key={`${issue.scope}-${issue.field_id}-${issue.row ?? 0}-${idx}`}>{issue.message}</li>
              ))}
            </ul>
            {validationIssues.length > 10 && (
              <div className="text-mute">仅显示前 10 条，共 {validationIssues.length} 条</div>
            )}
          </div>
        </div>
      )}

      {/* 汇总字段表单区 */}
      <SummaryForm
        fields={summaryFields}
        values={summaryForm}
        isReadOnly={isReadOnly}
        onChange={handleSummaryChange}
      />

      {/* 明细数据表格区（含 Excel 导入/导出） */}
      <DetailTable
        fields={detailFields}
        rows={detailRows}
        isReadOnly={isReadOnly}
        sectionNumber={detailSectionNum}
        templateTitle={assignment.title}
        onRowsChange={setDetailRows}
      />

      {/* 交叉表/矩阵数据区 */}
      <CrossTable
        groups={matrixGroups}
        rows={detailRows}
        isReadOnly={isReadOnly}
        sectionNumber={matrixSectionNum}
        onChange={handleMatrixChange}
      />

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

      {/* 审批流程时间线 */}
      {submission && <ApprovalTimeline approvals={submission.approvals} />}
    </div>
  );
};
