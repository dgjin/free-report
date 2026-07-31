import assert from 'node:assert/strict';
import test from 'node:test';

import {
  autoMapColumns,
  buildImportRows,
  parseMatrixRowTarget,
  validateMappings,
  type ImportFieldRef,
  type ImportMatrixGroupRef,
} from '../src/utils/dataImportMapping';

// --- fixtures ---

const fields: ImportFieldRef[] = [
  { id: 10, field_label: '总收入（万元）', data_type: 'summary' },
  { id: 11, field_label: '净利润（万元）', data_type: 'summary' },
  { id: 12, field_label: '产品名称', data_type: 'detail' },
  { id: 13, field_label: '销售额（万元）', data_type: 'detail' },
];
const fieldsById = new Map(fields.map((f) => [f.id, f]));

// --- autoMapColumns ---

test('autoMapColumns: 首列默认公司编码，标签精确匹配字段，未知列忽略', () => {
  const mappings = autoMapColumns(
    ['分公司编码', '总收入（万元）', '销售额（万元）', '无关列'],
    fields,
  );
  assert.deepEqual(mappings, ['company', 10, 13, 'ignore']);
});

test('autoMapColumns: 同一字段不会被两列同时占用', () => {
  const mappings = autoMapColumns(
    ['公司编码', '总收入（万元）', '总收入（万元）'],
    fields,
  );
  assert.deepEqual(mappings, ['company', 10, 'ignore']);
});

// --- buildImportRows ---

test('buildImportRows: 基本汇总+明细组装', () => {
  const mappings = autoMapColumns(
    ['分公司编码', '总收入（万元）', '产品名称', '销售额（万元）'],
    fields,
  );
  const { rows, errors } = buildImportRows(
    [['BJ001', '850', '空调', '500']],
    mappings,
    fieldsById,
  );
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    company_code: 'BJ001',
    summary: { '10': '850' },
    details: [{ '12': '空调', '13': '500' }],
  });
});

test('buildImportRows: 公司编码留空沿用上一行，汇总列取首个非空值', () => {
  const mappings = autoMapColumns(
    ['分公司编码', '总收入（万元）', '产品名称'],
    fields,
  );
  const { rows, errors } = buildImportRows(
    [
      ['BJ001', '850', '空调'],
      ['', '999', '冰箱'], // 汇总列第二行不应覆盖首行
      ['SH002', '1200', ''],
    ],
    mappings,
    fieldsById,
  );
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    company_code: 'BJ001',
    summary: { '10': '850' },
    details: [{ '12': '空调' }, { '12': '冰箱' }],
  });
  assert.deepEqual(rows[1], {
    company_code: 'SH002',
    summary: { '10': '1200' },
    details: [],
  });
});

test('buildImportRows: 整行空白跳过；首行缺公司编码记行级错误', () => {
  const mappings = autoMapColumns(['分公司编码', '总收入（万元）'], fields);
  const { rows, errors } = buildImportRows(
    [
      ['', ''],
      ['', '300'],
    ],
    mappings,
    fieldsById,
  );
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /第 3 行.*分公司编码/);
});

test('buildImportRows: 全空数据返回未解析到有效数据行', () => {
  const mappings = autoMapColumns(['分公司编码', '总收入（万元）'], fields);
  const { rows, errors } = buildImportRows([['', '']], mappings, fieldsById);
  assert.equal(rows.length, 0);
  assert.deepEqual(errors, ['未解析到有效数据行']);
});

// --- validateMappings ---

test('validateMappings: 必须含公司编码列与至少一个字段列', () => {
  assert.match(validateMappings(['ignore', 10] as any)!, /分公司编码/);
  assert.match(validateMappings(['company', 'ignore'] as any)!, /至少/);
  assert.equal(validateMappings(['company', 10] as any), null);
});

// --- matrix（交叉表）导入 ---

