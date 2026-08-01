import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { buildSuggestedQuestions } from '../src/utils/aiQuery';
import { buildSubmissionSheets, SubmissionExportInput } from '../src/utils/reportExport';
import type { ReportAssignment, ReportTemplateField } from '../src/types';

const serverRoot = new URL('../server-springboot/src/main/', import.meta.url);
const read = (relative: string) => fs.readFileSync(new URL(relative, serverRoot), 'utf8');

const analyzer = read('java/com/freereport/service/AiOperationAnalyzer.java');
const service = read('java/com/freereport/service/AiQueryService.java');
const mapperIface = read('java/com/freereport/mapper/AssignmentMapper.java');
const mapperXml = read('resources/mapper/AssignmentMapper.xml');

// ---- 后端：运营统计（各部门下发情况 / 各机构填报情况）----

test('运营统计走独立 Mapper 查询，组件不直接拼装 SQL', () => {
  assert.match(mapperIface, /statsByIssuerDepartment\(/);
  assert.match(mapperIface, /statsByAssignedCompany\(/);
  assert.match(mapperXml, /id="statsByIssuerDepartment"/);
  assert.match(mapperXml, /id="statsByAssignedCompany"/);
  assert.doesNotMatch(analyzer, /\bselect\s+.*\bfrom\b/i, 'AiOperationAnalyzer 不应直接拼装 SQL');
});

test('运营统计数据范围与 findForUser 权限口径一致（超管与数智化办公室看全量/部门管理员/本机构）', () => {
  for (const block of ['statsByIssuerDepartment', 'statsByAssignedCompany']) {
    const start = mapperXml.indexOf(`id="${block}"`);
    const end = mapperXml.indexOf('</select>', start);
    const sql = mapperXml.slice(start, end);
    // 数智化转型办公室是总部级角色，assigned_to_company_id 过滤会看不到任何任务，必须与超管共用全量分支
    assert.match(sql, /role == 'super_admin' or role == 'digital_admin'/, `${block} 缺超管与数智化办公室全量分支`);
    assert.match(sql, /role == 'department_report_admin'/, `${block} 缺部门管理员分支`);
    assert.match(sql, /a\.issuer_department_id = #\{companyId\}/, `${block} 部门管理员应按下发部门过滤`);
    assert.match(sql, /a\.assigned_to_company_id = #\{companyId\}/, `${block} 其余角色应按本机构过滤`);
  }
});

test('填报情况统计排除已撤回任务，完成率口径为已签收含已汇总', () => {
  const start = mapperXml.indexOf('id="statsByAssignedCompany"');
  const end = mapperXml.indexOf('</select>', start);
  const sql = mapperXml.slice(start, end);
  assert.match(sql, /a\.status != 'recalled'/, '已撤回任务不应计入填报统计');
  assert.match(sql, /a\.status IN \('received', 'aggregated'\)/, '已签收口径应含已汇总');
  assert.match(analyzer, /percent\(/, '完成率应在组件内计算');
});

test('AiQueryService 在 LLM 计划之前前置运营统计规则识别', () => {
  assert.match(service, /operationAnalyzer\.answerIfMatched\(question, user\)/);
  const statsPos = service.indexOf('answerIfMatched(question, user)');
  const llmPos = service.indexOf('aiClient.chat(');
  assert.ok(statsPos > -1 && llmPos > -1 && statsPos < llmPos, '规则识别应先于 LLM 计划阶段');
});

test('运营统计意图规则覆盖目标说法且不误伤数值指标问数', () => {
  // 下发类：「下发」+ 部门/情况/完成/进度；填报类：填报/提交/上报 + 情况/进度/完成
  assert.match(analyzer, /下发/);
  assert.match(analyzer, /填报情况/);
  assert.match(analyzer, /填报进度/);
  // 「完成情况」只在不含下发词时才算填报意图（「总部部门下发完成情况」说的是下发）
  assert.match(analyzer, /!hasIssueWord && text\.contains\("完成情况"\)/);
  // 复合问句（如「总部部门下发及分公司填报情况」）按先出现的意图作答，并引导追问另一维度
  assert.match(analyzer, /issueIntentIndex/);
  assert.match(analyzer, /fillIntentIndex/);
  assert.match(analyzer, /withFollowUp/);
});

test('状态分桶覆盖 assignment 全部状态枚举，桶和等于任务总数', () => {
  for (const block of ['statsByIssuerDepartment', 'statsByAssignedCompany']) {
    const start = mapperXml.indexOf(`id="${block}"`);
    const end = mapperXml.indexOf('</select>', start);
    const sql = mapperXml.slice(start, end);
    // 填报中桶必须含 pending（新下发任务的默认状态），否则新任务在统计中凭空消失
    assert.match(sql, /IN \('pending', 'filling'\)/, `${block} 填报中桶缺 pending`);
    assert.match(sql, /IN \('pending_receipt', 'approved'\)/, `${block} 待签收桶缺 approved`);
    assert.match(sql, /IN \('received', 'aggregated'\)/, `${block} 已签收桶缺 aggregated`);
    assert.match(sql, /IN \('rejected', 'returned'\)/, `${block} 已退回桶缺 returned`);
  }
});

// ---- 前端：问数建议问题引导 ----

test('问数建议问题包含两条运营统计固定引导', () => {
  const questions = buildSuggestedQuestions([], {});
  assert.ok(questions.includes('各部门下发报表的情况'));
  assert.ok(questions.includes('各分公司填报情况分析'));
  // 有模板时固定引导排在模板问题之后，总数不超过 6 条
  const withTemplate = buildSuggestedQuestions(
    [{ id: 1, name: '收入月报', status: 'published' } as any],
    { 1: ['2026年07月'] },
  );
  assert.ok(withTemplate.length <= 6);
  assert.equal(withTemplate[withTemplate.length - 2], '各部门下发报表的情况');
  assert.equal(withTemplate[withTemplate.length - 1], '各分公司填报情况分析');
});

// ---- 前端：填报页已填报数据导出 ----

test('填报页接入导出能力（按钮 + 导出工具）', () => {
  const page = fs.readFileSync(new URL('../src/pages/ReportFill.tsx', import.meta.url), 'utf8');
  assert.match(page, /exportSubmissionToExcel/);
  assert.match(page, /导出数据/);
  const exporter = fs.readFileSync(new URL('../src/utils/reportExport.ts', import.meta.url), 'utf8');
  assert.match(exporter, /await import\('xlsx'\)/, 'xlsx 应动态加载避免增加首屏体积');
});

const field = (id: number, label: string, dataType: string): ReportTemplateField => ({
  id,
  template_id: 1,
  field_name: `f${id}`,
  field_label: label,
  field_type: 'text',
  data_type: dataType,
  field_config: {},
  sort_order: id,
  status: 'active',
} as ReportTemplateField);

const assignment = { id: 1, title: '7月收入月报', template_name: '收入月报', period_label: '2026年07月', deadline: '2026-08-05' } as ReportAssignment;

const baseInput: SubmissionExportInput = {
  assignment,
  summaryFields: [field(1, '总收入', 'summary'), field(2, '净利润', 'summary')],
  detailFields: [field(3, '客户名称', 'detail'), field(4, '金额', 'detail')],
  matrixGroups: [{
    rowLabel: '品牌',
    rowOptions: ['丰田', '奥迪'],
    columns: [field(5, '数量', 'matrix'), field(6, '单价', 'matrix')],
  }],
  summaryForm: { 1: '1200', 2: '300' },
  detailRows: [
    { 3: '客户A', 4: '100' },
    { 3: '客户B', 4: '200' },
    {},
  ],
  submission: { version: 2, status: 'received', comment: '已复核' } as any,
};

test('导出工作表结构：填报信息 + 汇总指标 + 明细数据 + 交叉表', () => {
  const sheets = buildSubmissionSheets(baseInput);
  assert.deepEqual(sheets.map((s) => s.name), ['填报信息', '汇总指标', '明细数据', '交叉表']);

  const info = sheets[0].aoa;
  assert.ok(info.some((r) => r[0] === '任务标题' && r[1] === '7月收入月报'));
  assert.ok(info.some((r) => r[0] === '填报状态' && r[1] === '发起部门已签收'));
  assert.ok(info.some((r) => r[0] === '数据版本' && r[1] === 'v2'));
  assert.ok(info.some((r) => r[0] === '填报备注' && r[1] === '已复核'));

  assert.deepEqual(sheets[1].aoa, [['字段', '填报值'], ['总收入', '1200'], ['净利润', '300']]);

  const detail = sheets[2].aoa;
  assert.deepEqual(detail[0], ['客户名称', '金额']);
  assert.equal(detail.length, 3, '全空明细行不应导出');
  assert.deepEqual(detail[1], ['客户A', '100']);

  const matrix = sheets[3].aoa;
  assert.deepEqual(matrix[0], ['品牌', '数量', '单价']);
  assert.equal(matrix.length, 3, '交叉表每个行标签一行');
  assert.deepEqual(matrix[1], ['丰田', '', ''], '未填的矩阵单元格导出为空串');
});

test('无明细与交叉表时只导出填报信息与汇总指标', () => {
  const sheets = buildSubmissionSheets({
    ...baseInput,
    detailFields: [],
    matrixGroups: [],
    detailRows: [],
    submission: null,
  });
  assert.deepEqual(sheets.map((s) => s.name), ['填报信息', '汇总指标']);
  // 未提交时状态回退为草稿视图，且无版本行
  const info = sheets[0].aoa;
  assert.ok(info.some((r) => r[0] === '填报状态' && r[1] === '草稿保存中'));
  assert.ok(!info.some((r) => r[0] === '数据版本'));
});
