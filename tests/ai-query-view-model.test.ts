import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_QUESTION_MAX_LENGTH,
  buildRequestHistory,
  buildSuggestedQuestions,
  formatPlanContext,
  getChartSeriesNames,
  normalizeChartData,
  shouldRenderChart,
  validateQuestion,
} from '../src/utils/aiQuery';
import type { AiChart, AiMessage } from '../src/utils/aiQuery';
import type { ReportTemplate } from '../src/types';

// --- fixtures ---

function chart(partial: Partial<AiChart> = {}): AiChart {
  return {
    type: 'bar',
    title: '各机构合计',
    categories: ['北京', '上海', '广州'],
    series: [{ name: '营业收入', data: [100, 200, 300] }],
    ...partial,
  };
}

function template(id: number, name: string, status: ReportTemplate['status'] = 'published'): ReportTemplate {
  return {
    id,
    name,
    description: '',
    status,
    created_by: 1,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
  } as ReportTemplate;
}

// --- normalizeChartData ---

test('normalizeChartData: 列式结构转为 recharts 行式数据', () => {
  assert.deepEqual(normalizeChartData(chart()), [
    { category: '北京', 营业收入: 100 },
    { category: '上海', 营业收入: 200 },
    { category: '广州', 营业收入: 300 },
  ]);
});

test('normalizeChartData: 多系列并列，缺值与非有限值补 0', () => {
  const data = normalizeChartData(
    chart({
      series: [
        { name: '营业收入', data: [10] },
        { name: '净利润', data: [1, Number.NaN, 3] },
      ],
    }),
  );
  assert.deepEqual(data, [
    { category: '北京', 营业收入: 10, 净利润: 1 },
    { category: '上海', 营业收入: 0, 净利润: 0 },
    { category: '广州', 营业收入: 0, 净利润: 3 },
  ]);
});

test('normalizeChartData: 无图表/无分类返回空数组，空系列只留分类列', () => {
  assert.deepEqual(normalizeChartData(null), []);
  assert.deepEqual(normalizeChartData(chart({ categories: [] })), []);
  assert.deepEqual(normalizeChartData(chart({ series: [] })), [
    { category: '北京' },
    { category: '上海' },
    { category: '广州' },
  ]);
});

test('normalizeChartData: 折线与饼图沿用同一归一化结构', () => {
  const line = normalizeChartData(chart({ type: 'line', categories: ['2026年06月', '2026年07月'], series: [{ name: '合计', data: [5, 8] }] }));
  assert.deepEqual(line, [
    { category: '2026年06月', 合计: 5 },
    { category: '2026年07月', 合计: 8 },
  ]);
  const pie = normalizeChartData(chart({ type: 'pie' }));
  assert.equal(pie.length, 3);
  assert.equal(pie[2].营业收入, 300);
});

// --- getChartSeriesNames / shouldRenderChart ---

test('getChartSeriesNames: 过滤无名系列', () => {
  assert.deepEqual(getChartSeriesNames(chart()), ['营业收入']);
  assert.deepEqual(
    getChartSeriesNames(chart({ series: [{ name: '', data: [1] }, { name: '净利润', data: [2] }] })),
    ['净利润'],
  );
  assert.deepEqual(getChartSeriesNames(undefined), []);
});

test('shouldRenderChart: table 类型或数据为空时不渲染图表', () => {
  assert.equal(shouldRenderChart(chart()), true);
  assert.equal(shouldRenderChart(chart({ type: 'table' })), false);
  assert.equal(shouldRenderChart(chart({ categories: [] })), false);
  assert.equal(shouldRenderChart(chart({ series: [] })), false);
  assert.equal(shouldRenderChart(null), false);
});

// --- buildSuggestedQuestions ---

test('buildSuggestedQuestions: 只用已发布模板，带周期时拼入周期', () => {
  const questions = buildSuggestedQuestions(
    [template(1, '经营月报'), template(2, '风险季报'), template(3, '草稿表', 'draft')],
    { 1: ['2026年07月', '2026年06月'] },
  );
  assert.ok(questions.includes('2026年07月「经营月报」各机构的数据对比'));
  assert.ok(questions.includes('「风险季报」最新一期各机构的数据对比'));
  assert.ok(questions.every((q) => !q.includes('草稿表')));
  assert.ok(questions.some((q) => q.includes('趋势变化')));
});

