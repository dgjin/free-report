import React from 'react';
import { Grid3x3 } from '../icons';
import { ReportTemplateField } from '../../types';

export interface MatrixGroup {
  rowLabel: string;
  rowOptions: string[];
  columns: ReportTemplateField[];
}

interface CrossTableProps {
  groups: MatrixGroup[];
  rows: Array<Record<string, string>>;
  isReadOnly: boolean;
  sectionNumber: string;
  onChange: (rowIndex: number, fieldId: number, value: string) => void;
}

/** 交叉表/矩阵数据区（固定行 × 动态列，数值列自动合计） */
export const CrossTable: React.FC<CrossTableProps> = ({
  groups,
  rows,
  isReadOnly,
  sectionNumber,
  onChange,
}) => {
  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((group, groupIdx) => (
        <div
          key={groupIdx}
          className="bg-white rounded-[12px] p-6 sm:p-7 space-y-5"
          style={{ boxShadow: 'var(--sh-panel)' }}
        >
          <div
            className="flex items-center justify-between pb-4"
            style={{ borderBottom: '1px solid var(--hairline)' }}
          >
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-canvas text-ink rounded-[10px]">
                <Grid3x3 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink tracking-[-0.01em]">
                  {sectionNumber}、{group.rowLabel}交叉表 (Cross-Tab)
                </h2>
                <p className="text-[11px] text-mute mt-0.5">固定行 × 动态列，数值列将自动合计</p>
              </div>
            </div>
          </div>

          <div
            className="overflow-x-auto rounded-[12px]"
            style={{ border: '1px solid var(--hairline)' }}
          >
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-canvas text-ink font-semibold">
                  <th className="p-3 min-w-[120px]">{group.rowLabel}</th>
                  {group.columns.map((col) => (
                    <th key={col.id} className="p-3 min-w-[100px] text-center">{col.field_label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rowOptions.map((rowOpt, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-hoverbg">
                    <td
                      className="p-3 font-semibold text-ink"
                      style={{ borderTop: rowIdx === 0 ? 'none' : '1px solid var(--hairline)' }}
                    >
                      {rowOpt}
                    </td>
                    {group.columns.map((col, colIdx) => {
                      const val = rows[rowIdx]?.[col.id] || '';
                      const colType = col.field_type;
                      return (
                        <td
                          key={col.id}
                          className="p-2 text-center"
                          style={{ borderTop: rowIdx === 0 && colIdx === 0 ? 'none' : '1px solid var(--hairline)' }}
                        >
                          {isReadOnly ? (
                            <span className="text-body font-mono tabular-nums">
                              {val || <span className="text-line">—</span>}
                            </span>
                          ) : colType === 'select' ? (
                            <select disabled={isReadOnly} value={val}
                              onChange={(e) => onChange(rowIdx, col.id, e.target.value)}
                              className="w-full h-9 px-2.5 bg-canvas rounded-[10px] text-xs text-ink focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none">
                              <option value="">-- 选择 --</option>
                            </select>
                          ) : (
                            <input type={colType === 'number' ? 'number' : colType === 'date' ? 'date' : 'text'}
                              disabled={isReadOnly} value={val}
                              onChange={(e) => onChange(rowIdx, col.id, e.target.value)}
                              placeholder="..."
                              className={`w-full h-9 px-2.5 bg-canvas rounded-[10px] text-xs text-center text-ink placeholder:text-faint focus:ring-1 focus:ring-ink focus:bg-white focus:outline-none ${
                                colType === 'number' ? 'tabular-nums' : ''
                              }`} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {/* 数值列合计行 */}
              {group.columns.some((c) => c.field_type === 'number') && (
                <tfoot>
                  <tr className="bg-canvas font-bold text-ink">
                    <td className="p-3" style={{ borderTop: '2px solid var(--hairline)' }}>合计</td>
                    {group.columns.map((col) => {
                      if (col.field_type !== 'number') {
                        return <td key={col.id} className="p-3 text-center text-line" style={{ borderTop: '2px solid var(--hairline)' }}>—</td>;
                      }
                      const total = group.rowOptions.reduce((sum, _, idx) => {
                        const v = rows[idx]?.[col.id];
                        return v && !isNaN(Number(v)) ? sum + Number(v) : sum;
                      }, 0);
                      return <td key={col.id} className="p-3 text-center text-ink font-mono tabular-nums" style={{ borderTop: '2px solid var(--hairline)' }}>{total.toLocaleString()}</td>;
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ))}
    </>
  );
};
