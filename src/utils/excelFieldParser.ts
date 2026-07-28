import type { DataType, FieldType } from '../types';
import { DEFAULT_FIELD_DATA_TYPE } from './templateFields';

/** xlsx 单元格原始信息：v 为显示文本（格式化后），t 为 xlsx 单元格类型 */
export interface RawCell {
  v: string;
  t: string; // 'n' | 's' | 'd' | 'b' | 'str' | 'e' | 'z'(空)
}

export interface MergeRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

/** 表格格式：明细表 / 汇总指标表（键值） / 交叉表（二维） */
export type TableFormat = 'detail' | 'summary' | 'matrix';

export interface ParsedExcelField {
  field_label: string;
  field_name: string;
  field_type: FieldType;
  data_type: DataType;
  sort_order: number;
  sample_values: string[];
  /** select 类型自动提取的选项 */
  options?: string[];
  /** 根据数据填充率推荐的必填标记 */
  required: boolean;
  /** 建议跳过不导入（如序号列） */
  skipped: boolean;
  skip_reason?: string;
  /** 识别说明（如“样本含单位”） */
  hint?: string;
}

export interface MatrixColumn {
  field_label: string;
  field_name: string;
  field_type: FieldType;
}

export interface MatrixDetection {
  row_label: string;
  row_options: string[];
  columns: MatrixColumn[];
}

export interface SheetAnalysis {
  /** 从标题行推断的表格名称 */
  tableName: string;
  /** 推荐的表格格式 */
  format: TableFormat;
  /** 表头所在行（0 基） */
  headerRowIndex: number;
  /** 有效数据行数 */
  dataRowCount: number;
  /** 识别过程说明（跳过的标题/注释/落款行等） */
  notes: string[];
  /** 字段列表（detail/summary 格式） */
  fields: ParsedExcelField[];
  /** 交叉表结构（matrix 格式） */
  matrix?: MatrixDetection;
  /** 原始行数据（预览用） */
  rows: string[][];
  /** 原始单元格网格与合并区域（用于格式切换后重新分析） */
  grid: RawCell[][];
  merges: MergeRange[];
}

/* ------------------------------------------------------------------ */
/* 纯函数：表格结构智能分析                                             */
/* ------------------------------------------------------------------ */

/**
 * 分析工作表结构，自动识别：
 * - 标题行（整行合并/单单元格）→ 跳过并提取表名
 * - 表头行（可能为二级合并表头 → 交叉表）
 * - 表头注释行（稀疏说明文字）→ 跳过
 * - 落款行（填表人/电话/日期等）→ 跳过
 * - 空白行 → 跳过
 * - 列级：类型推断（含 Excel 日期序列、带单位数字）、select 选项提取、必填推荐、序号列跳过
 *
 * headerRowOverride：手动指定表头行（0 基），跳过自动定位；上方单行文本仍提取为表名。
 * forcedFormat='matrix' 时不要求二级合并表头：普通表格首列作行维度、其余列作列指标。
 */
