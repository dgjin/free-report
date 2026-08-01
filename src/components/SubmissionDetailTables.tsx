import React, { useState } from 'react';
import { ReportSubmissionDetail, SubmissionDetailItem } from '../types';
import { FullscreenButton, useFullscreen } from './FullscreenToggle';

interface SubmissionDetailTablesProps {
  detail: ReportSubmissionDetail;
  /** 普通明细表每页行数，默认 10 */
  pageSize?: number;
}

/**
 * 提交数据的明细 + 交叉表只读视图（复核/签收弹窗共用）。
 * - 普通明细字段：平铺表渲染（列 = 各行字段并集，兼容旧数据无 data_type 的情况），支持分页
 * - 交叉表字段：按 matrix_groups 重建行表头结构（行维度标签 + 行选项）
 */
export const SubmissionDetailTables: React.FC<SubmissionDetailTablesProps> = ({ detail, pageSize = 10 }) => {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const details = detail.details || [];
  const matrixGroups = detail.matrix_groups || [];
  const [currentPage, setCurrentPage] = useState(1);

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

  // 分页计算
  const totalPages = Math.max(1, Math.ceil(details.length / pageSize));
  const pagedDetails = details.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const onPageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[80] bg-canvas overflow-y-auto p-4 sm:p-8 space-y-4'
          : 'space-y-3'
      }
    >
      {/* 全屏切换工具行 */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-faint">
          {isFullscreen ? '全屏查看中，按 Esc 或点击右侧按钮退出' : ''}
        </span>
        <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} withLabel />
      </div>

      {/* 普通明细平铺表（分页） */}
      {detailColumns.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-[12px] border border-line bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-canvas text-mute font-medium border-b border-line">
                  <th className="p-2.5 w-10 text-center">#</th>
                  {detailColumns.map((col) => (
                    <th key={col.field_id} className="p-2.5 font-medium">
                      {col.field_label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pagedDetails.map((rowItems, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx;
                  return (
                    <tr key={globalIdx}>
                      <td className="p-2.5 text-center text-faint tabular-nums">{globalIdx + 1}</td>
                      {detailColumns.map((col) => (
                        <td key={col.field_id} className="p-2.5 text-ink font-medium tabular-nums">
                          {cellValue(rowItems, col.field_id) || '-'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 分页控件 */}
          {details.length > pageSize && (
            <div className="flex items-center justify-between px-2 py-1.5 text-[12px] text-mute">
              <span className="tabular-nums">
                第 {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, details.length)} 行，共 {details.length} 行
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => onPageChange(currentPage - 1)}
                  className="h-7 px-3 rounded-md border border-line bg-white hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                <span className="tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => onPageChange(currentPage + 1)}
                  className="h-7 px-3 rounded-md border border-line bg-white hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 交叉表（带行表头） */}
      {matrixGroups.map((group, groupIdx) => (
        <div key={groupIdx} className="space-y-2">
          <div className="text-[11px] font-medium text-mute">
            {group.row_label}交叉表
          </div>
          <div className="overflow-x-auto rounded-[12px] border border-line bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-canvas text-mute font-medium border-b border-line">
                  <th className="p-2.5 font-medium min-w-[100px]">{group.row_label}</th>
                  {group.columns.map((col) => (
                    <th key={col.field_id} className="p-2.5 font-medium text-center">
                      {col.field_label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {group.row_options.map((rowOpt, rowIdx) => (
                  <tr key={rowIdx}>
                    <td className="p-2.5 font-semibold text-ink">{rowOpt}</td>
                    {group.columns.map((col) => (
                      <td key={col.field_id} className="p-2.5 text-center text-ink font-medium tabular-nums">
                        {cellValue(details[rowIdx], col.field_id) || <span className="text-line">—</span>}
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
        <div className="py-6 text-center text-xs text-mute">无明细数据</div>
      )}
    </div>
  );
};
