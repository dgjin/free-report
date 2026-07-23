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
} from 'lucide-react';
import { api } from '../services/api';
import { ReportTemplate, ReportTemplateField, FieldType } from '../types';
import { DEFAULT_FIELD_DATA_TYPE } from '../utils/templateFields';
import { getTemplateLifecycleView } from '../utils/templateLifecycle';

export const TemplateEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [addFieldModalOpen, setAddFieldModalOpen] = useState<boolean>(false);

  // New Field Form State
  const [fieldName, setFieldName] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [required, setRequired] = useState(true);
  const [optionsStr, setOptionsStr] = useState('');
  const [addingField, setAddingField] = useState(false);

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
    return <div className="p-8 text-center text-xs text-slate-400">正在加载模板设计视图...</div>;
  }

  const fieldsList = template.fields || [];
  const lifecycle = getTemplateLifecycleView(template.status);
  const canWrite = lifecycle.canWrite;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="space-y-1">
          <button
            onClick={() => navigate('/templates')}
            className="text-xs text-slate-500 hover:text-indigo-600 flex items-center space-x-1 mb-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回模板列表</span>
          </button>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-slate-800">{template.name}</h1>
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">
              {template.period_type}
            </span>
          </div>
          <p className="text-xs text-slate-500">{template.description || '暂无说明'}</p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          {canWrite && (
            <button
              onClick={() => setAddFieldModalOpen(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center space-x-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" />
              <span>新增模版字段</span>
            </button>
          )}
        </div>
      </div>

      {!canWrite && (
        <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl text-xs text-slate-600">
          {lifecycle.readOnlyMessage}
        </div>
      )}

      {/* Safety Notice */}
      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start space-x-3 text-xs text-amber-900">
        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold">只增不减设计规范（Ensure Backward Compatibility）</div>
          <div className="text-amber-800/90 mt-0.5">
            自由报表采用字段安全兼容策略：发布后的字段不可物理删除，仅可“停用”。已停用字段会在历史版本中安全呈现，保证历史数据完整性与合规可溯。
          </div>
        </div>
      </div>

      {/* Unified Template Fields List */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">报表自定义字段列表</h3>
              <div className="text-[11px] text-slate-400">填报单位将按照以下字段顺序进行表格清单填报</div>
            </div>
          </div>
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
            共 {fieldsList.length} 个字段
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {fieldsList.length === 0 ? (
            <div className="col-span-full py-12 text-center text-xs text-slate-400">
              {canWrite ? '暂未添加字段，点击右上角“新增模版字段”即可开始配置' : '该模板暂无字段配置'}
            </div>
          ) : (
            fieldsList.map((field) => {
              const IconComp = fieldTypeIcons[field.field_type] || Type;
              const config =
                typeof field.field_config === 'string'
                  ? JSON.parse(field.field_config || '{}')
                  : field.field_config || {};

              const isActive = field.status === 'active';

              return (
                <div
                  key={field.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-slate-50/70 border-slate-200 hover:border-indigo-200'
                      : 'bg-slate-100/60 border-slate-200 opacity-60 line-through'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2.5">
                      <div className="p-2 bg-white rounded-lg border border-slate-200 text-indigo-600 shrink-0 mt-0.5">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-800 flex items-center space-x-1">
                          <span>{field.field_label}</span>
                          {config.required && <span className="text-rose-500 font-bold">*</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {field.field_name}
                        </div>
                        <div className="inline-block text-[10px] text-indigo-600 font-medium bg-indigo-50/80 px-2 py-0.5 rounded mt-1.5">
                          {fieldTypeLabels[field.field_type]}
                        </div>
                      </div>
                    </div>

                    {isActive && canWrite ? (
                      <button
                        onClick={() => handleDisableField(field.id)}
                        className="px-2.5 py-1 text-[11px] text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                      >
                        停用
                      </button>
                    ) : !isActive ? (
                      <span className="text-[11px] text-slate-400 font-medium">已停用</span>
                    ) : null}
                  </div>

                  {field.field_type === 'select' && config.options && (
                    <div className="mt-2.5 text-[11px] text-slate-500 bg-white p-2 rounded-lg border border-slate-200 truncate">
                      <span className="font-semibold text-slate-600">预设选项:</span> {config.options.join(' / ')}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Field Modal */}
      {addFieldModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                <span>新增模板字段</span>
              </h2>
              <button
                onClick={() => setAddFieldModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddFieldSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  数据控件类型 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as FieldType)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="text">文本 (Text)</option>
                  <option value="number">数字/金额 (Number)</option>
                  <option value="date">日期选择 (Date)</option>
                  <option value="select">下拉单选 (Select)</option>
                  <option value="textarea">多行文本 (Textarea)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  字段显示名称 (Label) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  placeholder="例如: 设备名称 / 金额(万元) / 关联项目"
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>字段唯一标识 (Key Name)</span>
                  <span className="text-[10px] text-indigo-600 font-normal bg-indigo-50 px-2 py-0.5 rounded">不填则系统自动命名</span>
                </label>
                <input
                  type="text"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder="留空自动生成 (如 field_number_k8x2) 或 输入自定义英文"
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  如未手动输入，系统将根据字段类型及特征自动为您生成唯一的后台变量名。
                </p>
              </div>

              {fieldType === 'select' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    下拉预设选项 (逗号分隔)
                  </label>
                  <input
                    type="text"
                    value={optionsStr}
                    onChange={(e) => setOptionsStr(e.target.value)}
                    placeholder="如: 正常, 待维修, 报废"
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="req_check"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="req_check" className="text-xs font-semibold text-slate-700">
                  设定为必填字段
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setAddFieldModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-semibold text-xs rounded-xl hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={addingField}
                  className="px-4 py-2 bg-indigo-600 text-white font-semibold text-xs rounded-xl hover:bg-indigo-700 shadow-xs disabled:opacity-50 transition-colors"
                >
                  {addingField ? '保存中...' : '追加字段'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
