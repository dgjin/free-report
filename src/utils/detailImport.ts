/**
 * 分公司填报页「明细数据 Excel 导入」解析逻辑（纯函数，供组件与单元测试共用）。
 *
 * 针对真实填报表格（如《安徽省分公司公务用车统计表》）优化：
 * - 表头自动定位：兼容文件顶部标题行、填报说明行（表头不再必须在第 1 行）
 * - 表头模糊匹配：全角/半角、括号、空白、尾部冒号差异自动归一，支持包含式匹配
 * - 落款行过滤：自动跳过「填表人：/联系电话：/日期：」等签字行与注释行
 * - 空行过滤：整行无映射值的行不计入导入
 * - 值规范化：数字去千分位/货币符号，日期（Date 对象、中文日期、斜杠日期）统一为 YYYY-MM-DD，
 *   下拉值按选项归一（容忍空白与全半角差异）
 */

export interface DetailImportField {
  id: number;
  field_label: string;
  field_type?: string; // 'text' | 'number' | 'date' | 'select' | 'textarea'
  /** select 类型的候选选项（用于值归一） */
  options?: string[];
}

export interface DetailColumnMapping {
  excelHeader: string;
  matchedFieldId: number | null;
  fieldLabel: string;
}

export interface DetailImportResult {
  /** 表头所在行（0 基，相对于传入的 rawRows） */
  headerRowIndex: number;
  mapping: DetailColumnMapping[];
  /** 解析出的明细数据行（仅含已映射字段） */
  rows: Array<Record<string, string>>;
  /** 跳过的落款/注释行数 */
  skippedFooter: number;
  /** 跳过的无映射值行数 */
  skippedEmpty: number;
  /** 识别过程说明（供 UI 展示） */
  notes: string[];
}

/** 标签归一：全角转半角、去空白、去括号/冒号等标点、小写化 */
function normalizeLabel(raw: string): string {
  return (raw ?? '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')
    .replace(/[()（）\[\]【】:：,，.。、/\\_\-]/g, '')
    .toLowerCase();
}

/** 匹配评分：归一相等 2 分；互为包含（最短长度≥2）1 分；否则 0 分 */
function matchScore(fieldLabel: string, header: string): number {
  const f = normalizeLabel(fieldLabel);
  const h = normalizeLabel(header);
  if (!f || !h) return 0;
  if (f === h) return 2;
  const minLen = Math.min(f.length, h.length);
  if (minLen >= 2 && (f.includes(h) || h.includes(f))) return 1;
  return 0;
}

/** 为表头单元格挑选最佳未占用字段 */
function bestField(header: string, fields: DetailImportField[], used: Set<number>): DetailImportField | null {
  let best: DetailImportField | null = null;
  let bestScore = 0;
  for (const f of fields) {
    if (used.has(f.id)) continue;
    const s = matchScore(f.field_label, header);
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }
  return bestScore > 0 ? best : null;
}

/** 逐列构建字段映射（先精确后模糊，单字段最多被一列占用） */
export function mapDetailHeaders(headers: string[], fields: DetailImportField[]): DetailColumnMapping[] {
  const used = new Set<number>();
  const mapping: DetailColumnMapping[] = headers.map((h) => ({
    excelHeader: h,
    matchedFieldId: null,
    fieldLabel: '',
  }));
  // 第一遍：仅接受归一相等（避免包含式匹配抢占列）
  headers.forEach((h, i) => {
    const hit = fields.find((f) => !used.has(f.id) && matchScore(f.field_label, h) === 2);
    if (hit) {
      used.add(hit.id);
      mapping[i] = { excelHeader: h, matchedFieldId: hit.id, fieldLabel: hit.field_label };
    }
  });
  // 第二遍：包含式模糊匹配
  headers.forEach((h, i) => {
    if (mapping[i].matchedFieldId !== null) return;
    const hit = bestField(h, fields, used);
    if (hit) {
      used.add(hit.id);
      mapping[i] = { excelHeader: h, matchedFieldId: hit.id, fieldLabel: hit.field_label };
    }
  });
  return mapping;
}

/** 落款/注释行识别：填表人、联系电话、日期签字、备注说明等 */
const FOOTER_PATTERN =
  /^\s*(填表人|填报人|制表人|审核人|复核人|审批人|单位负责人|负责人|联系电话|联系手机|电话|手机|邮箱|填报日期|填表日期|制表日期|日期|备注|说明|注)\s*[:：]/;

