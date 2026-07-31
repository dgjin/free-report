import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatrixGroups, buildMatrixRowIndex } from '../src/utils/aggregationView';
import type { ReportTemplateField } from '../src/types';

// --- helpers ---

let nextId = 1;

function matrixField(
  fieldName: string,
  fieldLabel: string,
  fieldConfig: unknown,
): ReportTemplateField {
  return {
    id: nextId++,
    template_id: 1,
    field_name: fieldName,
    field_label: fieldLabel,
    field_type: 'text',
    data_type: 'matrix',
    field_config: fieldConfig as ReportTemplateField['field_config'],
    sort_order: 0,
    status: 'active',
  };
}

function matrixConfig(rowLabel: string, rowOptions: string[] = ['行1', '行2']) {
  return JSON.stringify({ required: true, matrix: { row_label: rowLabel, row_options: rowOptions, column_label: '列' } });
}

// --- buildMatrixGroups ---

test('buildMatrixGroups: 同 row_label 的列归入同一组，列顺序保持', () => {
  const fields = [
    matrixField('field_bj', '北京', matrixConfig('产品/区域')),
    matrixField('field_tj', '天津', matrixConfig('产品/区域')),
    matrixField('field_hb', '河北', matrixConfig('产品/区域')),
  ];
  const groups = buildMatrixGroups(fields);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rowLabel, '产品/区域');
  assert.deepEqual(groups[0].rowOptions, ['行1', '行2']);
  assert.deepEqual(
    groups[0].columns.map((c) => c.field_label),
    ['北京', '天津', '河北'],
  );
});

test('buildMatrixGroups: 不同 row_label 拆成多组', () => {
  const fields = [
    matrixField('a', 'A', matrixConfig('维度一')),
    matrixField('b', 'B', matrixConfig('维度二')),
    matrixField('c', 'C', matrixConfig('维度一')),
  ];
  const groups = buildMatrixGroups(fields);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].rowLabel, '维度一');
  assert.equal(groups[0].columns.length, 2);
  assert.equal(groups[1].rowLabel, '维度二');
  assert.equal(groups[1].columns.length, 1);
});

test('buildMatrixGroups: field_config 为对象（非字符串）时同样可解析', () => {
  const fields = [
    matrixField('a', 'A', { matrix: { row_label: '维度', row_options: ['x'], column_label: '列' } }),
  ];
  const groups = buildMatrixGroups(fields);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rowOptions, ['x']);
});

test('buildMatrixGroups: 非法 JSON 的列被跳过，不影响其余列', () => {
  const fields = [
    matrixField('bad', '坏列', '{not-json'),
    matrixField('good', '好列', matrixConfig('维度')),
  ];
  const groups = buildMatrixGroups(fields);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].columns.map((c) => c.field_name), ['good']);
});

test('buildMatrixGroups: 缺 matrix 或缺 row_label 的字段被跳过', () => {
  const fields = [
    matrixField('no_matrix', '无矩阵配置', JSON.stringify({ required: true })),
    matrixField('no_row_label', '缺行维度', JSON.stringify({ matrix: { row_options: ['x'] } })),
  ];
  assert.deepEqual(buildMatrixGroups(fields), []);
});

test('buildMatrixGroups: 入参为 undefined 或空数组时返回空组', () => {
  assert.deepEqual(buildMatrixGroups(undefined), []);
  assert.deepEqual(buildMatrixGroups([]), []);
});

test('buildMatrixGroups: matrix 缺 row_options 时回退为空数组', () => {
  const fields = [
    matrixField('a', 'A', JSON.stringify({ matrix: { row_label: '维度' } })),
  ];
  const groups = buildMatrixGroups(fields);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rowOptions, []);
});

// --- buildMatrixRowIndex ---

test('buildMatrixRowIndex: 按 company_id + 库内真实 row_index 定位数据行', () => {
  // 后端契约：row_index 为各机构独立从 1 开始的真实行号，seq 才是跨机构连续序号
  const detailRows = [
    { company_id: 2, company_name: '北京分公司', row_index: 1, seq: 1, field_a: 'BJ-r1' },
    { company_id: 2, company_name: '北京分公司', row_index: 2, seq: 2, field_a: 'BJ-r2' },
    { company_id: 3, company_name: '上海分公司', row_index: 1, seq: 3, field_a: 'SH-r1' },
    { company_id: 3, company_name: '上海分公司', row_index: 2, seq: 4, field_a: 'SH-r2' },
  ];
  const idx = buildMatrixRowIndex(detailRows);
  assert.equal(idx.get('2#1')?.field_a, 'BJ-r1');
  assert.equal(idx.get('2#2')?.field_a, 'BJ-r2');
  assert.equal(idx.get('3#1')?.field_a, 'SH-r1');
  assert.equal(idx.get('3#2')?.field_a, 'SH-r2');
  // 若 row_index 是跨机构全局累加（旧缺陷），上海的行会落在 3#3/3#4，此处应取不到
  assert.equal(idx.get('3#3'), undefined);
});

test('buildMatrixRowIndex: 同名机构（不同 company_id）不会互相串数据', () => {
  const detailRows = [
    { company_id: 10, company_name: '分公司', row_index: 1, field_a: '甲' },
    { company_id: 20, company_name: '分公司', row_index: 1, field_a: '乙' },
  ];
  const idx = buildMatrixRowIndex(detailRows);
  assert.equal(idx.get('10#1')?.field_a, '甲');
  assert.equal(idx.get('20#1')?.field_a, '乙');
});

test('buildMatrixRowIndex: 入参为 undefined 时返回空索引', () => {
  assert.equal(buildMatrixRowIndex(undefined).size, 0);
});

// --- 组合场景：交叉表单元格取值（复现汇总页/导出的取值路径） ---

test('组合：matrixGroups + matrixRowIndex 可逐机构逐行取到交叉表单元格值', () => {
  const fields = [
    matrixField('field_bj', '北京', matrixConfig('产品/区域', ['电脑', '家电'])),
    matrixField('field_tj', '天津', matrixConfig('产品/区域', ['电脑', '家电'])),
  ];
  const detailRows = [
    { company_id: 2, row_index: 1, field_bj: 'BJ-r1-bj', field_tj: 'BJ-r1-tj' },
    { company_id: 2, row_index: 2, field_bj: 'BJ-r2-bj', field_tj: 'BJ-r2-tj' },
    { company_id: 3, row_index: 1, field_bj: 'SH-r1-bj', field_tj: 'SH-r1-tj' },
  ];
  const groups = buildMatrixGroups(fields);
  const idx = buildMatrixRowIndex(detailRows);
  const group = groups[0];

  // 页面/导出取值路径：company_id + (rowIdx + 1) → detRow[col.field_name]
  const cell = (companyId: number, rowIdx: number, colFieldName: string) =>
    idx.get(`${companyId}#${rowIdx + 1}`)?.[colFieldName];

  assert.equal(cell(2, 0, 'field_bj'), 'BJ-r1-bj');
  assert.equal(cell(2, 1, 'field_tj'), 'BJ-r2-tj');
  assert.equal(cell(3, 0, 'field_tj'), 'SH-r1-tj');
  // 上海无第 2 行 → 取不到值（页面显示 —）
  assert.equal(cell(3, 1, 'field_bj'), undefined);
  assert.equal(group.rowOptions.length, 2);
});
