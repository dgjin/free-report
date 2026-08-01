import React, { useState } from 'react';
import { X } from './icons';
import { api } from '../services/api';
import { toast } from '../utils/toast';
import { ReportTemplateField, FieldType, FieldValidation } from '../types';

interface EditFieldModalProps {
  /** 正在编辑的字段（设计阶段未下发前才可编辑） */
  field: ReportTemplateField;
  templateId: number;
  /** 模板全部字段：校验规则候选列表与标识重名检查用 */
  fields: ReportTemplateField[];
  onClose: () => void;
  onSaved: () => void;
}

/** 编辑字段弹窗（设计阶段未下发前）：基础配置 + 汇总数值字段的跨字段校验规则 */
export const EditFieldModal: React.FC<EditFieldModalProps> = ({
  field,
  templateId,
  fields,
  onClose,
  onSaved,
}) => {
  // 回填字段当前配置
  const config =
    typeof field.field_config === 'string'
      ? JSON.parse(field.field_config || '{}')
      : field.field_config || {};
  const rule = config.validation || {};
  const initialRuleType: 'none' | 'sum_of' | 'detail_sum_of' =
    Array.isArray(rule.sum_of) && rule.sum_of.length > 0
      ? 'sum_of'
      : typeof rule.detail_sum_of === 'number'
        ? 'detail_sum_of'
        : 'none';

  const [editFieldName, setEditFieldName] = useState(field.field_name);
  const [editFieldLabel, setEditFieldLabel] = useState(field.field_label);
  const [editFieldType, setEditFieldType] = useState<FieldType>(field.field_type);
  const [editRequired, setEditRequired] = useState(!!config.required);
  const [editOptionsStr, setEditOptionsStr] = useState(
    Array.isArray(config.options) ? config.options.join(', ') : ''
  );
  const [editMinStr, setEditMinStr] = useState(
    typeof config.min === 'number' ? String(config.min) : ''
  );
  const [editMaxStr, setEditMaxStr] = useState(
    typeof config.max === 'number' ? String(config.max) : ''
  );
  // 跨字段校验规则（仅汇总 number 字段）：无 / 等于汇总字段之和 / 等于明细列合计
  const [editRuleType, setEditRuleType] = useState<'none' | 'sum_of' | 'detail_sum_of'>(initialRuleType);
  const [editSumOf, setEditSumOf] = useState<number[]>(
    initialRuleType === 'sum_of' ? rule.sum_of : []
  );
  const [editDetailSumOf, setEditDetailSumOf] = useState<number | ''>(
    initialRuleType === 'detail_sum_of' ? rule.detail_sum_of : ''
  );
  const [savingEdit, setSavingEdit] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFieldLabel.trim()) return toast('请填写字段显示名称', 'error');

    const cleanName = editFieldName
      .trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (!cleanName) return toast('请填写字段唯一标识', 'error');
    const duplicated = fields.some(
      (f) => f.id !== field.id && f.field_name === cleanName,
    );
    if (duplicated) return toast(`字段标识 "${cleanName}" 已被其他字段使用`, 'error');

    setSavingEdit(true);
    try {
      const options =
        editFieldType === 'select'
          ? editOptionsStr.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined;
      const min = editFieldType === 'number' && editMinStr.trim() !== '' ? Number(editMinStr) : undefined;
      const max = editFieldType === 'number' && editMaxStr.trim() !== '' ? Number(editMaxStr) : undefined;
      if (min !== undefined && max !== undefined && min > max) {
        setSavingEdit(false);
        return toast('最小值不能大于最大值', 'error');
      }
      // 跨字段规则：仅汇总 number 字段可配置（二选一）
      let validation: FieldValidation | undefined;
      if (field.data_type === 'summary' && editFieldType === 'number') {
        if (editRuleType === 'sum_of' && editSumOf.length > 0) {
          validation = { sum_of: editSumOf };
        } else if (editRuleType === 'detail_sum_of' && editDetailSumOf !== '') {
          validation = { detail_sum_of: editDetailSumOf };
        }
      }
      await api.updateField(templateId, field.id, {
        field_name: cleanName,
        field_label: editFieldLabel.trim(),
        field_type: editFieldType,
        field_config: { required: editRequired, options, min, max, validation },
      });
      onClose();
      toast('字段已更新', 'success');
      onSaved();
    } catch (err: any) {
      toast(err.message || '更新字段失败', 'error');
    } finally {
      setSavingEdit(false);
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
          <h2 className="text-base font-bold text-ink tracking-[-0.01em]">
            编辑字段{field.data_type === 'matrix' ? '（交叉表列）' : ''}
          </h2>
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
              value={editFieldType}
              onChange={(e) => setEditFieldType(e.target.value as FieldType)}
              className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none"
            >
              {field.data_type === 'matrix' ? (
                <>
                  <option value="number">数值 (Number)</option>
                  <option value="text">文本 (Text)</option>
                  <option value="date">日期 (Date)</option>
                </>
              ) : (
                <>
                  <option value="text">文本 (Text)</option>
                  <option value="number">数字/金额 (Number)</option>
                  <option value="date">日期选择 (Date)</option>
                  <option value="select">下拉单选 (Select)</option>
                  <option value="textarea">多行文本 (Textarea)</option>
                </>
              )}
            </select>
            {field.data_type === 'matrix' && (
              <p className="text-[10px] text-mute mt-1.5 leading-relaxed">
                交叉表列仅可调整列名称、数据类型与必填；行维度配置保持不变。
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              字段显示名称 (Label) <span className="text-[#9F2F2D]">*</span>
            </label>
            <input
              type="text"
              required
              value={editFieldLabel}
              onChange={(e) => setEditFieldLabel(e.target.value)}
              placeholder="例如: 设备名称 / 金额(万元) / 关联项目"
              className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              字段唯一标识 (Key Name)
            </label>
            <input
              type="text"
              required
              value={editFieldName}
              onChange={(e) => setEditFieldName(e.target.value)}
              placeholder="小写英文/数字/下划线"
              className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs font-mono text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none"
            />
            <p className="text-[10px] text-mute mt-1.5 leading-relaxed">
              仅未下发的模板允许修改标识；模板内必须唯一。
            </p>
          </div>

          {editFieldType === 'select' && field.data_type !== 'matrix' && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                下拉预设选项 (逗号分隔)
              </label>
              <input
                type="text"
                value={editOptionsStr}
                onChange={(e) => setEditOptionsStr(e.target.value)}
                placeholder="如: 正常, 待维修, 报废"
                className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none"
              />
            </div>
          )}

          {editFieldType === 'number' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">最小值 (可选)</label>
                <input
                  type="number"
                  value={editMinStr}
                  onChange={(e) => setEditMinStr(e.target.value)}
                  placeholder="不限"
                  className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">最大值 (可选)</label>
                <input
                  type="number"
                  value={editMaxStr}
                  onChange={(e) => setEditMaxStr(e.target.value)}
                  placeholder="不限"
                  className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none tabular-nums"
                />
              </div>
            </div>
          )}

          {field.data_type === 'summary' && editFieldType === 'number' && (
            <div className="space-y-2.5 p-3.5 bg-canvas rounded-[12px]">
              <label className="block text-xs font-semibold text-ink">校验规则 (提交时检查)</label>
              <div className="space-y-1.5">
                {([
                  { value: 'none', label: '无' },
                  { value: 'sum_of', label: '等于以下汇总字段之和' },
                  { value: 'detail_sum_of', label: '等于明细列合计' },
                ] as const).map((opt) => (
                  <label key={opt.value} className="flex items-center space-x-2 text-xs text-ink cursor-pointer">
                    <input
                      type="radio"
                      name="edit_rule_type"
                      checked={editRuleType === opt.value}
                      onChange={() => setEditRuleType(opt.value)}
                      className="w-3.5 h-3.5 accent-ink"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              {editRuleType === 'sum_of' && (
                <div className="max-h-36 overflow-y-auto space-y-1 bg-white rounded-[10px] p-2.5">
                  {fields
                    .filter(
                      (f) =>
                        f.status === 'active' &&
                        f.data_type === 'summary' &&
                        f.field_type === 'number' &&
                        f.id !== field.id
                    )
                    .map((f) => (
                      <label key={f.id} className="flex items-center space-x-2 text-xs text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editSumOf.includes(f.id)}
                          onChange={(e) =>
                            setEditSumOf((prev) =>
                              e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id)
                            )
                          }
                          className="w-3.5 h-3.5 accent-ink rounded"
                        />
                        <span>{f.field_label}</span>
                      </label>
                    ))}
                  {fields.filter(
                    (f) =>
                      f.status === 'active' &&
                      f.data_type === 'summary' &&
                      f.field_type === 'number' &&
                      f.id !== field.id
                  ).length === 0 && (
                    <p className="text-[10px] text-mute">暂无其他可选的汇总数字字段</p>
                  )}
                </div>
              )}

              {editRuleType === 'detail_sum_of' && (
                <select
                  value={editDetailSumOf === '' ? '' : String(editDetailSumOf)}
                  onChange={(e) =>
                    setEditDetailSumOf(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full h-11 px-3.5 bg-white rounded-[10px] text-xs text-ink focus:ring-1 focus:ring-ink focus:outline-none"
                >
                  <option value="">请选择明细/交叉表数字列</option>
                  {fields
                    .filter(
                      (f) =>
                        f.status === 'active' &&
                        (f.data_type === 'detail' || f.data_type === 'matrix') &&
                        f.field_type === 'number'
                    )
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.field_label}
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="edit_req_check"
              checked={editRequired}
              onChange={(e) => setEditRequired(e.target.checked)}
              className="w-4 h-4 accent-ink rounded"
            />
            <label htmlFor="edit_req_check" className="text-xs font-semibold text-ink">
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
              disabled={savingEdit}
              className="h-11 px-5 bg-ink hover:bg-inkhover text-white font-semibold text-xs rounded-md transition-colors disabled:opacity-50"
            >
              {savingEdit ? '保存中...' : '保存修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