const matrixFields: ImportFieldRef[] = [
  { id: 10, field_label: '总收入（万元）', data_type: 'summary' },
  { id: 12, field_label: '备注', data_type: 'detail' },
  { id: 55, field_label: '一季度销量', data_type: 'matrix' },
  { id: 56, field_label: '二季度销量', data_type: 'matrix' },
];
const matrixFieldsById = new Map(matrixFields.map((f) => [f.id, f]));
const matrixGroups: ImportMatrixGroupRef[] = [
  { rowLabel: '产品', rowOptions: ['空调', '冰箱', '洗衣机'], fieldIds: [55, 56] },
];

test('parseMatrixRowTarget: 解析行维度列映射', () => {
  assert.equal(parseMatrixRowTarget('matrix_row_0'), 0);
  assert.equal(parseMatrixRowTarget('matrix_row_2'), 2);
  assert.equal(parseMatrixRowTarget('company'), null);
  assert.equal(parseMatrixRowTarget('ignore'), null);
  assert.equal(parseMatrixRowTarget(55), null);
});

test('autoMapColumns: 表头等于行维度标签的列映射为行维度列', () => {
  const mappings = autoMapColumns(
    ['分公司编码', '产品', '一季度销量', '二季度销量'],
    matrixFields,
    matrixGroups,
  );
  assert.deepEqual(mappings, ['company', 'matrix_row_0', 55, 56]);
});

test('buildImportRows: 交叉表值按行选项定位到固定行（details[行选项序号]）', () => {
  const mappings = autoMapColumns(
    ['分公司编码', '产品', '一季度销量', '二季度销量'],
    matrixFields,
    matrixGroups,
  );
  const { rows, errors } = buildImportRows(
    [
      ['BJ001', '冰箱', '200', '300'], // 冰箱 = 行选项下标 1
      ['', '空调', '100', ''], // 空调 = 行选项下标 0
    ],
    mappings,
    matrixFieldsById,
    matrixGroups,
  );
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].details, [
    { '55': '100' },
    { '55': '200', '56': '300' },
  ]);
});

test('buildImportRows: 无效行选项与同公司重复行选项记行级错误', () => {
  const mappings = autoMapColumns(
    ['分公司编码', '产品', '一季度销量'],
    matrixFields,
    matrixGroups,
  );
  const { rows, errors } = buildImportRows(
    [
      ['BJ001', '电视', '100'], // 无效行选项
      ['', '空调', '200'],
      ['', '空调', '300'], // 重复行选项
      ['SH002', '空调', '400'], // 新公司可重新使用同一行选项
    ],
    mappings,
    matrixFieldsById,
    matrixGroups,
  );
  assert.equal(errors.length, 2);
  assert.match(errors[0], /第 2 行.*电视.*行选项/);
  assert.match(errors[1], /第 4 行.*空调.*重复/);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].details, [{ '55': '200' }]);
  assert.deepEqual(rows[1].details, [{ '55': '400' }]);
});

test('buildImportRows: 交叉表列缺少行维度值记一次行级错误', () => {
  const mappings: any[] = ['company', 'matrix_row_0', 55, 56];
  const { rows, errors } = buildImportRows(
    [['BJ001', '', '100', '200']],
    mappings,
    matrixFieldsById,
    matrixGroups,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /第 2 行.*缺少行维度值/);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].details, []);
});

test('buildImportRows: 明细值与交叉表值同行时锚定到同一固定行', () => {
  const mappings = autoMapColumns(
    ['分公司编码', '产品', '一季度销量', '备注'],
    matrixFields,
    matrixGroups,
  );
  const { rows, errors } = buildImportRows(
    [['BJ001', '冰箱', '200', '热销']],
    mappings,
    matrixFieldsById,
    matrixGroups,
  );
  assert.equal(errors.length, 0);
  assert.deepEqual(rows[0].details, [{}, { '55': '200', '12': '热销' }]);
});

