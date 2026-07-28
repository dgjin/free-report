import React from 'react';
import { FileSpreadsheet } from '../icons';
import { ReportTemplateField } from '../../types';
import { FullscreenButton, fullscreenSectionClass, useFullscreen } from '../FullscreenToggle';

interface SummaryFormProps {
  fields: ReportTemplateField[];
  values: Record<string, string>;
  isReadOnly: boolean;
  onChange: (fieldId: number, value: string) => void;
}

/** 汇总字段表单区（一、汇总指标数据） */
export const SummaryForm: React.FC<SummaryFormProps> = ({ fields, values, isReadOnly, onChange }) => {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  if (fields.length === 0) return null;

  return (
    <div
      className={`bg-white p-6 sm:p-7 space-y-5 ${fullscreenSectionClass(isFullscreen, 'rounded-[12px]')}`}
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
        <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map((field) => {
          const val = values[field.id] || '';
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
                  onChange={(e) => onChange(field.id, e.target.value)}
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
                  onChange={(e) => onChange(field.id, e.target.value)}
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
                  onChange={(e) => onChange(field.id, e.target.value)}
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
  );
};
