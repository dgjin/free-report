import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Upload, Grid3x3, CheckCircle, ShieldCheck } from './icons';
import { api } from '../services/api';
import { toast, confirmDialog } from '../utils/toast';
import { ReportTemplate } from '../types';
import { getTemplateLifecycleView } from '../utils/templateLifecycle';

interface TemplateEditorHeaderProps {
  template: ReportTemplate;
  /** 模板状态发生变化（如提交审批成功）后刷新详情 */
  onChanged: () => void;
  onImportExcel: () => void;
  onCreateMatrix: () => void;
  onAddField: () => void;
  /** 审批角色等只读查看，不可编辑（即使模板状态允许） */
  readOnly?: boolean;
}

/** 模板设计页头部：标题与操作区、只读提示、只增不减设计规范说明 */
export const TemplateEditorHeader: React.FC<TemplateEditorHeaderProps> = ({
  template,
  onChanged,
  onImportExcel,
  onCreateMatrix,
  onAddField,
  readOnly = false,
}) => {
  const navigate = useNavigate();
  const [submittingApproval, setSubmittingApproval] = useState(false);

  const lifecycle = getTemplateLifecycleView(template.status);
  // 审批角色只读查看，即使模板状态允许编辑
  const canWrite = !readOnly && lifecycle.canWrite;

  const handleSubmitApproval = async () => {
    if (submittingApproval) return;
    if (!(await confirmDialog('提交后模板将进入审批流程，审批通过前不能编辑或下发。确认提交？'))) return;
    setSubmittingApproval(true);
    try {
      const res = await api.submitTemplateForApproval(template.id);
      toast(res.message, 'success');
      onChanged();
    } catch (err: any) {
      toast(err.message || '提交审批失败', 'error');
    } finally {
      setSubmittingApproval(false);
    }
  };

  return (
    <>
      {/* Top Header */}
      <div
        className="bg-white rounded-[12px] p-6 sm:p-7"
        style={{ boxShadow: 'var(--sh-panel)' }}
      >
        <button
          onClick={() => navigate('/templates')}
          className="text-xs text-mute hover:text-ink flex items-center space-x-1 mb-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded-full px-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回模板列表</span>
        </button>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center space-x-3 flex-wrap">
              <h1 className="t-serif text-[26px] text-ink leading-tight">
                {template.name}
              </h1>
              <span className="px-2.5 py-0.5 bg-line text-ink text-[11px] font-semibold rounded-full">
                {template.period_type}
              </span>
            </div>
            <p className="text-xs text-mute">{template.description || '暂无说明'}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canWrite && (
              <>
                <button
                  onClick={onImportExcel}
                  className="h-11 px-5 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>导入Excel</span>
                </button>
                <button
                  onClick={onCreateMatrix}
                  className="h-11 px-5 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5"
                >
                  <Grid3x3 className="w-4 h-4" />
                  <span>创建交叉表</span>
                </button>
                <button
                  onClick={onAddField}
                  className="h-11 px-5 bg-ink hover:bg-inkhover text-white font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>新增模版字段</span>
                </button>
              </>
            )}
            {lifecycle.canSubmitApproval && (
              <button
                onClick={handleSubmitApproval}
                disabled={submittingApproval}
                className="h-11 px-5 bg-[#1F6C9F] hover:bg-[#1a5a85] text-white font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{submittingApproval ? '提交中...' : '提交审批'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {!canWrite && (
        <div
          className="bg-canvas rounded-[12px] px-5 py-4 text-xs text-body"
          style={{ border: '1px solid var(--hairline)' }}
        >
          {lifecycle.readOnlyMessage}
        </div>
      )}

      {/* Safety Notice */}
      <div
        className="bg-[#FDEBEC] rounded-[12px] px-5 py-4 flex items-start space-x-3 text-xs"
        style={{ border: '1px solid #FDEBEC' }}
      >
        <ShieldCheck className="w-[18px] h-[18px] text-[#9F2F2D] shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-bold text-ink">只增不减设计规范（Ensure Backward Compatibility）</div>
          <div className="text-mute leading-relaxed">
            随手报采用字段安全兼容策略：模板未下发前（设计阶段）可自由编辑、删除字段；一经下发，字段不可修改或物理删除，仅可"停用"。已停用字段会在历史版本中安全呈现，保证历史数据完整性与合规可溯。
          </div>
        </div>
      </div>
    </>
  );
};
