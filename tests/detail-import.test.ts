import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseDetailRows,
  detectHeaderRowIndex,
  mapDetailHeaders,
  type DetailImportField,
} from '../src/utils/detailImport';

// 模拟「公务用车明细表」模板的明细字段
const FIELDS: DetailImportField[] = [
  { id: 101, field_label: '车牌号', field_type: 'text' },
  { id: 102, field_label: '品牌型号', field_type: 'text' },
  { id: 103, field_label: '排量(L)', field_type: 'number' },
  { id: 104, field_label: '座位数', field_type: 'number' },
  { id: 105, field_label: '使用性质', field_type: 'select', options: ['公务用车', '商务用车', '生产用车', '其他'] },
  { id: 106, field_label: '购置日期', field_type: 'date' },
  { id: 107, field_label: '资金来源', field_type: 'text' },
  { id: 108, field_label: '驾驶员姓名', field_type: 'text' },
];

/**
 * 完全模拟《（安徽省分公司）附件1：公务用车统计表.xlsx》结构：
 * 标题行、填报说明行、第 3 行表头（含合并单元格产生的空列）、
 * 数据行（含 Date 对象/斜杠日期/尾随空格）、填表人/日期落款行。
 */
function referenceVehicleRows(): unknown[][] {
  return [
    ['附件1'],
    ['安徽省分公司公务用车统计表'],
    ['注：此表数据截至2025年底，请各分公司认真核对后填报。'],
    ['序号', '车牌号', '', '', '填报单位', '品牌型号', '排量（L）', '座位数', '使用性质', '购置日期', '资金来源', '驾驶员姓名'],
    [1, '皖A00001', '', '', '合肥中支', '帕萨特', '1.8', '5', '公务用车', '2022-07-04', '自有资金', '张明'],
    [2, '皖A00002', '', '', '合肥中支', '丰田凯美瑞', 2.0, '5', '公务用车', new Date(2023, 2, 15), '自有资金', '李强'],
    [3, '皖A00003', '', '', '芜湖中支', '别克GL8', '2.0', '7', '商务用车 ', '2021/11/20', '经营租赁', '王磊'],
    [4, '皖A00004', '', '', '蚌埠中支', '奥迪A6L', '2.0', '5', '公务用车', '2020年5月8日', '自有资金', '赵敏'],
    ['填表人：王建军', '', '', '', '联系电话：13866668888', '', '', '', '', '', '', ''],
    ['日期：2026年7月9日', '', '', '', '', '', '', '', '', '', '', ''],
  ];
}

test('公务用车统计表：自动定位表头到第 4 行，跳过标题/说明/落款行', () => {
  const result = parseDetailRows(referenceVehicleRows(), FIELDS);

  assert.equal(result.headerRowIndex, 3);
  assert.equal(result.rows.length, 4);
  assert.equal(result.skippedFooter, 2);
  assert.ok(result.notes.some((n) => n.includes('第 4 行')));
  assert.ok(result.notes.some((n) => n.includes('落款')));
});

test('公务用车统计表：列映射正确（全角括号/合并空列/无关列）', () => {
  const result = parseDetailRows(referenceVehicleRows(), FIELDS);
  const byHeader = new Map(result.mapping.map((m) => [m.excelHeader, m]));

  assert.equal(byHeader.get('车牌号')?.matchedFieldId, 101);
  assert.equal(byHeader.get('品牌型号')?.matchedFieldId, 102);
  // 全角括号表头「排量（L）」应匹配半角字段「排量(L)」
  assert.equal(byHeader.get('排量（L）')?.matchedFieldId, 103);
  assert.equal(byHeader.get('座位数')?.matchedFieldId, 104);
  assert.equal(byHeader.get('使用性质')?.matchedFieldId, 105);
  // 「序号」「填报单位」及合并产生的空列不匹配任何字段
  assert.equal(byHeader.get('序号')?.matchedFieldId, null);
  assert.equal(byHeader.get('填报单位')?.matchedFieldId, null);
  assert.equal(byHeader.get('')?.matchedFieldId, null);
});

test('公务用车统计表：数据值按字段类型规范化', () => {
  const result = parseDetailRows(referenceVehicleRows(), FIELDS);

  // 数字单元格 2.0 → '2'
  assert.equal(result.rows[1]['103'], '2');
  // Date 对象 → YYYY-MM-DD
  assert.equal(result.rows[1]['106'], '2023-03-15');
  // 斜杠日期归一
  assert.equal(result.rows[2]['106'], '2021-11-20');
  // 中文日期归一
  assert.equal(result.rows[3]['106'], '2020-05-08');
  // 下拉值尾随空格 → 归一到候选选项
  assert.equal(result.rows[2]['105'], '商务用车');
  // 文本原样
  assert.equal(result.rows[0]['101'], '皖A00001');
  assert.equal(result.rows[0]['108'], '张明');
});