export function analyzeSheetData(
  grid: RawCell[][],
  merges: MergeRange[] = [],
  forcedFormat?: TableFormat,
  headerRowOverride?: number
): SheetAnalysis {
  if (!grid || grid.length === 0) {
    throw new Error('Excel 文件为空');
  }

  const notes: string[] = [];
  const rowTexts = grid.map((row) => row.map((c) => (c?.v ?? '').trim()));
  const nonEmptyCounts = rowTexts.map(
    (texts) => texts.filter((t) => t !== '').length
  );
  const tableWidth = Math.max(...nonEmptyCounts, 0);
  if (tableWidth === 0) {
    throw new Error('Excel 文件为空');
  }

  /* ---------- 1. 标题行识别（表格顶部） ---------- */
  const wideMergeRows = new Set<number>();
  for (const m of merges) {
    const spanCols = m.e.c - m.s.c + 1;
    if (spanCols >= Math.max(3, Math.ceil(tableWidth * 0.6))) {
      for (let r = m.s.r; r <= m.e.r; r++) wideMergeRows.add(r);
    }
  }

  let headerRowIndex = -1;
  let titleRowCount = 0;
  let tableName = '';

  if (headerRowOverride != null && headerRowOverride >= 0 && headerRowOverride < grid.length) {
    // 手动指定表头行：上方单行文本仍视为标题并提取表名
    headerRowIndex = headerRowOverride;
    for (let r = 0; r < headerRowOverride; r++) {
      const cnt = nonEmptyCounts[r];
      if (cnt === 0) continue;
      const isTitleLike = cnt === 1 || (wideMergeRows.has(r) && cnt <= 2);
      if (isTitleLike) {
        titleRowCount++;
        const text = rowTexts[r].find((t) => t !== '') || '';
        if (text) tableName = text;
      }
    }
    notes.push(`已按手动选择定位表头（第 ${headerRowOverride + 1} 行）`);
  } else {
    for (let r = 0; r < grid.length; r++) {
      const cnt = nonEmptyCounts[r];
      if (cnt === 0) {
        if (titleRowCount > 0) break; // 标题与表头之间的空行结束标题区
        continue; // 前导空行
      }
      const isTitleLike = cnt === 1 || (wideMergeRows.has(r) && cnt <= 2);
      if (isTitleLike) {
        titleRowCount++;
        const text = rowTexts[r].find((t) => t !== '') || '';
        if (text) tableName = text; // 最后一行标题通常是表名
        continue;
      }
      if (cnt >= 2) {
        headerRowIndex = r;
        break;
      }
    }

    // 没有识别出表头（如单列清单）→ 回退到第一个非空行
    if (headerRowIndex === -1) {
      headerRowIndex = rowTexts.findIndex((_, i) => nonEmptyCounts[i] > 0);
      if (headerRowIndex === -1) throw new Error('未找到有效的表头列');
    }
  }

  if (titleRowCount > 0) {
    notes.push(`已跳过标题 ${titleRowCount} 行${tableName ? `（表格名称：${tableName}）` : ''}`);
  }

  /* ---------- 2. 二级合并表头识别 → 交叉表 ---------- */
  const headerMerges = merges.filter(
    (m) => m.s.r === headerRowIndex && m.e.r === headerRowIndex && m.e.c - m.s.c >= 1
  );
  let twoLevelHeader = false;
  if (headerMerges.length > 0 && headerRowIndex + 1 < grid.length) {
    const nextTexts = rowTexts[headerRowIndex + 1];
    const filledUnderMerges = headerMerges.filter((m) =>
      nextTexts.slice(m.s.c, m.e.c + 1).some((t) => t !== '')
    ).length;
    twoLevelHeader = filledUnderMerges >= Math.max(1, Math.floor(headerMerges.length / 2));
  }

  /* ---------- 3. 表头注释行 / 数据区 / 落款行识别 ---------- */
  let dataStartRow = headerRowIndex + (twoLevelHeader ? 2 : 1);
  if (!twoLevelHeader && dataStartRow < grid.length) {
    const cnt = nonEmptyCounts[dataStartRow];
    const texts = rowTexts[dataStartRow];
    const allTextual = grid[dataStartRow].every(
      (c) => c.t !== 'n' && c.t !== 'd'
    );
    if (cnt > 0 && cnt < Math.max(2, Math.ceil(tableWidth * 0.3)) && allTextual) {
      const sample = texts.find((t) => t !== '') || '';
      notes.push(`已跳过表头注释行（第 ${dataStartRow + 1} 行：${sample.length > 12 ? sample.slice(0, 12) + '…' : sample}）`);
      dataStartRow++;
    }
  }

  const FOOTER_PATTERN = /^\s*(填表人|填报人|制表人|审核人|复核人|审批人|联系电话|联系手机|电话|手机|邮箱|填报日期|填表日期|制表日期)\s*[:：]?/;
  const dataRowIndexes: number[] = [];
  let blankCount = 0;
  let footerCount = 0;
  for (let r = dataStartRow; r < grid.length; r++) {
    if (nonEmptyCounts[r] === 0) {
      blankCount++;
      continue;
    }
    if (rowTexts[r].some((t) => t !== '' && FOOTER_PATTERN.test(t))) {
      footerCount++;
      continue;
    }
    dataRowIndexes.push(r);
  }
  if (blankCount > 0) notes.push(`已跳过空白 ${blankCount} 行`);
  if (footerCount > 0) notes.push(`已跳过落款 ${footerCount} 行（填表人/电话等信息）`);

  /* ---------- 4. 裁剪尾部全空列 ---------- */
  let lastCol = tableWidth - 1;
  const headerTexts = rowTexts[headerRowIndex];
  while (lastCol > 0) {
    const inHeader = (headerTexts[lastCol] || '') !== '';
    const inData = dataRowIndexes.some((r) => (rowTexts[r][lastCol] || '') !== '');
    if (inHeader || inData) break;
    lastCol--;
  }
  const colIndexes = Array.from({ length: lastCol + 1 }, (_, i) => i);

  /* ---------- 5. 表格格式判定 ---------- */
  let format: TableFormat = 'detail';
  if (twoLevelHeader) {
    format = 'matrix';
  } else if (colIndexes.length === 2 && dataRowIndexes.length >= 3) {
    const c0 = colIndexes[0];
    const c1 = colIndexes[1];
    const keys = dataRowIndexes.map((r) => rowTexts[r][c0]).filter(Boolean);
    const uniqueKeys = new Set(keys);
    const allTextKeys =
      keys.length === dataRowIndexes.length &&
      uniqueKeys.size === keys.length &&
      dataRowIndexes.every((r) => grid[r][c0].t !== 'n' && grid[r][c0].t !== 'd');
    const valueish = dataRowIndexes.filter(
      (r) =>
        grid[r][c1].t === 'n' ||
        grid[r][c1].t === 'd' ||
        isNumericText(rowTexts[r][c1]) ||
        isDateText(rowTexts[r][c1])
    ).length;
    const headerValueish = /(值|数值|金额|数量|内容|情况|指标)/.test(headerTexts[c1] || '');
    if (allTextKeys && (valueish / dataRowIndexes.length >= 0.5 || headerValueish)) {
      format = 'summary';
    }
  }
  // 手动指定格式优先：交叉表不要求二级合并表头（首列作行维度，其余列作列指标）
  if (forcedFormat) {
    format = forcedFormat;
  }

  /* ---------- 6. 生成结果 ---------- */
  const rows = rowTexts;
  const analysis: SheetAnalysis = {
    tableName,
    format,
    headerRowIndex,
    dataRowCount: dataRowIndexes.length,
    notes,
    fields: [],
    rows,
    grid,
    merges,
  };

  if (format === 'matrix') {
    analysis.matrix = buildMatrixDetection(grid, rowTexts, merges, headerRowIndex, dataRowIndexes, headerMerges, colIndexes);
    notes.push(
      twoLevelHeader
        ? `识别为二维交叉表：行维度「${analysis.matrix.row_label}」（${analysis.matrix.row_options.length} 个行选项）× ${analysis.matrix.columns.length} 个列指标`
        : `按交叉表解析：首列「${analysis.matrix.row_label}」为行维度（${analysis.matrix.row_options.length} 个行选项），其余 ${analysis.matrix.columns.length} 列为列指标`
    );
    return analysis;
  }

  if (format === 'summary') {
    // 键值表：每个数据行的首列即一个汇总指标
    const c0 = colIndexes[0];
    const c1 = colIndexes[1];
    const usedNames = new Set<string>();
    analysis.fields = dataRowIndexes.map((r, i) => {
      const label = cleanLabel(rowTexts[r][c0]) || `指标${i + 1}`;
      const cell = grid[r][c1];
      const fieldType = inferFromTypedValues([cell]);
      return {
        field_label: label,
        field_name: uniqueFieldName(labelToFieldName(label), usedNames),
        field_type: fieldType,
        data_type: 'summary' as DataType,
        sort_order: i + 1,
        sample_values: cell.v ? [cell.v] : [],
        required: false,
        skipped: false,
      };
    });
    notes.push(`识别为汇总指标表：${analysis.fields.length} 个数据行转换为汇总指标（每机构每期一个值）`);
    return analysis;
  }

  // 明细表：每列一个字段
  const usedNames = new Set<string>();
  analysis.fields = colIndexes.map((c, i) => {
    const label = cleanLabel(headerTexts[c]) || `列${c + 1}`;
    const typedCells = dataRowIndexes.map((r) => grid[r][c]).filter((cell) => (cell.v ?? '') !== '');
    const sampleValues = typedCells.map((cell) => cell.v);
    const fieldType = inferColumnType(label, typedCells);
    const skipped = isSequentialColumn(label, typedCells);
    const required = dataRowIndexes.length > 0 && typedCells.length === dataRowIndexes.length;

    let options: string[] | undefined;
    if (fieldType === 'select') {
      options = [...new Set(sampleValues)].slice(0, 20);
    }

    let hint: string | undefined;
    if (fieldType === 'number' && typedCells.some((cell) => isUnitNumberText(cell.v))) {
      hint = '样本含单位（如万元/公里），填报时仅需填写数值';
    }

    return {
      field_label: label,
      field_name: uniqueFieldName(labelToFieldName(label), usedNames),
      field_type: fieldType,
      data_type: DEFAULT_FIELD_DATA_TYPE,
      sort_order: i + 1,
      sample_values: sampleValues.slice(0, 3),
      options,
      required,
      skipped,
      skip_reason: skipped ? '序号列' : undefined,
      hint,
    };
  });

  const skippedCount = analysis.fields.filter((f) => f.skipped).length;
  if (skippedCount > 0) {
    notes.push(`序号类列 ${skippedCount} 个已默认不导入（可手动勾选）`);
  }
  notes.push(`识别为明细表：表头位于第 ${headerRowIndex + 1} 行，共 ${dataRowIndexes.length} 条数据样本`);
  return analysis;
}

