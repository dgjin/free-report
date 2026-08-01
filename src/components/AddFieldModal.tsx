import React, { useState } from 'react';
import { X } from './icons';
import { api } from '../services/api';
import { toast } from '../utils/toast';
import { FieldType } from '../types';
import { DEFAULT_FIELD_DATA_TYPE } from '../utils/templateFields';

interface AddFieldModalProps {
  templateId: number;
  /** 当前模板已有字段标识，用于生成唯一 field_name */
  existingFieldNames: string[];
  onClose: () => void;
  onSaved: () => void;
}

/** 新增模板字段弹窗：字段标识留空时按规则自动生成，并保证模板内唯一 */
export const AddFieldModal: React.FC<AddFieldModalProps> = ({
  templateId,
  existingFieldNames,
  onClose,
  onSaved,
}) => {
  const [fieldName, setFieldName] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [required, setRequired] = useState(true);
  const [optionsStr, setOptionsStr] = useState('');
  const [minStr, setMinStr] = useState('');
  const [maxStr, setMaxStr] = useState('');
  const [addingField, setAddingField] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldLabel.trim()) return toast('请填写字段显示名称', 'error');

    // Generate or clean field_name
    let cleanFieldName = fieldName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

    if (!cleanFieldName) {
      // Extract ASCII words if available in label
      const asciiMatches = fieldLabel.trim().toLowerCase().match(/[a-z0-9]+/g);
      if (asciiMatches && asciiMatches.length > 0) {
        cleanFieldName = asciiMatches.join('_');
      } else {
        // Generate type-based unique identifier
        const randomSuffix = Math.random().toString(36).substring(2, 7);
        cleanFieldName = `field_${fieldType}_${randomSuffix}`;
      }
    }

    // Ensure uniqueness within current template fields
    const existingNames = new Set(existingFieldNames);
    let finalFieldName = cleanFieldName;
    let counter = 1;
    while (existingNames.has(finalFieldName)) {
      finalFieldName = `${cleanFieldName}_${counter}`;
      counter++;
    }

    setAddingField(true);
    try {
      const options = fieldType === 'select' ? optionsStr.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      const min = fieldType === 'number' && minStr.trim() !== '' ? Number(minStr) : undefined;
      const max = fieldType === 'number' && maxStr.trim() !== '' ? Number(maxStr) : undefined;
      if (min !== undefined && max !== undefined && min > max) {
        setAddingField(false);
        return toast('最小值不能大于最大值', 'error');
      }

      await api.addField(templateId, {
        field_name: finalFieldName,
        field_label: fieldLabel.trim(),
        field_type: fieldType,
        data_type: DEFAULT_FIELD_DATA_TYPE,
        field_config: { required, options, min, max },
        sort_order: existingFieldNames.length + 1,
      });

      onClose();
      onSaved();
    } catch (err: any) {
      toast(err.message || '添加字段失败', 'error');
    } finally {
      setAddingField(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.35)' }}
    >
      <div
        className="bg-white rounded-[12px] max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150"
        style={{ boxShadow: 'var(--sh-overlay)' }}
      >
        <div
          className="flex items-center justify-between pb-3"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <h2 className="text-base font-bold text-ink tracking-[-0.01em]">新增模板字段</h2>
          <button
            onClick={onClose}
            className="text-faint hover:text-ink p-1 rounded-full hover:bg-canvas"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              数据控件类型 <span className="text-[#9F2F2D]">*</span>
            </label>
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as FieldType)}
              className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none"
            >
              <option value="text">文本 (Text)</option>
              <option value="number">数字/金额 (Number)</option>
              <option value="date">日期选择 (Date)</option>
              <option value="select">下拉单选 (Select)</option>
              <option value="textarea">多行文本 (Textarea)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              字段显示名称 (Label) <span className="text-[#9F2F2D]">*</span>
            </label>
            <input
              type="text"
              required
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
              placeholder="例如: 设备名称 / 金额(万元) / 关联项目"
              className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-ink mb-1.5">
              <span>字段唯一标识 (Key Name)</span>
              <span className="text-[10px] text-mute font-normal bg-canvas px-2 py-0.5 rounded-full">不填则系统自动命名</span>
            </label>
            <input
              type="text"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="留空自动生成 (如 field_number_k8x2) 或 输入自定义英文"
              className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs font-mono text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none"
            />
            <p className="text-[10px] text-mute mt-1.5 leading-relaxed">
              如未手动输入，系统将根据字段类型及特征自动为您生成唯一的后台变量名。
            </p>
          </div>

          {fieldType === 'select' && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                下拉预设选项 (逗号分隔)
              </label>
              <input
                type="text"
                value={optionsStr}
                onChange={(e) => setOptionsStr(e.target.value)}
                placeholder="如: 正常, 待维修, 报废"
                className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none"
              />
            </div>
          )}

          {fieldType === 'number' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">最小值 (可选)</label>
                <input
                  type="number"
                  value={minStr}
                  onChange={(e) => setMinStr(e.target.value)}
                  placeholder="不限"
                  className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">最大值 (可选)</label>
                <input
                  type="number"
                  value={maxStr}
                  onChange={(e) => setMaxStr(e.target.value)}
                  placeholder="不限"
                  className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none tabular-nums"
                />
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="req_check"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="w-4 h-4 accent-ink rounded"
            />
            <label htmlFor="req_check" className="text-xs font-semibold text-ink">
              设定为必填字段
            </label>
          </div>

          <div
            className="pt-4 flex justify-end space-x-3"
            style={{ borderTop: '1px solid var(--hairline)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={addingField}
              className="h-11 px-5 bg-ink hover:bg-inkhover text-white font-semibold text-xs rounded-md transition-colors disabled:opacity-50"
            >
              {addingField ? '保存中...' : '追加字段'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
