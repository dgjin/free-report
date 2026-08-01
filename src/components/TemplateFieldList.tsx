import React, { useState } from 'react';
import { Sliders, Grid3x3, Type, Hash, Calendar, List, FileText } from './icons';
import { api } from '../services/api';
import { toast, confirmDialog } from '../utils/toast';
import { ReportTemplate, ReportTemplateField, FieldType } from '../types';
import { getTemplateLifecycleView, canMaintainTemplateFields } from '../utils/templateLifecycle';
import { EditFieldModal } from './EditFieldModal';

const fieldTypeIcons: Record<FieldType, any> = {
  text: Type,
  number: Hash,
  date: Calendar,
  select: List,
  textarea: FileText,
};

const fieldTypeLabels: Record<FieldType, string> = {
  text: '单行文本 (text)',
  number: '数值金额 (number)',
  date: '日期选择 (date)',
  select: '下拉单选 (select)',
  textarea: '多行文本 (textarea)',
};

interface TemplateFieldListProps {
  template: ReportTemplate;
  /** 字段发生增删改停用后刷新模板详情 */
  onChanged: () => void;
}

/** 报表自定义字段列表面板：字段卡片展示 + 编辑/删除/停用操作（含编辑弹窗） */
export const TemplateFieldList: React.FC<TemplateFieldListProps> = ({ template, onChanged }) => {
  const [editingField, setEditingField] = useState<ReportTemplateField | null>(null);

  const fieldsList = template.fields || [];
  const lifecycle = getTemplateLifecycleView(template.status);
  const canWrite = lifecycle.canWrite;
  // 设计阶段（从未下发）允许编辑/物理删除字段；下发后仅可停用
  const canMaintainFields = canWrite && canMaintainTemplateFields(template.status, template.assignment_count ?? 0);

  const handleDisableField = async (fieldId: number) => {
    if (!(await confirmDialog('根据报表只增不减设计规范，停用字段后历史数据仍将保留，但新填报不再要求填写。确认停用？'))) return;

    try {
      await api.disableField(template.id, fieldId);
      onChanged();
    } catch (err: any) {
      toast(err.message || '停用字段失败', 'error');
    }
  };

  const handleDeleteField = async (field: ReportTemplateField) => {
    if (
      !(await confirmDialog(
        `即将物理删除字段「${field.field_label}」，删除后不可恢复。仅未下发的模板允许删除字段，确认删除？`,
      ))
    )
      return;

    try {
      await api.deleteField(template.id, field.id);
      toast('字段已删除', 'success');
      onChanged();
    } catch (err: any) {
      toast(err.message || '删除字段失败', 'error');
    }
  };

  return (
    <>
      {/* Unified Template Fields List */}
      <div
        className="bg-white rounded-[12px] p-6 sm:p-7"
        style={{ boxShadow: 'var(--sh-panel)' }}
      >
        <div
          className="flex items-center justify-between pb-4 mb-2"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-canvas text-ink rounded-[10px]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink tracking-[-0.01em]">报表自定义字段列表</h3>
              <div className="text-[11px] text-mute mt-0.5">填报单位将按照以下字段顺序进行表格清单填报</div>
            </div>
          </div>
          <span className="text-xs font-semibold text-ink bg-[rgba(17,17,17,0.08)] px-3 py-1 rounded-full tabular-nums">
            共 {fieldsList.length} 个字段
          </span>
        </div>

        {fieldsList.length === 0 ? (
          <div className="py-14 text-center text-xs text-mute">
            {canWrite ? '暂未添加字段，点击右上角"新增模版字段"即可开始配置' : '该模板暂无字段配置'}
          </div>
        ) : (
          <div>
            {fieldsList.map((field) => {
              const IconComp = fieldTypeIcons[field.field_type] || Type;
              const config =
                typeof field.field_config === 'string'
                  ? JSON.parse(field.field_config || '{}')
                  : field.field_config || {};

              const isActive = field.status === 'active';
              const isMatrix = field.data_type === 'matrix';

              return (
                <div
                  key={field.id}
                  className="apple-row px-1 py-4 flex items-start justify-between gap-3"
                  style={isActive ? {} : { opacity: 0.55 }}
                >
                  <div className="flex items-start space-x-3 min-w-0 flex-1">
                    <div className="p-2 bg-canvas rounded-[10px] shrink-0 mt-0.5 text-ink">
                      {isMatrix ? <Grid3x3 className="w-4 h-4" /> : <IconComp className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-ink flex items-center space-x-1.5 tracking-[-0.01em]">
                        <span className={isActive ? '' : 'line-through'}>{field.field_label}</span>
                        {config.required && <span className="text-[#9F2F2D] font-bold">*</span>}
                      </div>
                      <div className="text-[11px] text-mute font-mono mt-1 truncate">
                        {field.field_name}
                      </div>
                      <div className="mt-2">
                        <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-line text-body">
                          {isMatrix ? '交叉表列' : fieldTypeLabels[field.field_type]}
                        </span>
                      </div>

                      {isMatrix && config.matrix ? (
                        <div
                          className="mt-3 text-[11px] text-body bg-canvas px-3 py-2 rounded-[10px]"
                          style={{ border: '1px solid var(--hairline)' }}
                        >
                          <span className="font-semibold text-ink">交叉表:</span>{' '}
                          行={config.matrix.row_label} ({config.matrix.row_options?.length || 0}项)
                        </div>
                      ) : field.field_type === 'select' && config.options ? (
                        <div
                          className="mt-3 text-[11px] text-mute bg-canvas px-3 py-2 rounded-[10px] truncate"
                          style={{ border: '1px solid var(--hairline)' }}
                        >
                          <span className="font-semibold text-ink">预设选项:</span>{' '}
                          {config.options.join(' / ')}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isActive && canWrite ? (
                      <div className="flex items-center space-x-1">
                        {canMaintainFields && (
                          <>
                            <button
                              onClick={() => setEditingField(field)}
                              className="px-3 py-1.5 text-[11px] text-mute hover:text-ink hover:bg-canvas rounded-full transition-colors font-medium"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleDeleteField(field)}
                              className="px-3 py-1.5 text-[11px] text-mute hover:text-[#9F2F2D] hover:bg-[#FDEBEC] rounded-full transition-colors font-medium"
                            >
                              删除
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDisableField(field.id)}
                          className="px-3 py-1.5 text-[11px] text-mute hover:text-[#9F2F2D] hover:bg-[#FDEBEC] rounded-full transition-colors font-medium"
                        >
                          停用
                        </button>
                      </div>
                    ) : !isActive ? (
                      <span className="text-[11px] text-faint font-medium px-2 py-1">已停用</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Field Modal（设计阶段未下发前） */}
      {editingField && (
        <EditFieldModal
          field={editingField}
          templateId={template.id}
          fields={fieldsList}
          onClose={() => setEditingField(null)}
          onSaved={onChanged}
        />
      )}
    </>
  );
};
