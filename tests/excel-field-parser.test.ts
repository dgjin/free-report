import assert from 'node:assert/strict';
import test from 'node:test';

const parser = await import('../src/utils/excelFieldParser.ts');
const { analyzeSheetData } = parser;

type RawCell = { v: string; t: string };

/** 构造单元格网格的便捷函数 */
function gridOf(rows: Array<Array<string | RawCell>>): RawCell[][] {
  return rows.map((row) =>
    row.map((cell) => (typeof cell === 'string' ? { v: cell, t: 's' } : cell))
  );
}
const n = (v: string | number): RawCell => ({ v: String(v), t: 'n' });
const d = (v: string): RawCell => ({ v, t: 'd' });

/* ------------------------------------------------------------------ */
/* 参照文件：（安徽省分公司）附件1：公务用车统计表.xlsx                    */
/* ------------------------------------------------------------------ */

function vehicleSheet() {
  const grid = gridOf([
    ['中国东方资产管理股份有限公司', '', '', '', '', '', '', '', '', '', ''],
    ['公务用车统计表', '', '', '', '', '', '', '', '', '', ''],
    ['序号', '车牌号码', '品牌颜色', '型号', '排量', '发动机号', '车辆购入日期', '裸车价', '行驶里程（公里）', '使用人', '备注'],
    ['', '', '', '', '', '', '', '', '', '专车写使用人', ''],
    [n(1), '皖A30678', '奥迪（传奇黑）', 'FV7201BACWG', '2.0T', n(233471), d('2012年8月3日'), '44.48万元', n(257747), '分公司主要负责人(顾健新)', '相对固定公务用车'],
    [n(2), '皖ADF181', '别克（珍珠白）', 'SGM6522UBA6', '2.0T', n(201390830), d('2013年5月20日'), '37.99万元', n(48649), '部门公务活动使用', '机动公务用车'],
    [n(3), '皖AD5N97', '别克（珍珠白）', 'SGM6522UAA2', '2.0T', n(180705159), d('2013年4月12日'), '36.59万元', n(139630), '部门公务活动使用', '机动公务用车'],
    [n(4), '皖AB3930', '别克（银色）', 'SGM6531UAAB', '3.0T', n(140650180), d('2013年6月1日'), '37.99万元', n(274656), '部门公务活动使用', '机动公务用车'],
    ['', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', ''],
    ['填表人：', '刘闽志', '电话：', '0551-63518031', '', '', '', '', '', '', '2025.12.31'],
  ]);
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
  ];
  return { grid, merges };
}

test('识别标题行并提取表格名称', () => {
  const { grid, merges } = vehicleSheet();
  const a = analyzeSheetData(grid, merges);
  assert.equal(a.tableName, '公务用车统计表');
  assert.equal(a.headerRowIndex, 2);
  assert.ok(a.notes.some((t) => t.includes('标题 2 行')));
});

test('跳过注释行、空白行与落款行，正确统计数据行', () => {
  const { grid, merges } = vehicleSheet();
  const a = analyzeSheetData(grid, merges);
  assert.equal(a.dataRowCount, 4);
  assert.ok(a.notes.some((t) => t.includes('注释行')));
  assert.ok(a.notes.some((t) => t.includes('空白 2 行')));
  assert.ok(a.notes.some((t) => t.includes('落款 1 行')));
});

test('参照文件识别为明细表并生成 11 个字段', () => {
  const { grid, merges } = vehicleSheet();
  const a = analyzeSheetData(grid, merges);
  assert.equal(a.format, 'detail');
  assert.equal(a.fields.length, 11);
  assert.equal(a.fields[1].field_label, '车牌号码');
  assert.equal(a.fields[1].field_name, 'plate_no');
  assert.equal(a.fields[8].field_name, 'mileage');
});

test('序号列默认跳过导入', () => {
  const { grid, merges } = vehicleSheet();
  const a = analyzeSheetData(grid, merges);
  const seq = a.fields.find((f) => f.field_label === '序号');
  assert.ok(seq);
  assert.equal(seq.skipped, true);
  assert.equal(seq.skip_reason, '序号列');
});

