import React from 'react';
import { ReportSubmissionDetail, SubmissionDetailItem } from '../types';

/**
 * 提交数据的明细 + 交叉表只读视图（复核/签收弹窗共用）。
 * - 普通明细字段：平铺表渲染（列 = 各行字段并集，兼容旧数据无 data_type 的情况）
 * - 交叉表字段：按 matrix_groups 重建行表头结构（行维度标签 + 行选项）
 */
export const SubmissionDetailTables: React.FC<{ detail: ReportSubmissionDetail }> = ({ detail }) => {
  const details = detail.details || [];
  const matrixGroups = detail.matrix_groups || [];

  // 明细列：所有行中非 matrix 字段的并集（保持首次出现顺序）
  const detailColumns: SubmissionDetailItem[] = [];
  const seen = new Set<number>();
  details.forEach((row) => {
    row.forEach((item) => {
      if (item.data_type === 'matrix') return;
      if (seen.has(item.field_id)) return;
      seen.add(item.field_id);
      detailColumns.push(item);
    });
  });

  const cellValue = (rowItems: SubmissionDetailItem[] | undefined, fieldId: number): string => {
    if (!rowItems) return '';
    const found = rowItems.find((item) => item.field_id === fieldId);
    return found?.value || '';
  };

  return (
    <>
      {/* 普通明细平铺表 */}
      {detailColumns.length > 0 && (
        <div className="overflow-x-auto rounded-[12px] border border-[rgba(0,0,0,0.07)] bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#f5f5f7] text-[#6e6e73] font-medium border-b border-[rgba(0,0,0,0.07)]">
                <th className="p-2.5 w-10 text-center">#</th>
                {detailColumns.map((col) => (
                  <th key={col.field_id} className="p-2.5 font-medium">
                    {col.field_label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,0,0,0.07)]">
              {details.map((rowItems, idx) => (
                <tr key={idx}>
                  <td className="p-2.5 text-center text-[#aeaeb2] tabular-nums">{idx + 1}</td>
                  {detailColumns.map((col) => (
                    <td key={col.field_id} className="p-2.5 text-[#1d1d1f] font-medium tabular-nums">
                      {cellValue(rowItems, col.field_id) || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 交叉表（带行表头） */}
      {matrixGroups.map((group, groupIdx) => (
        <div key={groupIdx} className="space-y-2">
          <div className="text-[11px] font-medium text-[#86868b]">
            {group.row_label}交叉表
          </div>
          <div className="overflow-x-auto rounded-[12px] border border-[rgba(0,0,0,0.07)] bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f5f5f7] text-[#6e6e73] font-medium border-b border-[rgba(0,0,0,0.07)]">
                  <th className="p-2.5 font-medium min-w-[100px]">{group.row_label}</th>
                  {group.columns.map((col) => (
                    <th key={col.field_id} className="p-2.5 font-medium text-center">
                      {col.field_label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(0,0,0,0.07)]">
                {group.row_options.map((rowOpt, rowIdx) => (
                  <tr key={rowIdx}>
                    <td className="p-2.5 font-semibold text-[#1d1d1f]">{rowOpt}</td>
                    {group.columns.map((col) => (
                      <td key={col.field_id} className="p-2.5 text-center text-[#1d1d1f] font-medium tabular-nums">
                        {cellValue(details[rowIdx], col.field_id) || <span className="text-[#d2d2d7]">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* 既无明细也无交叉表数据 */}
      {detailColumns.length === 0 && matrixGroups.length === 0 && (
        <div className="py-6 text-center text-xs text-[#86868b]">无明细数据</div>
      )}
    </>
  );
};
