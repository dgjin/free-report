import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  ArrowLeft,
  Plus,
  Sliders,
  CheckCircle,
  AlertCircle,
  X,
  Type,
  Hash,
  Calendar,
  List,
  FileText,
  ShieldCheck,
  Ban,
  Layers,
  Upload,
  Grid3x3,
  Trash,
} from '../components/icons';
import { api } from '../services/api';
import { toast, confirmDialog } from '../utils/toast';
import { ReportTemplate, ReportTemplateField, FieldType, FieldValidation } from '../types';
import { DEFAULT_FIELD_DATA_TYPE } from '../utils/templateFields';
import { getTemplateLifecycleView, canMaintainTemplateFields } from '../utils/templateLifecycle';
import ExcelFieldImportModal, {
  ImportPayload,
} from '../components/ExcelFieldImportModal';

export const TemplateEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [addFieldModalOpen, setAddFieldModalOpen] = useState<boolean>(false);
  const [excelImportModalOpen, setExcelImportModalOpen] = useState<boolean>(false);

  // New Field Form State
  const [fieldName, setFieldName] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [required, setRequired] = useState(true);
  const [optionsStr, setOptionsStr] = useState('');
  const [minStr, setMinStr] = useState('');
  const [maxStr, setMaxStr] = useState('');
  const [addingField, setAddingField] = useState(false);

  // Matrix (cross-tab) creation state
  const [matrixModalOpen, setMatrixModalOpen] = useState(false);
  const [matrixRowLabel, setMatrixRowLabel] = useState('');
  const [matrixRowOptions, setMatrixRowOptions] = useState('');
  const [matrixColumns, setMatrixColumns] = useState<{ field_label: string; field_type: FieldType }[]>([
    { field_label: '', field_type: 'number' },
  ]);
  const [addingMatrix, setAddingMatrix] = useState(false);

  // Edit Field Modal State（设计阶段未下发前）
  const [editingField, setEditingField] = useState<ReportTemplateField | null>(null);
  const [editFieldName, setEditFieldName] = useState('');
  const [editFieldLabel, setEditFieldLabel] = useState('');
  const [editFieldType, setEditFieldType] = useState<FieldType>('text');
  const [editRequired, setEditRequired] = useState(true);
  const [editOptionsStr, setEditOptionsStr] = useState('');
  const [editMinStr, setEditMinStr] = useState('');
  const [editMaxStr, setEditMaxStr] = useState('');
  // 跨字段校验规则（仅汇总 number 字段）：无 / 等于汇总字段之和 / 等于明细列合计
  const [editRuleType, setEditRuleType] = useState<'none' | 'sum_of' | 'detail_sum_of'>('none');
  const [editSumOf, setEditSumOf] = useState<number[]>([]);
  const [editDetailSumOf, setEditDetailSumOf] = useState<number | ''>('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);

  useEffect(() => {
    if (id) loadTemplateDetail();
  }, [id]);

  const loadTemplateDetail = async () => {
    setLoading(true);
    try {
      const res = await api.getTemplateDetail(parseInt(id!, 10));
      setTemplate(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleExcelImport = async (payload: ImportPayload) => {
    if (!template) throw new Error('模板信息缺失');

    // 获取当前字段列表中的已有 field_name
    const existingNames = new Set(
      (template.fields || []).map((f) => f.field_name)
    );

    const dedupeName = (base: string) => {
      let name = base;
      let counter = 1;
      while (existingNames.has(name)) {
        name = `${base}_${counter}`;
        counter++;
      }
      existingNames.add(name);
      return name;
    };

    // 交叉表：整体导入（行维度 + 列指标），后端统一置 data_type=matrix
    if (payload.format === 'matrix' && payload.matrix) {
      const m = payload.matrix;
      const slug = m.row_label.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      const columns = m.columns.map((c, idx) => ({
        field_name: dedupeName(c.field_name || `matrix_${slug || 'dim'}_${idx + 1}`),
        field_label: c.field_label,
        field_type: c.field_type,
      }));
      await api.addMatrixFields(template.id, {
        row_label: m.row_label,
        row_options: m.row_options,
        columns,
      });
      await loadTemplateDetail();
      return;
    }

    let currentSortOrder = (template.fields || []).length + 1;

    for (const field of payload.fields) {
      await api.addField(template.id, {
        field_name: dedupeName(field.field_name),
        field_label: field.field_label,
        field_type: field.field_type,
        data_type: field.data_type,
        field_config: {
          required: field.required ?? false,
          options:
            field.field_type === 'select' && field.options?.length
              ? field.options
              : undefined,
        },
        sort_order: currentSortOrder,
      });

      currentSortOrder++;
    }

    await loadTemplateDetail();
  };

  const handleAddFieldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return;
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
    const existingNames = new Set(template.fields?.map((f) => f.field_name) || []);
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

      await api.addField(template.id, {
        field_name: finalFieldName,
        field_label: fieldLabel.trim(),
        field_type: fieldType,
        data_type: DEFAULT_FIELD_DATA_TYPE,
        field_config: { required, options, min, max },
        sort_order: (template.fields?.length || 0) + 1,
      });

      setAddFieldModalOpen(false);
      setFieldName('');
      setFieldLabel('');
      setOptionsStr('');
      setMinStr('');
      setMaxStr('');
      loadTemplateDetail();
    } catch (err: any) {
      toast(err.message || '添加字段失败', 'error');
    } finally {
      setAddingField(false);
    }
  };

  const handleAddMatrixSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return;
    if (!matrixRowLabel.trim()) return toast('请填写行维度标签', 'error');
    const rowOptions = matrixRowOptions.split('\n').map((s) => s.trim()).filter(Boolean);
    if (rowOptions.length === 0) return toast('请至少输入一个行选项', 'error');
    const validCols = matrixColumns.filter((c) => c.field_label.trim());
    if (validCols.length === 0) return toast('请至少定义一个列字段', 'error');

    setAddingMatrix(true);
    try {
      const columns = validCols.map((c, idx) => {
        const fieldName = `matrix_${matrixRowLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${idx + 1}`;
        return { field_name: fieldName, field_label: c.field_label.trim(), field_type: c.field_type };
      });
      await api.addMatrixFields(template.id, {
        row_label: matrixRowLabel.trim(),
        row_options: rowOptions,
        columns,
      });
      setMatrixModalOpen(false);
      setMatrixRowLabel('');
      setMatrixRowOptions('');
      setMatrixColumns([{ field_label: '', field_type: 'number' }]);
      loadTemplateDetail();
    } catch (err: any) {
      toast(err.message || '创建交叉表失败', 'error');
    } finally {
      setAddingMatrix(false);
    }
  };

  const handleDisableField = async (fieldId: number) => {
    if (!template) return;
    if (!(await confirmDialog('根据报表只增不减设计规范，停用字段后历史数据仍将保留，但新填报不再要求填写。确认停用？'))) return;

    try {
      await api.disableField(template.id, fieldId);
      loadTemplateDetail();
    } catch (err: any) {
      toast(err.message || '停用字段失败', 'error');
    }
  };

  /** 打开编辑弹窗并回填字段当前配置 */
  const openEditField = (field: ReportTemplateField) => {
    const config =
      typeof field.field_config === 'string'
        ? JSON.parse(field.field_config || '{}')
        : field.field_config || {};
    setEditingField(field);
    setEditFieldName(field.field_name);
    setEditFieldLabel(field.field_label);
    setEditFieldType(field.field_type);
    setEditRequired(!!config.required);
    setEditOptionsStr(Array.isArray(config.options) ? config.options.join(', ') : '');
    setEditMinStr(typeof config.min === 'number' ? String(config.min) : '');
    setEditMaxStr(typeof config.max === 'number' ? String(config.max) : '');
    const rule = config.validation || {};
    if (Array.isArray(rule.sum_of) && rule.sum_of.length > 0) {
      setEditRuleType('sum_of');
      setEditSumOf(rule.sum_of);
      setEditDetailSumOf('');
    } else if (typeof rule.detail_sum_of === 'number') {
      setEditRuleType('detail_sum_of');
      setEditSumOf([]);
      setEditDetailSumOf(rule.detail_sum_of);
    } else {
      setEditRuleType('none');
      setEditSumOf([]);
      setEditDetailSumOf('');
    }
  };

  const handleUpdateFieldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template || !editingField) return;
    if (!editFieldLabel.trim()) return toast('请填写字段显示名称', 'error');

    const cleanName = editFieldName
      .trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (!cleanName) return toast('请填写字段唯一标识', 'error');
    const duplicated = (template.fields || []).some(
      (f) => f.id !== editingField.id && f.field_name === cleanName,
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
      if (editingField.data_type === 'summary' && editFieldType === 'number') {
        if (editRuleType === 'sum_of' && editSumOf.length > 0) {
          validation = { sum_of: editSumOf };
        } else if (editRuleType === 'detail_sum_of' && editDetailSumOf !== '') {
          validation = { detail_sum_of: editDetailSumOf };
        }
      }
      await api.updateField(template.id, editingField.id, {
        field_name: cleanName,
        field_label: editFieldLabel.trim(),
        field_type: editFieldType,
        field_config: { required: editRequired, options, min, max, validation },
      });
      setEditingField(null);
      toast('字段已更新', 'success');
      loadTemplateDetail();
    } catch (err: any) {
      toast(err.message || '更新字段失败', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteField = async (field: ReportTemplateField) => {
    if (!template) return;
    if (
      !(await confirmDialog(
        `即将物理删除字段「${field.field_label}」，删除后不可恢复。仅未下发的模板允许删除字段，确认删除？`,
      ))
    )
      return;

    try {
      await api.deleteField(template.id, field.id);
      toast('字段已删除', 'success');
      loadTemplateDetail();
    } catch (err: any) {
      toast(err.message || '删除字段失败', 'error');
    }
  };

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

  const handleSubmitApproval = async () => {
    if (!template || submittingApproval) return;
    if (!(await confirmDialog('提交后模板将进入审批流程，审批通过前不能编辑或下发。确认提交？'))) return;
    setSubmittingApproval(true);
    try {
      const res = await api.submitTemplateForApproval(template.id);
      toast(res.message, 'success');
      loadTemplateDetail();
    } catch (err: any) {
      toast(err.message || '提交审批失败', 'error');
    } finally {
      setSubmittingApproval(false);
    }
  };

  if (loading || !template) {
    return (
      <div className="max-w-[1280px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)]">
        <div className="text-center text-xs text-mute py-12">正在加载模板设计视图...</div>
      </div>
    );
  }

  const fieldsList = template.fields || [];
  const lifecycle = getTemplateLifecycleView(template.status);
  const canWrite = lifecycle.canWrite;
  // 设计阶段（从未下发）允许编辑/物理删除字段；下发后仅可停用
  const canMaintainFields = canWrite && canMaintainTemplateFields(template.status, template.assignment_count ?? 0);

  return (
    <div className="reveal max-w-[1280px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-5">
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
                  onClick={() => setExcelImportModalOpen(true)}
                  className="h-11 px-5 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>导入Excel</span>
                </button>
                <button
                  onClick={() => setMatrixModalOpen(true)}
                  className="h-11 px-5 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors flex items-center space-x-1.5"
                >
                  <Grid3x3 className="w-4 h-4" />
                  <span>创建交叉表</span>
                </button>
                <button
                  onClick={() => setAddFieldModalOpen(true)}
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
                              onClick={() => openEditField(field)}
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

      {/* Add Field Modal */}
      {addFieldModalOpen && (
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
                onClick={() => setAddFieldModalOpen(false)}
                className="text-faint hover:text-ink p-1 rounded-full hover:bg-canvas"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddFieldSubmit} className="space-y-4">
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
                  onClick={() => setAddFieldModalOpen(false)}
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
      )}
      {/* Edit Field Modal（设计阶段未下发前） */}
      {editingField && (
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
                编辑字段{editingField.data_type === 'matrix' ? '（交叉表列）' : ''}
              </h2>
              <button
                onClick={() => setEditingField(null)}
                className="text-faint hover:text-ink p-1 rounded-full hover:bg-canvas"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateFieldSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  数据控件类型 <span className="text-[#9F2F2D]">*</span>
                </label>
                <select
                  value={editFieldType}
                  onChange={(e) => setEditFieldType(e.target.value as FieldType)}
                  className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none"
                >
                  {editingField.data_type === 'matrix' ? (
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
                {editingField.data_type === 'matrix' && (
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

              {editFieldType === 'select' && editingField.data_type !== 'matrix' && (
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

              {editingField.data_type === 'summary' && editFieldType === 'number' && (
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
                      {(template.fields || [])
                        .filter(
                          (f) =>
                            f.status === 'active' &&
                            f.data_type === 'summary' &&
                            f.field_type === 'number' &&
                            f.id !== editingField.id
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
                      {(template.fields || []).filter(
                        (f) =>
                          f.status === 'active' &&
                          f.data_type === 'summary' &&
                          f.field_type === 'number' &&
                          f.id !== editingField.id
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
                      {(template.fields || [])
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
                  onClick={() => setEditingField(null)}
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
      )}
      {/* Matrix Creation Modal */}
      {matrixModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.35)' }}
        >
          <div
            className="bg-white rounded-[12px] max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: 'var(--sh-overlay)' }}
          >
            <div
              className="flex items-center justify-between pb-3"
              style={{ borderBottom: '1px solid var(--hairline)' }}
            >
              <h2 className="text-base font-bold text-ink tracking-[-0.01em]">创建二维交叉表</h2>
              <button onClick={() => setMatrixModalOpen(false)} className="text-faint hover:text-ink p-1 rounded-full hover:bg-canvas"><X size={18} /></button>
            </div>

            <form onSubmit={handleAddMatrixSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">行维度标签 <span className="text-[#9F2F2D]">*</span></label>
                <input type="text" required value={matrixRowLabel} onChange={(e) => setMatrixRowLabel(e.target.value)}
                  placeholder="如: 产品类别 / 区域 / 业务条线"
                  className="w-full h-11 px-3.5 bg-canvas rounded-[12px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">行选项 (每行一个) <span className="text-[#9F2F2D]">*</span></label>
                <textarea rows={4} required value={matrixRowOptions} onChange={(e) => setMatrixRowOptions(e.target.value)}
                  placeholder={'如:\n产品A\n产品B\n产品C'}
                  className="w-full px-3.5 py-2.5 bg-canvas rounded-[12px] text-xs font-mono text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none" />
                <p className="text-[10px] text-mute mt-1.5">每个选项占一行，将作为交叉表的固定行</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-ink">列字段定义 <span className="text-[#9F2F2D]">*</span></label>
                  <button type="button" onClick={() => setMatrixColumns([...matrixColumns, { field_label: '', field_type: 'number' }])}
                    className="px-2.5 py-1 text-[11px] text-ink hover:bg-[rgba(17,17,17,0.08)] rounded-full font-semibold flex items-center space-x-1">
                    <Plus className="w-3 h-3" /><span>添加列</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {matrixColumns.map((col, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <span className="text-[11px] text-mute font-mono w-6 shrink-0 tabular-nums">列{idx + 1}</span>
                      <input type="text" value={col.field_label} onChange={(e) => {
                        const copy = [...matrixColumns]; copy[idx] = { ...copy[idx], field_label: e.target.value }; setMatrixColumns(copy);
                      }} placeholder="列名称 (如: 1月销售额)" className="flex-1 h-10 px-3 bg-canvas rounded-[10px] text-xs text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none" />
                      <select value={col.field_type} onChange={(e) => {
                        const copy = [...matrixColumns]; copy[idx] = { ...copy[idx], field_type: e.target.value as FieldType }; setMatrixColumns(copy);
                      }} className="h-10 px-2.5 bg-canvas rounded-[10px] text-xs text-ink focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none">
                        <option value="number">数值</option>
                        <option value="text">文本</option>
                        <option value="date">日期</option>
                      </select>
                      {matrixColumns.length > 1 && (
                        <button type="button" onClick={() => setMatrixColumns(matrixColumns.filter((_, i) => i !== idx))}
                          className="p-1.5 text-faint hover:text-[#9F2F2D] hover:bg-[#FDEBEC] rounded-full"><Trash size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {matrixRowLabel.trim() && matrixRowOptions.trim() && matrixColumns.some((c) => c.field_label.trim()) && (
                <div
                  className="p-3 bg-canvas rounded-[12px]"
                  style={{ border: '1px solid var(--hairline)' }}
                >
                  <div className="text-[11px] font-bold text-ink mb-2">交叉表预览</div>
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-white">
                        <th className="p-1.5 text-left font-semibold text-ink" style={{ border: '1px solid var(--hairline)' }}>{matrixRowLabel}</th>
                        {matrixColumns.filter((c) => c.field_label.trim()).map((c, i) => (
                          <th key={i} className="p-1.5 text-center font-semibold text-ink" style={{ border: '1px solid var(--hairline)' }}>{c.field_label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRowOptions.split('\n').filter((s) => s.trim()).slice(0, 3).map((opt, i) => (
                        <tr key={i}>
                          <td className="p-1.5 font-medium text-ink" style={{ border: '1px solid var(--hairline)' }}>{opt.trim()}</td>
                          {matrixColumns.filter((c) => c.field_label.trim()).map((_, j) => (
                            <td key={j} className="p-1.5 text-center text-line" style={{ border: '1px solid var(--hairline)' }}>—</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div
                className="pt-4 flex justify-end space-x-3"
                style={{ borderTop: '1px solid var(--hairline)' }}
              >
                <button type="button" onClick={() => setMatrixModalOpen(false)}
                  className="h-11 px-5 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors">取消</button>
                <button type="submit" disabled={addingMatrix}
                  className="h-11 px-5 bg-ink hover:bg-inkhover text-white font-semibold text-xs rounded-md transition-colors disabled:opacity-50">
                  {addingMatrix ? '创建中...' : '创建交叉表'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      <ExcelFieldImportModal
        open={excelImportModalOpen}
        onClose={() => setExcelImportModalOpen(false)}
        onImport={handleExcelImport}
      />
    </div>
  );
};
