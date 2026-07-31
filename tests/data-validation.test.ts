import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseFieldConfig,
  validateFieldValue,
  validateSubmission,
} from '../src/utils/dataValidation';
import type { DataType, FieldConfig, FieldType, ReportTemplateField } from '../src/types';
import type { MatrixGroup } from '../src/utils/aggregationView';

// --- fixtures ---

function field(
  id: number,
  field_label: string,
  field_type: FieldType,
  data_type: DataType,
  config: FieldConfig = {},
): ReportTemplateField {
  return {
    id,
    template_id: 1,
    field_name: `f${id}`,
    field_label,
    field_type,
    data_type,
    field_config: config,
    sort_order: id,
    status: 'active',
  };
}

// --- parseFieldConfig ---

test('parseFieldConfig: string 则 try-parse，非法 JSON 视为无配置', () => {
  assert.deepEqual(parseFieldConfig(field(1, 'a', 'text', 'summary', { required: true })), {
    required: true,
  });
  assert.deepEqual(
    parseFieldConfig({ ...field(1, 'a', 'text', 'summary'), field_config: '{"min":3}' }),
    { min: 3 },
  );
  assert.deepEqual(
    parseFieldConfig({ ...field(1, 'a', 'text', 'summary'), field_config: '{oops' }),
    {},
  );
});

// --- validateFieldValue（单值校验） ---

test('validateFieldValue: 空值视为合法（必填由调用方判断）', () => {
  assert.equal(validateFieldValue(field(1, '营收', 'number', 'summary'), '', { required: true }), null);
  assert.equal(validateFieldValue(field(1, '日期', 'date', 'summary'), '  ', {}), null);
});

test('validateFieldValue: number 非数字报错，text/textarea 不限', () => {
  assert.match(validateFieldValue(field(1, '营收', 'number', 'summary'), 'abc', {})!, /「营收」值「abc」不是有效数字/);
  assert.equal(validateFieldValue(field(1, '备注', 'text', 'summary'), 'abc', {}), null);
  assert.equal(validateFieldValue(field(1, '说明', 'textarea', 'summary'), '任意%内容', {}), null);
});

test('validateFieldValue: min/max 临界值本身合法，越界报错', () => {
  const f = field(1, '营收', 'number', 'summary');
  assert.equal(validateFieldValue(f, '0', { min: 0, max: 100 }), null);
  assert.equal(validateFieldValue(f, '100', { min: 0, max: 100 }), null);
  assert.match(validateFieldValue(f, '-0.1', { min: 0 })!, /小于最小值 0/);
  assert.match(validateFieldValue(f, '100.1', { max: 100 })!, /大于最大值 100/);
});

test('validateFieldValue: date 须为合法的 YYYY-MM-DD', () => {
  const f = field(1, '购置日期', 'date', 'summary');
  assert.equal(validateFieldValue(f, '2024-06-30', {}), null);
  assert.match(validateFieldValue(f, '2024/06/30', {})!, /不是有效日期/);
  assert.match(validateFieldValue(f, '2024-13-40', {})!, /不是有效日期/);
});

test('validateFieldValue: select 值须精确命中选项（大小写不匹配报错）', () => {
  const f = field(1, '类别', 'select', 'summary');
  assert.equal(validateFieldValue(f, 'ABC', { options: ['ABC', 'DEF'] }), null);
  assert.match(validateFieldValue(f, 'abc', { options: ['ABC', 'DEF'] })!, /不在可选项内/);
  // 未配置选项时不校验
  assert.equal(validateFieldValue(f, '任意值', {}), null);
});

// --- validateSubmission（整单校验） ---

test('validateSubmission: 必填汇总字段缺失报错', () => {
  const fields = [
    field(10, '营收', 'number', 'summary', { required: true }),
    field(11, '备注', 'text', 'summary'),
  ];
  const issues = validateSubmission(fields, { '11': 'x' }, []);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].scope, 'summary');
  assert.equal(issues[0].field_id, 10);
  assert.match(issues[0].message, /「营收」为必填项/);
});