test('Excel 日期序列识别为日期类型', () => {
  const { grid, merges } = vehicleSheet();
  const a = analyzeSheetData(grid, merges);
  const purchaseDate = a.fields.find((f) => f.field_label === '车辆购入日期');
  assert.ok(purchaseDate);
  assert.equal(purchaseDate.field_type, 'date');
});

test('带单位数字识别为数字类型并给出提示', () => {
  const { grid, merges } = vehicleSheet();
  const a = analyzeSheetData(grid, merges);
  const price = a.fields.find((f) => f.field_label === '裸车价');
  assert.ok(price);
  assert.equal(price.field_type, 'number');
  assert.ok(price.hint?.includes('单位'));
});

test('标签纠偏：备注列不误判为下拉，使用人不误判为下拉', () => {
  const { grid, merges } = vehicleSheet();
  const a = analyzeSheetData(grid, merges);
  const remark = a.fields.find((f) => f.field_label === '备注');
  const user = a.fields.find((f) => f.field_label === '使用人');
  assert.equal(remark?.field_type, 'textarea');
  assert.equal(user?.field_type, 'text');
});

test('数据完整的列推荐必填', () => {
  const { grid, merges } = vehicleSheet();
  const a = analyzeSheetData(grid, merges);
  const plate = a.fields.find((f) => f.field_label === '车牌号码');
  assert.equal(plate?.required, true);
  assert.equal(plate?.data_type, 'detail');
});

/* ------------------------------------------------------------------ */
/* 简单表头文件（向后兼容）                                             */
/* ------------------------------------------------------------------ */

test('第一行即表头的简单文件保持兼容', () => {
  const grid = gridOf([
    ['产品名称', '销量', '单价'],
    ['苹果', n(100), n(5.5)],
    ['香蕉', n(200), n(3.2)],
  ]);
  const a = analyzeSheetData(grid, []);
  assert.equal(a.headerRowIndex, 0);
  assert.equal(a.format, 'detail');
  assert.equal(a.fields.length, 3);
  assert.equal(a.fields[1].field_type, 'number');
  assert.equal(a.dataRowCount, 2);
});

/* ------------------------------------------------------------------ */
/* 汇总指标表（键值表）                                                 */
/* ------------------------------------------------------------------ */

test('两列键值表识别为汇总指标表，数据行转换为汇总指标', () => {
  const grid = gridOf([
    ['指标', '数值'],
    ['总收入', n(1200)],
    ['净利润', n(350)],
    ['在册员工数', n(86)],
    ['盘点结论', '正常'],
  ]);
  const a = analyzeSheetData(grid, []);
  assert.equal(a.format, 'summary');
  assert.equal(a.fields.length, 4);
  assert.equal(a.fields[0].field_label, '总收入');
  assert.equal(a.fields[0].data_type, 'summary');
  assert.equal(a.fields[0].field_type, 'number');
  assert.equal(a.fields[3].field_type, 'text');
});

/* ------------------------------------------------------------------ */
/* 交叉表（二级合并表头）                                               */
/* ------------------------------------------------------------------ */

test('二级合并表头识别为交叉表并构建行维度与列指标', () => {
  const grid = gridOf([
    ['销售区域', '经营情况', ''],
    ['', '销售额', '订单数'],
    ['华东', n(1200), n(35)],
    ['华北', n(980), n(28)],
    ['华南', n(860), n(24)],
  ]);
  const merges = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }];
  const a = analyzeSheetData(grid, merges);
  assert.equal(a.format, 'matrix');
  assert.ok(a.matrix);
  assert.equal(a.matrix.row_label, '销售区域');
  assert.deepEqual(a.matrix.row_options, ['华东', '华北', '华南']);
  assert.equal(a.matrix.columns.length, 2);
  assert.deepEqual(
    a.matrix.columns.map((c) => c.field_label),
    ['销售额', '订单数']
  );
  assert.ok(a.matrix.columns.every((c) => c.field_type === 'number'));
});

/* ------------------------------------------------------------------ */
/* 下拉选项自动提取                                                     */
/* ------------------------------------------------------------------ */

