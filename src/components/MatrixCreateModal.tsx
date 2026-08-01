import React, { useState } from 'react';
import { X, Plus, Trash } from './icons';
import { api } from '../services/api';
import { toast } from '../utils/toast';
import { FieldType } from '../types';

interface MatrixCreateModalProps {
  templateId: number;
  onClose: () => void;
  onSaved: () => void;
}

/** 创建二维交叉表弹窗：行维度（固定行选项）× 列字段定义，附实时预览 */
export const MatrixCreateModal: React.FC<MatrixCreateModalProps> = ({
  templateId,
  onClose,
  onSaved,
}) => {
  const [matrixRowLabel, setMatrixRowLabel] = useState('');
  const [matrixRowOptions, setMatrixRowOptions] = useState('');
  const [matrixColumns, setMatrixColumns] = useState<{ field_label: string; field_type: FieldType }[]>([
    { field_label: '', field_type: 'number' },
  ]);
  const [addingMatrix, setAddingMatrix] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      await api.addMatrixFields(templateId, {
        row_label: matrixRowLabel.trim(),
        row_options: rowOptions,
        columns,
      });
      onClose();
      onSaved();
    } catch (err: any) {
      toast(err.message || '创建交叉表失败', 'error');
    } finally {
      setAddingMatrix(false);
    }
  };

  return (
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
          <button onClick={onClose} className="text-faint hover:text-ink p-1 rounded-full hover:bg-canvas"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <button type="button" onClick={onClose}
              className="h-11 px-5 bg-canvas hover:bg-line text-ink font-semibold text-xs rounded-md transition-colors">取消</button>
            <button type="submit" disabled={addingMatrix}
              className="h-11 px-5 bg-ink hover:bg-inkhover text-white font-semibold text-xs rounded-md transition-colors disabled:opacity-50">
              {addingMatrix ? '创建中...' : '创建交叉表'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