test('buildSuggestedQuestions: 最多 4 条，无模板返回空', () => {
  const many = buildSuggestedQuestions([1, 2, 3, 4, 5].map((i) => template(i, `报表${i}`)));
  assert.equal(many.length, 4);
  assert.deepEqual(buildSuggestedQuestions([]), []);
  assert.deepEqual(buildSuggestedQuestions(undefined), []);
});

// --- validateQuestion ---

test('validateQuestion: 空、纯空白被拦下', () => {
  assert.deepEqual(validateQuestion(''), { valid: false, error: '请输入要查询的问题' });
  assert.deepEqual(validateQuestion('   '), { valid: false, error: '请输入要查询的问题' });
  assert.deepEqual(validateQuestion(null), { valid: false, error: '请输入要查询的问题' });
});

test('validateQuestion: 超长按 500 字上限拦下，边界值放行', () => {
  assert.equal(AI_QUESTION_MAX_LENGTH, 500);
  assert.deepEqual(validateQuestion('问'.repeat(500)), { valid: true });
  assert.deepEqual(validateQuestion('问'.repeat(501)), {
    valid: false,
    error: '问题长度不能超过 500 字',
  });
});

// --- buildRequestHistory ---

test('buildRequestHistory: 剔除错误消息并只保留最近 3 轮', () => {
  const messages: AiMessage[] = [];
  for (let i = 1; i <= 4; i += 1) {
    messages.push({ id: `u${i}`, role: 'user', content: `问题${i}` });
    messages.push({ id: `a${i}`, role: 'assistant', content: `回答${i}` });
  }
  messages.push({ id: 'e1', role: 'error', content: 'AI 服务暂时不可用' });

  const history = buildRequestHistory(messages);
  assert.equal(history.length, 6);
  assert.deepEqual(history[0], { role: 'user', content: '问题2' });
  assert.deepEqual(history[5], { role: 'assistant', content: '回答4' });
  assert.ok(history.every((h) => h.role === 'user' || h.role === 'assistant'));
});

test('buildRequestHistory: 成功回答会把上一轮查询口径前置到内容里', () => {
  const messages: AiMessage[] = [
    { id: 'u1', role: 'user', content: '2026年Q3各分公司公务车数量' },
    {
      id: 'a1',
      role: 'assistant',
      content: '北京 2 台，上海 1 台。',
      response: {
        answer: '北京 2 台，上海 1 台。',
        plan: {
          template_id: 10,
          template_name: '公务车管理台账',
          period_labels: ['2026年Q3'],
          metrics: [{ field_name: '_record_count', field_label: '记录数' }],
          dimension: 'company',
          chart_type: 'bar',
          aggregation: 'sum',
          company_names: [],
        },
        chart: null,
        table: null,
        scope_note: null,
      },
    },
  ];

  const history = buildRequestHistory(messages);
  assert.equal(history.length, 2);
  assert.equal(history[0].content, '2026年Q3各分公司公务车数量');
  assert.ok(history[1].content.startsWith('[上一轮查询口径'), '口径应前置，防止后端截断丢失');
  assert.match(history[1].content, /公务车管理台账/);
  assert.match(history[1].content, /2026年Q3/);
  assert.match(history[1].content, /记录数/);
  assert.ok(history[1].content.endsWith('北京 2 台，上海 1 台。'));
});

test('formatPlanContext: 默认聚合与空机构不输出，非默认口径完整输出', () => {
  assert.equal(formatPlanContext(null), '');
  const context = formatPlanContext({
    template_id: 10,
    template_name: '公务车管理台账',
    period_labels: ['2026年Q3'],
    metrics: [{ field_name: 'bare_price', field_label: '裸车价' }],
    dimension: 'period',
    chart_type: 'line',
    aggregation: 'avg',
    company_names: ['北京分公司'],
  });
  assert.match(context, /聚合=avg/);
  assert.match(context, /机构=北京分公司/);
  assert.match(context, /维度=周期趋势/);
});