/* ------------------------------------------------------------------ */
/* 交叉表结构构建                                                      */
/* ------------------------------------------------------------------ */

function buildMatrixDetection(
  grid: RawCell[][],
  rowTexts: string[][],
  _merges: MergeRange[],
  headerRowIndex: number,
  dataRowIndexes: number[],
  headerMerges: MergeRange[],
  colIndexes: number[]
): MatrixDetection {
  const headerTexts = rowTexts[headerRowIndex];
  const leafTexts = rowTexts[headerRowIndex + 1] || [];

  // 行维度 = 首列
  const dimCol = colIndexes[0];
  const rowLabel = cleanLabel(headerTexts[dimCol]) || '项目';
  const rowOptions: string[] = [];
  for (const r of dataRowIndexes) {
    const v = rowTexts[r][dimCol];
    if (v && !rowOptions.includes(v)) rowOptions.push(v);
  }

  // 列指标 = 其余列，标签优先取二级表头
  const usedNames = new Set<string>();
  const columns: MatrixColumn[] = [];
  for (const c of colIndexes.slice(1)) {
    const underMerge = headerMerges.some((m) => c >= m.s.c && c <= m.e.c);
    const rawLabel = underMerge ? leafTexts[c] || headerTexts[c] : headerTexts[c] || leafTexts[c];
    const label = cleanLabel(rawLabel) || `列${c + 1}`;
    const typedCells = dataRowIndexes.map((r) => grid[r][c]).filter((cell) => (cell.v ?? '') !== '');
    columns.push({
      field_label: label,
      field_name: uniqueFieldName(labelToFieldName(label), usedNames),
      field_type: inferColumnType(label, typedCells) === 'select' ? 'text' : inferColumnType(label, typedCells),
    });
  }

  return { row_label: rowLabel, row_options: rowOptions.slice(0, 50), columns };
}