test('低基数文本列识别为下拉并自动提取选项', () => {
  const grid = gridOf([
    ['设备名称', '运行状态'],
    ['空压机', '正常'],
    ['起重机', '待维修'],
    ['叉车', '正常'],
    ['吊车', '报废'],
    ['电梯', '正常'],
  ]);
  const a = analyzeSheetData(grid, []);
  const status = a.fields.find((f) => f.field_label === '运行状态');
  assert.ok(status);
  assert.equal(status.field_type, 'select');
  assert.deepEqual(status.options, ['正常', '待维修', '报废']);
});

/* ------------------------------------------------------------------ */
/* 格式强制切换                                                         */
/* ------------------------------------------------------------------ */

test('forcedFormat 可将键值表强制按明细导入', () => {
  const grid = gridOf([
    ['指标', '数值'],
    ['总收入', n(1200)],
    ['净利润', n(350)],
    ['在册员工数', n(86)],
  ]);
  const a = analyzeSheetData(grid, [], 'detail');
  assert.equal(a.format, 'detail');
  assert.equal(a.fields.length, 2);
});

/* ------------------------------------------------------------------ */
/* 手动选择表头行                                                       */
/* ------------------------------------------------------------------ */

/** 首行双格信息栏会干扰自动定位（误认首行为表头） */
function misleadingSheet() {
  return gridOf([
    ['填报单位：合肥中支', '', '填报日期：2026年7月', ''],
    ['公务用车统计表', '', '', ''],
    ['车牌号', '品牌型号', '排量', '座位数'],
    ['皖A00001', '帕萨特', n(1.8), n(5)],
    ['皖A00002', '凯美瑞', n(2.0), n(5)],
  ]);
}

test('自动定位可能被首行信息栏干扰', () => {
  const a = analyzeSheetData(misleadingSheet(), []);
  // 自动定位把首行（填报单位/填报日期）当作表头
  assert.equal(a.headerRowIndex, 0);
});

test('headerRowOverride 手动指定表头行后正确解析', () => {
  const a = analyzeSheetData(misleadingSheet(), [], undefined, 2);
  assert.equal(a.headerRowIndex, 2);
  assert.equal(a.tableName, '公务用车统计表');
  assert.deepEqual(
    a.fields.map((f) => f.field_label),
    ['车牌号', '品牌型号', '排量', '座位数']
  );
  assert.equal(a.dataRowCount, 2);
  assert.ok(a.notes.some((t) => t.includes('手动选择')));
});

test('headerRowOverride 越界时回退自动定位', () => {
  const grid = gridOf([
    ['名称', '数量'],
    ['苹果', n(10)],
  ]);
  const a = analyzeSheetData(grid, [], undefined, 99);
  assert.equal(a.headerRowIndex, 0);
  assert.equal(a.fields.length, 2);
});

/* ------------------------------------------------------------------ */
/* 强制交叉表（无二级合并表头）                                          */
/* ------------------------------------------------------------------ */

test('forcedFormat=matrix 可将普通表格按交叉表导入', () => {
  const grid = gridOf([
    ['销售区域', '销售额', '订单数'],
    ['华东', n(1200), n(35)],
    ['华北', n(980), n(28)],
    ['华南', n(860), n(24)],
  ]);
  const a = analyzeSheetData(grid, [], 'matrix');
  assert.equal(a.format, 'matrix');
  assert.ok(a.matrix);
  assert.equal(a.matrix.row_label, '销售区域');
  assert.deepEqual(a.matrix.row_options, ['华东', '华北', '华南']);
  assert.deepEqual(
    a.matrix.columns.map((c) => c.field_label),
    ['销售额', '订单数']
  );
  assert.ok(a.matrix.columns.every((c) => c.field_type === 'number'));
  assert.ok(a.notes.some((t) => t.includes('按交叉表解析')));
});

test('同一表格不强制时保持明细表识别', () => {
  const grid = gridOf([
    ['销售区域', '销售额', '订单数'],
    ['华东', n(1200), n(35)],
    ['华北', n(980), n(28)],
    ['华南', n(860), n(24)],
  ]);
  const a = analyzeSheetData(grid, []);
  assert.equal(a.format, 'detail');
  assert.equal(a.fields.length, 3);
});
