import assert from 'node:assert/strict';
import test from 'node:test';

import {
  autoMapColumns,
  buildImportRows,
  validateMappings,
  type ImportFieldRef,
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
