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
} from 'lucide-react';
import { api } from '../services/api';
import { ReportTemplate, ReportTemplateField, FieldType } from '../types';
import { DEFAULT_FIELD_DATA_TYPE } from '../utils/templateFields';
import { getTemplateLifecycleView } from '../utils/templateLifecycle';
import ExcelFieldImportModal, {
  ImportFieldItem,
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
  const [addingField, setAddingField] = useState(false);

  // Matrix (cross-tab) creation state
  const [matrixModalOpen, setMatrixModalOpen] = useState(false);
  const [matrixRowLabel, setMatrixRowLabel] = useState('');
  const [matrixRowOptions, setMatrixRowOptions] = useState('');
  const [matrixColumns, setMatrixColumns] = useState<{ field_label: string; field_type: FieldType }[]>([
    { field_label: '', field_type: 'number' },
  ]);
  const [addingMatrix, setAddingMatrix] = useState(false);

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

  const handleExcelImport = async (importFields: ImportFieldItem[]) => {
    if (!template) throw new Error('模板信息缺失');

    // 获取当前字段列表中的已有 field_name
    const existingNames = new Set(
      (template.fields || []).map((f) => f.field_name)
    );

    let currentSortOrder = (template.fields || []).length + 1;

    // 为每个导入的字段去重命名
    for (const field of importFields) {
      let fieldName = field.field_name;
      let counter = 1;

      // 确保 field_name 全局唯一
      while (existingNames.has(fieldName)) {
        fieldName = `${field.field_name}_${counter}`;
        counter++;
      }
      existingNames.add(fieldName);

      await api.addField(template.id, {
        field_name: fieldName,
        field_label: field.field_label,
        field_type: field.field_type,
        data_type: field.data_type,
        field_config: { required: false },
        sort_order: currentSortOrder,
      });

      currentSortOrder++;
    }

    await loadTemplateDetail();
  };

  const handleAddFieldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return;
    if (!fieldLabel.trim()) return alert('请填写字段显示名称');

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

      await api.addField(template.id, {
        field_name: finalFieldName,
        field_label: fieldLabel.trim(),
        field_type: fieldType,
        data_type: DEFAULT_FIELD_DATA_TYPE,
        field_config: { required, options },
        sort_order: (template.fields?.length || 0) + 1,
      });

      setAddFieldModalOpen(false);
      setFieldName('');
      setFieldLabel('');
      setOptionsStr('');
      loadTemplateDetail();
    } catch (err: any) {
      alert(err.message || '添加字段失败');
    } finally {
      setAddingField(false);
    }
  };

  const handleAddMatrixSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return;
    if (!matrixRowLabel.trim()) return alert('请填写行维度标签');
    const rowOptions = matrixRowOptions.split('\n').map((s) => s.trim()).filter(Boolean);
    if (rowOptions.length === 0) return alert('请至少输入一个行选项');
    const validCols = matrixColumns.filter((c) => c.field_label.trim());
    if (validCols.length === 0) return alert('请至少定义一个列字段');

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
      alert(err.message || '创建交叉表失败');
    } finally {
      setAddingMatrix(false);
    }
  };

  const handleDisableField = async (fieldId: number) => {
    if (!template) return;
    if (!confirm('根据报表只增不减设计规范，停用字段后历史数据仍将保留，但新填报不再要求填写。确认停用？')) return;

    try {
      await api.disableField(template.id, fieldId);
      loadTemplateDetail();
    } catch (err: any) {
      alert(err.message || '停用字段失败');
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

  if (loading || !template) {
    return (
      <div className="max-w-[1080px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)]">
        <div className="text-center text-xs text-[#86868b] py-12">正在加载模板设计视图...</div>
      </div>
    );
  }

  const fieldsList = template.fields || [];
  const lifecycle = getTemplateLifecycleView(template.status);
  const canWrite = lifecycle.canWrite;

  return (
    <div className="max-w-[1080px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-5">
      {/* Top Header */}
      <div
        className="bg-white rounded-[22px] p-6 sm:p-7"
        style={{ boxShadow: 'var(--sh-panel)' }}
      >
        <button
          onClick={() => navigate('/templates')}
          className="text-xs text-[#6e6e73] hover:text-[#0071e3] flex items-center space-x-1 mb-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] rounded-full px-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回模板列表</span>
        </button>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center space-x-3 flex-wrap">
              <h1 className="text-[22px] font-bold text-[#1d1d1f] tracking-[-0.03em] leading-tight">
                {template.name}
              </h1>
              <span className="px-2.5 py-0.5 bg-[#e8e8ed] text-[#1d1d1f] text-[11px] font-semibold rounded-full">
                {template.period_type}
              </span>
            </div>
            <p className="text-xs text-[#6e6e73]">{template.description || '暂无说明'}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canWrite && (
              <>
                <button
                  onClick={() => setExcelImportModalOpen(true)}
                  className="h-11 px-5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold text-xs rounded-full transition-colors flex items-center space-x-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>导入Excel</span>
                </button>
                <button
                  onClick={() => setMatrixModalOpen(true)}
                  className="h-11 px-5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold text-xs rounded-full transition-colors flex items-center space-x-1.5"
                >
                  <Grid3x3 className="w-4 h-4" />
                  <span>创建交叉表</span>
                </button>
                <button
                  onClick={() => setAddFieldModalOpen(true)}
                  className="h-11 px-5 bg-[#0071e3] hover:bg-[#0066cc] text-white font-semibold text-xs rounded-full transition-colors flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>新增模版字段</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {!canWrite && (
        <div
          className="bg-[#f5f5f7] rounded-[18px] px-5 py-4 text-xs text-[#424245]"
          style={{ border: '1px solid rgba(0,0,0,0.07)' }}
        >
          {lifecycle.readOnlyMessage}
        </div>
      )}

      {/* Safety Notice */}
      <div
        className="bg-[rgba(255,107,0,0.08)] rounded-[18px] px-5 py-4 flex items-start space-x-3 text-xs"
        style={{ border: '1px solid rgba(255,107,0,0.18)' }}
      >
        <ShieldCheck className="w-[18px] h-[18px] text-[#ff6b00] shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-bold text-[#1d1d1f]">只增不减设计规范（Ensure Backward Compatibility）</div>
          <div className="text-[#6e6e73] leading-relaxed">
            自由报表采用字段安全兼容策略：发布后的字段不可物理删除，仅可"停用"。已停用字段会在历史版本中安全呈现，保证历史数据完整性与合规可溯。
          </div>
        </div>
      </div>

      {/* Unified Template Fields List */}
      <div
        className="bg-white rounded-[22px] p-6 sm:p-7"
        style={{ boxShadow: 'var(--sh-panel)' }}
      >
        <div
          className="flex items-center justify-between pb-4 mb-2"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-[#f5f5f7] text-[#1d1d1f] rounded-[10px]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1d1d1f] tracking-[-0.01em]">报表自定义字段列表</h3>
              <div className="text-[11px] text-[#86868b] mt-0.5">填报单位将按照以下字段顺序进行表格清单填报</div>
            </div>
          </div>
          <span className="text-xs font-semibold text-[#0071e3] bg-[rgba(0,113,227,0.08)] px-3 py-1 rounded-full tabular-nums">
            共 {fieldsList.length} 个字段
          </span>
        </div>

        {fieldsList.length === 0 ? (
          <div className="py-14 text-center text-xs text-[#86868b]">
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
                    <div className="p-2 bg-[#f5f5f7] rounded-[10px] shrink-0 mt-0.5 text-[#1d1d1f]">
                      {isMatrix ? <Grid3x3 className="w-4 h-4" /> : <IconComp className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-[#1d1d1f] flex items-center space-x-1.5 tracking-[-0.01em]">
                        <span className={isActive ? '' : 'line-through'}>{field.field_label}</span>
                        {config.required && <span className="text-[#ff6b00] font-bold">*</span>}
                      </div>
                      <div className="text-[11px] text-[#86868b] font-mono mt-1 truncate">
                        {field.field_name}
                      </div>
                      <div className="mt-2">
                        <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#e8e8ed] text-[#424245]">
                          {isMatrix ? '交叉表列' : fieldTypeLabels[field.field_type]}
                        </span>
                      </div>

                      {isMatrix && config.matrix ? (
                        <div
                          className="mt-3 text-[11px] text-[#424245] bg-[#f5f5f7] px-3 py-2 rounded-[10px]"
                          style={{ border: '1px solid rgba(0,0,0,0.07)' }}
                        >
                          <span className="font-semibold text-[#1d1d1f]">交叉表:</span>{' '}
                          行={config.matrix.row_label} ({config.matrix.row_options?.length || 0}项)
                        </div>
                      ) : field.field_type === 'select' && config.options ? (
                        <div
                          className="mt-3 text-[11px] text-[#6e6e73] bg-[#f5f5f7] px-3 py-2 rounded-[10px] truncate"
                          style={{ border: '1px solid rgba(0,0,0,0.07)' }}
                        >
                          <span className="font-semibold text-[#1d1d1f]">预设选项:</span>{' '}
                          {config.options.join(' / ')}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isActive && canWrite ? (
                      <button
                        onClick={() => handleDisableField(field.id)}
                        className="px-3 py-1.5 text-[11px] text-[#6e6e73] hover:text-[#ff6b00] hover:bg-[rgba(255,107,0,0.08)] rounded-full transition-colors font-medium"
                      >
                        停用
                      </button>
                    ) : !isActive ? (
                      <span className="text-[11px] text-[#aeaeb2] font-medium px-2 py-1">已停用</span>
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
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        >
          <div
            className="bg-white rounded-[22px] max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150"
            style={{ boxShadow: 'var(--sh-overlay)' }}
          >
            <div
              className="flex items-center justify-between pb-3"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}
            >
              <h2 className="text-base font-bold text-[#1d1d1f] tracking-[-0.01em]">新增模板字段</h2>
              <button
                onClick={() => setAddFieldModalOpen(false)}
                className="text-[#aeaeb2] hover:text-[#1d1d1f] p-1 rounded-full hover:bg-[#f5f5f7]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddFieldSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1.5">
                  数据控件类型 <span className="text-[#ff6b00]">*</span>
                </label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as FieldType)}
                  className="w-full h-11 px-3.5 bg-[#f5f5f7] rounded-[12px] text-xs text-[#1d1d1f] focus:ring-2 focus:ring-[#0071e3] focus:bg-white focus:outline-none"
                >
                  <option value="text">文本 (Text)</option>
                  <option value="number">数字/金额 (Number)</option>
                  <option value="date">日期选择 (Date)</option>
                  <option value="select">下拉单选 (Select)</option>
                  <option value="textarea">多行文本 (Textarea)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1.5">
                  字段显示名称 (Label) <span className="text-[#ff6b00]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  placeholder="例如: 设备名称 / 金额(万元) / 关联项目"
                  className="w-full h-11 px-3.5 bg-[#f5f5f7] rounded-[12px] text-xs text-[#1d1d1f] placeholder:text-[#aeaeb2] focus:ring-2 focus:ring-[#0071e3] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-[#1d1d1f] mb-1.5">
                  <span>字段唯一标识 (Key Name)</span>
                  <span className="text-[10px] text-[#6e6e73] font-normal bg-[#f5f5f7] px-2 py-0.5 rounded-full">不填则系统自动命名</span>
                </label>
                <input
                  type="text"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder="留空自动生成 (如 field_number_k8x2) 或 输入自定义英文"
                  className="w-full h-11 px-3.5 bg-[#f5f5f7] rounded-[12px] text-xs font-mono text-[#1d1d1f] placeholder:text-[#aeaeb2] focus:ring-2 focus:ring-[#0071e3] focus:bg-white focus:outline-none"
                />
                <p className="text-[10px] text-[#86868b] mt-1.5 leading-relaxed">
                  如未手动输入，系统将根据字段类型及特征自动为您生成唯一的后台变量名。
                </p>
              </div>

              {fieldType === 'select' && (
                <div>
                  <label className="block text-xs font-semibold text-[#1d1d1f] mb-1.5">
                    下拉预设选项 (逗号分隔)
                  </label>
                  <input
                    type="text"
                    value={optionsStr}
                    onChange={(e) => setOptionsStr(e.target.value)}
                    placeholder="如: 正常, 待维修, 报废"
                    className="w-full h-11 px-3.5 bg-[#f5f5f7] rounded-[12px] text-xs text-[#1d1d1f] placeholder:text-[#aeaeb2] focus:ring-2 focus:ring-[#0071e3] focus:bg-white focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="req_check"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="w-4 h-4 accent-[#0071e3] rounded"
                />
                <label htmlFor="req_check" className="text-xs font-semibold text-[#1d1d1f]">
                  设定为必填字段
                </label>
              </div>

              <div
                className="pt-4 flex justify-end space-x-3"
                style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}
              >
                <button
                  type="button"
                  onClick={() => setAddFieldModalOpen(false)}
                  className="h-11 px-5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold text-xs rounded-full transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={addingField}
                  className="h-11 px-5 bg-[#0071e3] hover:bg-[#0066cc] text-white font-semibold text-xs rounded-full transition-colors disabled:opacity-50"
                >
                  {addingField ? '保存中...' : '追加字段'}
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
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        >
          <div
            className="bg-white rounded-[22px] max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: 'var(--sh-overlay)' }}
          >
            <div
              className="flex items-center justify-between pb-3"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}
            >
              <h2 className="text-base font-bold text-[#1d1d1f] tracking-[-0.01em]">创建二维交叉表</h2>
              <button onClick={() => setMatrixModalOpen(false)} className="text-[#aeaeb2] hover:text-[#1d1d1f] p-1 rounded-full hover:bg-[#f5f5f7]"><X size={18} /></button>
            </div>

            <form onSubmit={handleAddMatrixSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1.5">行维度标签 <span className="text-[#ff6b00]">*</span></label>
                <input type="text" required value={matrixRowLabel} onChange={(e) => setMatrixRowLabel(e.target.value)}
                  placeholder="如: 产品类别 / 区域 / 业务条线"
                  className="w-full h-11 px-3.5 bg-[#f5f5f7] rounded-[12px] text-xs text-[#1d1d1f] placeholder:text-[#aeaeb2] focus:ring-2 focus:ring-[#0071e3] focus:bg-white focus:outline-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1d1d1f] mb-1.5">行选项 (每行一个) <span className="text-[#ff6b00]">*</span></label>
                <textarea rows={4} required value={matrixRowOptions} onChange={(e) => setMatrixRowOptions(e.target.value)}
                  placeholder={'如:\n产品A\n产品B\n产品C'}
                  className="w-full px-3.5 py-2.5 bg-[#f5f5f7] rounded-[12px] text-xs font-mono text-[#1d1d1f] placeholder:text-[#aeaeb2] focus:ring-2 focus:ring-[#0071e3] focus:bg-white focus:outline-none" />
                <p className="text-[10px] text-[#86868b] mt-1.5">每个选项占一行，将作为交叉表的固定行</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-[#1d1d1f]">列字段定义 <span className="text-[#ff6b00]">*</span></label>
                  <button type="button" onClick={() => setMatrixColumns([...matrixColumns, { field_label: '', field_type: 'number' }])}
                    className="px-2.5 py-1 text-[11px] text-[#0071e3] hover:bg-[rgba(0,113,227,0.08)] rounded-full font-semibold flex items-center space-x-1">
                    <Plus className="w-3 h-3" /><span>添加列</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {matrixColumns.map((col, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <span className="text-[11px] text-[#86868b] font-mono w-6 shrink-0 tabular-nums">列{idx + 1}</span>
                      <input type="text" value={col.field_label} onChange={(e) => {
                        const copy = [...matrixColumns]; copy[idx] = { ...copy[idx], field_label: e.target.value }; setMatrixColumns(copy);
                      }} placeholder="列名称 (如: 1月销售额)" className="flex-1 h-10 px-3 bg-[#f5f5f7] rounded-[10px] text-xs text-[#1d1d1f] placeholder:text-[#aeaeb2] focus:ring-2 focus:ring-[#0071e3] focus:bg-white focus:outline-none" />
                      <select value={col.field_type} onChange={(e) => {
                        const copy = [...matrixColumns]; copy[idx] = { ...copy[idx], field_type: e.target.value as FieldType }; setMatrixColumns(copy);
                      }} className="h-10 px-2.5 bg-[#f5f5f7] rounded-[10px] text-xs text-[#1d1d1f] focus:ring-2 focus:ring-[#0071e3] focus:bg-white focus:outline-none">
                        <option value="number">数值</option>
                        <option value="text">文本</option>
                        <option value="date">日期</option>
                      </select>
                      {matrixColumns.length > 1 && (
                        <button type="button" onClick={() => setMatrixColumns(matrixColumns.filter((_, i) => i !== idx))}
                          className="p-1.5 text-[#aeaeb2] hover:text-[#ff6b00] hover:bg-[rgba(255,107,0,0.08)] rounded-full"><Trash size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {matrixRowLabel.trim() && matrixRowOptions.trim() && matrixColumns.some((c) => c.field_label.trim()) && (
                <div
                  className="p-3 bg-[#f5f5f7] rounded-[12px]"
                  style={{ border: '1px solid rgba(0,0,0,0.07)' }}
                >
                  <div className="text-[11px] font-bold text-[#1d1d1f] mb-2">交叉表预览</div>
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-white">
                        <th className="p-1.5 text-left font-semibold text-[#1d1d1f]" style={{ border: '1px solid rgba(0,0,0,0.07)' }}>{matrixRowLabel}</th>
                        {matrixColumns.filter((c) => c.field_label.trim()).map((c, i) => (
                          <th key={i} className="p-1.5 text-center font-semibold text-[#1d1d1f]" style={{ border: '1px solid rgba(0,0,0,0.07)' }}>{c.field_label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRowOptions.split('\n').filter((s) => s.trim()).slice(0, 3).map((opt, i) => (
                        <tr key={i}>
                          <td className="p-1.5 font-medium text-[#1d1d1f]" style={{ border: '1px solid rgba(0,0,0,0.07)' }}>{opt.trim()}</td>
                          {matrixColumns.filter((c) => c.field_label.trim()).map((_, j) => (
                            <td key={j} className="p-1.5 text-center text-[#d2d2d7]" style={{ border: '1px solid rgba(0,0,0,0.07)' }}>—</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div
                className="pt-4 flex justify-end space-x-3"
                style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}
              >
                <button type="button" onClick={() => setMatrixModalOpen(false)}
                  className="h-11 px-5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold text-xs rounded-full transition-colors">取消</button>
                <button type="submit" disabled={addingMatrix}
                  className="h-11 px-5 bg-[#0071e3] hover:bg-[#0066cc] text-white font-semibold text-xs rounded-full transition-colors disabled:opacity-50">
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
