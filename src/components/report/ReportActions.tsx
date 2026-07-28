import React from 'react';
import { Save, Send } from '../icons';

interface ReportActionsProps {
  saving: boolean;
  submitting: boolean;
  onSave: () => void;
  onSubmit: () => void;
}

/** 填报操作按钮组（保存草稿 / 提交至下发部门） */
export const ReportActions: React.FC<ReportActionsProps> = ({
  saving,
  submitting,
  onSave,
  onSubmit,
}) => {
  return (
    <div className="flex items-center space-x-3 shrink-0">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || submitting}
        className="h-11 px-5 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5 disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        <span>{saving ? '保存草稿中...' : '保存为草稿'}</span>
      </button>

      <button
        type="button"
        onClick={onSubmit}
        disabled={saving || submitting}
        className="h-11 px-5 bg-ink hover:bg-inkhover text-white font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5 disabled:opacity-50"
      >
        <Send className="w-4 h-4" />
        <span>{submitting ? '提交中...' : '提交至下发部门'}</span>
      </button>
    </div>
  );
};