test('validateSubmission: 明细空行跳过，非空行检查必填与单值并带行号', () => {
  const fields = [
    field(20, '产品名称', 'text', 'detail', { required: true }),
    field(21, '销售额', 'number', 'detail'),
  ];
  const issues = validateSubmission(fields, {}, [
    {}, // 空占位行跳过
    { '20': '', '21': '' }, // 全空串行跳过
    { '21': '300' }, // 非空行缺必填
    { '20': '空调', '21': 'abc' }, // 类型错误
  ]);
  assert.equal(issues.length, 2);
  assert.match(issues[0].message, /明细第 3 行：「产品名称」为必填项/);
  assert.equal(issues[0].row, 3);
  assert.match(issues[1].message, /明细第 4 行：.*不是有效数字/);
});

test('validateSubmission: 交叉表仅校验已填单元格并按行选项定位，不做必填', () => {
  const matrixCol = field(55, '一季度销量', 'number', 'matrix');
  const groups: MatrixGroup[] = [
    { rowLabel: '产品', rowOptions: ['电脑', '手机'], columns: [matrixCol] },
  ];
  const issues = validateSubmission([matrixCol], {}, [{ '55': 'abc' }, {}], groups);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].scope, 'matrix');
  assert.equal(issues[0].row, 0);
  assert.match(issues[0].message, /交叉表 产品-电脑：.*不是有效数字/);
});

test('validateSubmission: sum_of 容差内通过，超差报错', () => {
  const fields = [
    field(30, '甲', 'number', 'summary'),
    field(31, '乙', 'number', 'summary'),
    field(32, '总计', 'number', 'summary', { validation: { sum_of: [30, 31] } }),
  ];
  // 100.004 vs 60+40=100：差 0.004 在容差 0.005 内
  assert.equal(
    validateSubmission(fields, { '30': '60', '31': '40', '32': '100.004' }, []).length,
    0,
  );
  const issues = validateSubmission(fields, { '30': '60', '31': '40', '32': '90' }, []);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].scope, 'cross');
  assert.match(issues[0].message, /「总计」\(90\) 应等于 甲\+乙 之和 \(100\)/);
});

test('validateSubmission: detail_sum_of 等于明细数字列合计', () => {
  const fields = [
    field(40, '销售额合计', 'number', 'summary', { validation: { detail_sum_of: 41 } }),
    field(41, '销售额', 'number', 'detail'),
  ];
  const details = [{ '41': '100' }, { '41': '200' }];
  assert.equal(validateSubmission(fields, { '40': '300' }, details).length, 0);
  const issues = validateSubmission(fields, { '40': '250' }, details);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /「销售额合计」\(250\) 应等于「销售额」列合计 \(300\)/);
});

test('validateSubmission: 跨字段规则引用失效字段时防御式忽略', () => {
  const fields = [
    field(50, '总计A', 'number', 'summary', { validation: { sum_of: [999] } }),
    field(51, '总计B', 'number', 'summary', { validation: { detail_sum_of: 888 } }),
  ];
  assert.equal(validateSubmission(fields, { '50': '10', '51': '20' }, []).length, 0);
});

test('validateSubmission: 跨字段规则自身空值/非法值不重复报跨字段错误', () => {
  const fields = [
    field(60, '甲', 'number', 'summary'),
    field(61, '总计', 'number', 'summary', { validation: { sum_of: [60] } }),
  ];
  // 总计留空：仅无必填时无错误；非法值仅报基础校验错误
  assert.equal(validateSubmission(fields, { '60': '10' }, []).length, 0);
  const issues = validateSubmission(fields, { '60': '10', '61': 'xx' }, []);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].scope, 'summary');
  assert.match(issues[0].message, /不是有效数字/);
});