test('标准导入模板（首行表头）：兼容旧行为，无自动定位说明', () => {
  const rows: unknown[][] = [
    ['车牌号', '品牌型号', '排量(L)', '座位数'],
    ['皖B11111', '帕萨特', '1.8', '5'],
    ['皖B22222', '凯美瑞', '2.0', '5'],
  ];
  const result = parseDetailRows(rows, FIELDS);

  assert.equal(result.headerRowIndex, 0);
  assert.equal(result.rows.length, 2);
  assert.equal(result.skippedFooter, 0);
  assert.ok(!result.notes.some((n) => n.includes('自动定位')));
  assert.equal(result.rows[0]['101'], '皖B11111');
});

test('数字字段：千分位/货币符号归一', () => {
  const fields: DetailImportField[] = [
    { id: 201, field_label: '里程数', field_type: 'number' },
  ];
  const rows: unknown[][] = [
    ['里程数'],
    ['12,345'],
    ['￥8,000.5'],
  ];
  const result = parseDetailRows(rows, fields);
  assert.equal(result.rows[0]['201'], '12345');
  assert.equal(result.rows[1]['201'], '8000.5');
});

test('表头与字段完全不符：映射为空且无有效数据行', () => {
  const rows: unknown[][] = [
    ['无关列A', '无关列B'],
    ['x', 'y'],
  ];
  const result = parseDetailRows(rows, FIELDS);
  assert.equal(result.mapping.every((m) => m.matchedFieldId === null), true);
  assert.equal(result.rows.length, 0);
});

test('detectHeaderRowIndex：无任何匹配时回退第 1 行', () => {
  const rows: unknown[][] = [
    ['foo', 'bar'],
    ['1', '2'],
  ];
  assert.equal(detectHeaderRowIndex(rows, FIELDS), 0);
});

test('mapDetailHeaders：单字段最多被一列占用', () => {
  const headers = ['车牌号', '车牌号'];
  const mapping = mapDetailHeaders(headers, FIELDS);
  assert.equal(mapping[0].matchedFieldId, 101);
  assert.equal(mapping[1].matchedFieldId, null);
});

// --- cellErrors（值校验标注，不阻断解析） ---

test('公务用车统计表：规范化后全部合法，cellErrors 为空', () => {
  const result = parseDetailRows(referenceVehicleRows(), FIELDS);
  assert.deepEqual(result.cellErrors, []);
});

test('值校验：非数字/非法日期/无效选项/超范围记入 cellErrors，行仍保留', () => {
  const fields: DetailImportField[] = [
    { id: 301, field_label: '名称', field_type: 'text' },
    { id: 302, field_label: '数量', field_type: 'number', min: 0 },
    { id: 303, field_label: '购置日期', field_type: 'date' },
    { id: 304, field_label: '类别', field_type: 'select', options: ['A类', 'B类'] },
  ];
  const rows: unknown[][] = [
    ['名称', '数量', '购置日期', '类别'],
    ['甲', '三个', '2024-13-40', 'C类'],
    ['乙', '5', '2024-06-30', 'A类'],
    ['丙', '-2', '', ''],
  ];
  const result = parseDetailRows(rows, fields);

  // 有错的行不剔除（导入进入草稿态，提交时兜底校验）
  assert.equal(result.rows.length, 3);
  assert.equal(result.cellErrors.length, 4);

  const keys = result.cellErrors.map((e) => `${e.rowIdx}#${e.fieldId}`);
  assert.deepEqual(keys, ['0#302', '0#303', '0#304', '2#302']);
  assert.match(result.cellErrors[0].message, /「数量」值「三个」不是有效数字/);
  assert.match(result.cellErrors[1].message, /不是有效日期/);
  assert.match(result.cellErrors[2].message, /「类别」值「C类」不在可选项内/);
  assert.match(result.cellErrors[3].message, /「数量」值 -2 小于最小值 0/);
});

test('值校验：cellErrors 的 rowIdx 指向返回 rows 下标（跳过的空行不占位）', () => {
  const fields: DetailImportField[] = [
    { id: 401, field_label: '数量', field_type: 'number' },
  ];
  const rows: unknown[][] = [
    ['数量'],
    [''],
    ['abc'],
  ];
  const result = parseDetailRows(rows, fields);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.cellErrors, [
    { rowIdx: 0, fieldId: 401, message: '「数量」值「abc」不是有效数字' },
  ]);
});
