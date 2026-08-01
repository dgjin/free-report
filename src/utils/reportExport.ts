import type {
  ReportAssignment,
  ReportSubmissionDetail,
  ReportTemplateField,
} from '../types';
import type { MatrixGroup } from './aggregationView';
import { getSubmissionWorkflowView } from './submissionWorkflow';

/** 一个待导出的工作表：名称 + 二维数组内容（aoa） */
export interface ExportSheet {
  name: string;
  aoa: Array<Array<string | number>>;
}

/** 导出填报数据所需的全部输入（取自填报页已有状态，无需额外请求） */
export interface SubmissionExportInput {
  assignment: ReportAssignment;
  summaryFields: ReportTemplateField[];
  detailFields: ReportTemplateField[];
  matrixGroups: MatrixGroup[];
  summaryForm: Record<string, string>;
  detailRows: Array<Record<string, string>>;
  submission: ReportSubmissionDetail | null;
}

/**
 * 把当前填报数据整理为工作表数组（纯函数，便于测试与复用）：
 * 填报信息 → 汇总指标 → 明细数据 → 每个交叉表组各一张。
 */
export function buildSubmissionSheets(input: SubmissionExportInput): ExportSheet[] {
  const { assignment, summaryFields, detailFields, matrixGroups, summaryForm, detailRows, submission } = input;
  const sheets: ExportSheet[] = [];

  // Sheet 1：填报信息（任务与提交元数据）
  const info: Array<Array<string | number>> = [
    ['任务标题', assignment.title || ''],
    ['报表模板', assignment.template_name || ''],
    ['填报周期', assignment.period_label || ''],
    ['截止日期', assignment.deadline || ''],
    ['填报状态', getSubmissionWorkflowView(submission?.status).label],
  ];
  if (submission) {
    info.push(['数据版本', `v${submission.version}`]);
    if (submission.comment) {
      info.push(['填报备注', submission.comment]);
    }
  }
  info.push(['导出时间', new Date().toLocaleString('zh-CN')]);
  sheets.push({ name: '填报信息', aoa: info });

  // Sheet 2：汇总指标（字段 + 填报值两列）
  if (summaryFields.length > 0) {
    const rows: Array<Array<string | number>> = [['字段', '填报值']];
    summaryFields.forEach((f) => {
      rows.push([f.field_label, summaryForm[f.id] ?? '']);
    });
    sheets.push({ name: '汇总指标', aoa: rows });
  }

  // Sheet 3：明细数据（字段标签为表头，过滤全空行）
  if (detailFields.length > 0) {
    const header = detailFields.map((f) => f.field_label);
    const body = detailRows
      .filter((row) => detailFields.some((f) => (row[f.id] ?? '') !== ''))
      .map((row) => detailFields.map((f) => row[f.id] ?? ''));
    if (body.length > 0) {
      sheets.push({ name: '明细数据', aoa: [header, ...body] });
    }
  }

  // 每个交叉表组一张 Sheet：行标签 × 数值列（矩阵数据与明细行共享 detailRows 的前 N 行）
  matrixGroups.forEach((group, idx) => {
    const header: Array<string | number> = [group.rowLabel || '项目', ...group.columns.map((f) => f.field_label)];
    const body = group.rowOptions.map((label, rowIdx) => [
      label,
      ...group.columns.map((f) => detailRows[rowIdx]?.[f.id] ?? ''),
    ]);
    const name = matrixGroups.length > 1 ? `交叉表${idx + 1}` : '交叉表';
    sheets.push({ name, aoa: [header, ...body] });
  });

  return sheets;
}

/** 导出当前填报数据为 Excel（动态加载 xlsx，避免增加首屏体积） */
export async function exportSubmissionToExcel(input: SubmissionExportInput): Promise<void> {
  const { utils, writeFile } = await import('xlsx');
  const workbook = utils.book_new();
  buildSubmissionSheets(input).forEach(({ name, aoa }) => {
    const worksheet = utils.aoa_to_sheet(aoa);
    worksheet['!cols'] = aoa[0].map((_, i) => ({
      wch: Math.min(60, Math.max(10, ...aoa.map((r) => String(r[i] ?? '').length)) + 4),
    }));
    utils.book_append_sheet(workbook, worksheet, name);
  });
  const safeName = (input.assignment.title || '填报数据').replace(/[\\/?*[\]:]/g, '-');
  writeFile(workbook, `${safeName}_填报数据.xlsx`);
}