function isFooterRow(cells: unknown[]): boolean {
  return cells.some((c) => {
    const t = cellToText(c).trim();
    return t !== '' && FOOTER_PATTERN.test(t);
  });
}

/** 单元格转文本：Date → YYYY-MM-DD，其余转字符串并 trim */
function cellToText(cell: unknown): string {
  if (cell == null) return '';
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return '';
    return formatDate(cell);
  }
  return String(cell).trim();
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 日期文本归一为 YYYY-MM-DD（支持 2022年7月4日、2022/7/4、2022.7.4） */
function normalizeDateText(text: string): string {
  const t = text.trim();
  const chinese = t.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  const slashed = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const m = chinese ?? slashed;
  if (!m) return t;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** 数字文本归一：去千分位逗号、货币符号、空白；无法归一时保留原文 */
function normalizeNumberText(text: string): string {
  const cleaned = text.replace(/[，,￥¥$\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? cleaned : text.trim();
}

/** 按字段类型规范化单元格值 */
function normalizeValue(cell: unknown, field: DetailImportField | undefined): string {
  let text = cellToText(cell);
  if (!field) return text;
  if (field.field_type === 'number') {
    return normalizeNumberText(text);
  }
  if (field.field_type === 'date') {
    return normalizeDateText(text);
  }
  if (field.field_type === 'select' && field.options && field.options.length > 0) {
    const hit = field.options.find((opt) => normalizeLabel(opt) === normalizeLabel(text));
    if (hit) return hit;
  }
  return text;
}

/**
 * 在首若干行中自动定位表头行：按「可归一匹配到模板字段的列数 × 匹配质量」打分，
 * 得分最高的行作为表头；无任何匹配时回退到第 1 行（兼容旧行为）。
 */
export function detectHeaderRowIndex(rawRows: unknown[][], fields: DetailImportField[]): number {
  const maxScan = Math.min(10, rawRows.length - 1);
  let bestIndex = 0;
  let bestScore = 0;
  for (let r = 0; r <= maxScan; r++) {
    const row = rawRows[r] ?? [];
    const mapping = mapDetailHeaders(row.map((c) => cellToText(c)), fields);
    const matchedCount = mapping.filter((m) => m.matchedFieldId !== null).length;
    const score = matchedCount * 2 + (matchedCount >= Math.min(2, fields.length) ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = r;
    }
  }
  return bestScore >= 3 ? bestIndex : 0;
}

/**
 * 解析明细导入数据：自动定位表头 → 列映射 → 过滤落款/空行 → 值规范化。
 */
export function parseDetailRows(rawRows: unknown[][], fields: DetailImportField[]): DetailImportResult {
  const notes: string[] = [];
  const headerRowIndex = detectHeaderRowIndex(rawRows, fields);
  if (headerRowIndex > 0) {
    notes.push(`表头自动定位于第 ${headerRowIndex + 1} 行（已跳过上方标题/说明 ${headerRowIndex} 行）`);
  }

  const headers = (rawRows[headerRowIndex] ?? []).map((c) => cellToText(c));
  const mapping = mapDetailHeaders(headers, fields);

  const fieldsById = new Map<number, DetailImportField>(fields.map((f) => [f.id, f]));
  const rows: Array<Record<string, string>> = [];
  let skippedFooter = 0;
  let skippedEmpty = 0;

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const cells = rawRows[r] ?? [];
    const hasContent = cells.some((c) => cellToText(c) !== '');
    if (!hasContent) continue;
    if (isFooterRow(cells)) {
      skippedFooter++;
      continue;
    }
    const record: Record<string, string> = {};
    let hasValue = false;
    mapping.forEach((m, ci) => {
      if (m.matchedFieldId === null) return;
      const value = normalizeValue(cells[ci], fieldsById.get(m.matchedFieldId));
      record[m.matchedFieldId] = value;
      if (value !== '') hasValue = true;
    });
    if (!hasValue) {
      skippedEmpty++;
      continue;
    }
    rows.push(record);
  }

  if (skippedFooter > 0) notes.push(`已跳过落款/说明 ${skippedFooter} 行（填表人、联系电话、日期等）`);
  if (skippedEmpty > 0) notes.push(`已跳过无有效数据 ${skippedEmpty} 行`);

  return { headerRowIndex, mapping, rows, skippedFooter, skippedEmpty, notes };
}