test('buildImportRows: 汇总值与交叉表值可同行填写', () => {
  const mappings = autoMapColumns(
    ['分公司编码', '总收入（万元）', '产品', '一季度销量'],
    matrixFields,
    matrixGroups,
  );
  const { rows, errors } = buildImportRows(
    [
      ['BJ001', '850', '空调', '100'],
      ['', '', '冰箱', '200'],
    ],
    mappings,
    matrixFieldsById,
    matrixGroups,
  );
  assert.equal(errors.length, 0);
  assert.deepEqual(rows[0], {
    company_code: 'BJ001',
    summary: { '10': '850' },
    details: [{ '55': '100' }, { '55': '200' }],
  });
});

// --- 值校验与 strict 模式（archive 归档） ---

const typedFields: ImportFieldRef[] = [
  { id: 20, field_label: '总收入', data_type: 'summary', field_type: 'number', config: { required: true, min: 0, max: 10000 } },
  { id: 21, field_label: '成本', data_type: 'summary', field_type: 'number', config: {} },
  { id: 22, field_label: '总计', data_type: 'summary', field_type: 'number', config: { validation: { sum_of: [20, 21] } } },
  { id: 23, field_label: '产品名称', data_type: 'detail', field_type: 'text', config: { required: true } },
  { id: 24, field_label: '销售额', data_type: 'detail', field_type: 'number', config: {} },
];
const typedFieldsById = new Map(typedFields.map((f) => [f.id, f]));
const typedHeaders = ['分公司编码', '总收入', '成本', '总计', '产品名称', '销售额'];

test('buildImportRows: 单元格类型/范围错误行级报错（非 strict 也生效）', () => {
  const mappings = autoMapColumns(typedHeaders, typedFields);
  const { errors } = buildImportRows(
    [
      ['BJ001', 'abc', '', '', '', ''],
      ['SH002', '-5', '', '', '', ''],
      ['GZ003', '100', '', '', '空调', 'xx'],
    ],
    mappings,
    typedFieldsById,
  );
  assert.equal(errors.length, 3);
  assert.match(errors[0], /第 2 行：「总收入」值「abc」不是有效数字/);
  assert.match(errors[1], /第 3 行：「总收入」值 -5 小于最小值 0/);
  assert.match(errors[2], /第 4 行：「销售额」值「xx」不是有效数字/);
});

test('buildImportRows: 非 strict（prefill）不检查必填与跨字段规则', () => {
  const mappings = autoMapColumns(typedHeaders, typedFields);
  const { rows, errors } = buildImportRows(
    [['BJ001', '', '100', '999', '', '300']], // 总收入必填缺失、明细缺产品名称、总计不等于和
    mappings,
    typedFieldsById,
  );
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 1);
});

test('buildImportRows: strict（archive）必填缺失按公司行报错', () => {
  const mappings = autoMapColumns(typedHeaders, typedFields);
  const { errors } = buildImportRows(
    [['BJ001', '', '100', '', '', '300']],
    mappings,
    typedFieldsById,
    [],
    { strict: true },
  );
  assert.equal(errors.length, 2);
  assert.match(errors[0], /公司 BJ001：「总收入」为必填项/);
  assert.match(errors[1], /公司 BJ001：明细第 1 行「产品名称」为必填项/);
});

test('buildImportRows: strict（archive）跨字段 sum_of 超差报错、相等通过', () => {
  const mappings = autoMapColumns(typedHeaders, typedFields);
  const bad = buildImportRows(
    [['BJ001', '600', '400', '900', '', '']],
    mappings,
    typedFieldsById,
    [],
    { strict: true },
  );
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /公司 BJ001：「总计」\(900\) 应等于 总收入\+成本 之和 \(1000\)/);

  const ok = buildImportRows(
    [['BJ001', '600', '400', '1000', '', '']],
    mappings,
    typedFieldsById,
    [],
    { strict: true },
  );
  assert.equal(ok.errors.length, 0);
});