/* ------------------------------------------------------------------ */
/* 类型推断与列识别                                                    */
/* ------------------------------------------------------------------ */

const DATE_PATTERNS = [
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,
  /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/,
  /^\d{4}年\d{1,2}月\d{1,2}日$/,
  /^\d{4}年\d{1,2}月$/,
  /^\d{1,2}月\d{1,2}日$/,
];

const UNIT_PATTERN = /^-?\d+(\.\d+)?\s*(万元|亿元|元|公里|千米|km|万|%|辆|台|人|次|吨|千克|kg|平方米|亩|小时|天)$/i;

function isNumericText(v: string): boolean {
  return /^-?\d+(\.\d+)?e?[+-]?\d*$/i.test(v.trim());
}

function isDateText(v: string): boolean {
  return DATE_PATTERNS.some((p) => p.test(v.trim()));
}

function isUnitNumberText(v: string): boolean {
  return UNIT_PATTERN.test(v.trim());
}

/** 基于单元格类型（含 Excel 日期序列）的字段类型推断 */
function inferFromTypedValues(cells: RawCell[]): FieldType {
  if (cells.length === 0) return 'text';
  const total = cells.length;
  const dateCount = cells.filter((c) => c.t === 'd' || isDateText(c.v)).length;
  const numCount = cells.filter(
    (c) => c.t === 'n' || isNumericText(c.v) || isUnitNumberText(c.v)
  ).length;
  if (dateCount / total >= 0.6) return 'date';
  if (numCount / total >= 0.6) return 'number';
  return 'text';
}

/** 明细列类型推断：数据驱动 + 标签纠偏 */
function inferColumnType(label: string, typedCells: RawCell[]): FieldType {
  // 标签明确指向备注/说明 → 多行文本
  if (/(备注|说明|注释|附注)/.test(label)) return 'textarea';
  // 标签明确指向日期
  if (/(日期|时间)/.test(label) && typedCells.every((c) => c.t === 'd' || isDateText(c.v) || c.v === '')) {
    return 'date';
  }
  if (typedCells.length === 0) {
    if (/(日期|时间)/.test(label)) return 'date';
    if (/(数量|金额|里程|单价|总额|人数|次数|排量)/.test(label)) return 'number';
    return 'text';
  }

  const total = typedCells.length;
  const dateCount = typedCells.filter((c) => c.t === 'd' || isDateText(c.v)).length;
  const numCount = typedCells.filter(
    (c) => c.t === 'n' || isNumericText(c.v) || isUnitNumberText(c.v)
  ).length;
  if (dateCount / total >= 0.6) return 'date';
  if (numCount / total >= 0.6) return 'number';

  // 低基数文本 → 下拉（标签含名称/号码/人/型号时不下拉）
  if (!/(名称|号码|编号|型号|使用人|负责人|姓名|地址)/.test(label)) {
    const values = typedCells.map((c) => c.v);
    const unique = new Set(values);
    const noNumeric = values.every((v) => !isNumericText(v) && !isDateText(v));
    if (noNumeric && unique.size <= 6 && total >= 3 && unique.size / total <= 0.6) {
      return 'select';
    }
  }

  const maxLen = Math.max(...typedCells.map((c) => c.v.length));
  if (maxLen > 25) return 'textarea';
  return 'text';
}

/** 序号列识别：标签为“序号/顺序/#”且值为自增整数序列 */
function isSequentialColumn(label: string, typedCells: RawCell[]): boolean {
  if (!/^(序号|顺序|#|no\.?)$/i.test(label.trim())) return false;
  if (typedCells.length === 0) return false;
  const nums = typedCells.map((c) => (isNumericText(c.v) ? parseInt(c.v, 10) : NaN));
  if (nums.some((n) => Number.isNaN(n))) return false;
  const start = nums[0];
  return nums.every((n, i) => n === start + i);
}

/* ------------------------------------------------------------------ */
/* 标签与字段名处理                                                    */
/* ------------------------------------------------------------------ */

/** 清理表头标签：去冒号、中文标签去空白、英文标签压缩空白 */
function cleanLabel(raw: string): string {
  let label = (raw || '').trim().replace(/[:：]\s*$/, '');
  if (/[\u4e00-\u9fa5]/.test(label)) {
    label = label.replace(/\s+/g, '');
  } else {
    label = label.replace(/\s+/g, ' ');
  }
  return label.trim();
}

/** 字段名去重 */
function uniqueFieldName(base: string, used: Set<string>): string {
  let name = base || 'field';
  let counter = 1;
  while (used.has(name)) {
    name = `${base}_${counter}`;
    counter++;
  }
  used.add(name);
  return name;
}

/**
 * 根据字段标签生成 field_name
 * 中文标签 → 常用词映射组合 / 英文标签 → snake_case
 */
function labelToFieldName(label: string): string {
  if (!label) return 'field';

  if (/^[a-zA-Z0-9_\s]+$/.test(label)) {
    return label
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  const chineseToEnglish: Record<string, string> = {
    // 通用
    '月份': 'month', '季度': 'quarter', '年份': 'year',
    '填报人': 'filler', '填报部门': 'department', '部门': 'department',
    '日期': 'date', '时间': 'time', '负责人': 'manager', '备注': 'remark',
    '状态': 'status', '编号': 'code', '名称': 'name', '金额': 'amount',
    '数量': 'quantity', '单价': 'price', '总额': 'total', '合计': 'total',
    '总计': 'grand_total', '平均': 'average', '百分比': 'percentage', '比例': 'ratio',
    '序号': 'seq', '电话': 'phone', '单位': 'unit', '类别': 'category',
    '类型': 'type', '项目': 'item', '区域': 'region', '指标': 'indicator',
    '数值': 'value', '收入': 'revenue', '利润': 'profit', '成本': 'cost',
    '地址': 'address', '姓名': 'person_name', '级别': 'level', '等级': 'grade',
    '结论': 'conclusion', '结果': 'result', '情况': 'situation',
    // 销售经营
    '销售额': 'sales', '净利润': 'net_profit', '产品名称': 'product_name',
    '销售数量': 'sales_quantity', '销售单价': 'sales_price', '销售总额': 'total_sales',
    // 资产车辆
    '资产名称': 'asset_name', '资产编号': 'asset_code', '设备型号': 'device_model',
    '购置日期': 'purchase_date', '资产原值': 'original_value',
    '车辆': 'vehicle', '车牌号码': 'plate_no', '车牌': 'plate', '号码': 'number',
    '品牌颜色': 'brand_color', '品牌': 'brand', '颜色': 'color',
    '型号': 'model', '排量': 'displacement',
    '发动机号': 'engine_no', '发动机': 'engine',
    '购入日期': 'purchase_date', '购入': 'purchase', '裸车价': 'bare_price',
    '行驶里程': 'mileage', '里程': 'mileage', '使用人': 'user_name',
  };

  if (chineseToEnglish[label]) {
    return chineseToEnglish[label];
  }

  let result = '';
  let i = 0;
  while (i < label.length) {
    let found = false;
    for (let len = Math.min(label.length - i, 4); len >= 1; len--) {
      const chunk = label.substring(i, i + len);
      if (chineseToEnglish[chunk]) {
        result += (result ? '_' : '') + chineseToEnglish[chunk];
        i += len;
        found = true;
        break;
      }
    }
    if (!found) {
      i++;
    }
  }

  if (!result) {
    let hash = 0;
    for (let j = 0; j < label.length; j++) {
      hash = (hash * 31 + label.charCodeAt(j)) & 0x7fffffff;
    }
    result = 'field_' + hash.toString(36).slice(0, 6);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* 文件解析入口                                                        */
/* ------------------------------------------------------------------ */

/**
 * 从 Excel 文件中解析并智能分析表格结构
 * - 自动识别标题行、表头行（含二级合并表头）、注释行、落款行
 * - 自动推断字段类型（含 Excel 日期序列）、提取下拉选项、推荐必填
 * - 自动判定表格格式：明细表 / 汇总指标表 / 交叉表
 */
export function parseExcelFields(file: File): Promise<SheetAnalysis> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const { read, utils } = await import('xlsx');
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        // cellDates: true → 日期序列号解析为 Date 单元格（t:'d'），便于识别日期列
        const workbook = read(data, { type: 'array', cellDates: true });

        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) {
          reject(new Error('Excel 文件中没有找到工作表'));
          return;
        }

        const worksheet = workbook.Sheets[firstSheet];
        if (!worksheet || !worksheet['!ref']) {
          reject(new Error('Excel 文件为空'));
          return;
        }

        const range = utils.decode_range(worksheet['!ref']);
        const grid: RawCell[][] = [];
        for (let r = range.s.r; r <= range.e.r; r++) {
          const row: RawCell[] = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = worksheet[utils.encode_cell({ r, c })];
            if (!cell) {
              row.push({ v: '', t: 'z' });
            } else {
              const text = (cell.w ?? (cell.v != null ? String(cell.v) : '')).trim();
              row.push({ v: text, t: cell.t || 'z' });
            }
          }
          grid.push(row);
        }

        const merges: MergeRange[] = (worksheet['!merges'] || []).map((m: any) => ({
          s: { r: m.s.r, c: m.s.c },
          e: { r: m.e.r, c: m.e.c },
        }));

        resolve(analyzeSheetData(grid, merges));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Excel 解析失败'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}
