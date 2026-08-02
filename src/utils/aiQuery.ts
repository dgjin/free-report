import type { ReportTemplate } from '../types';

/** 后端返回的图表系列 */
export interface AiChartSeries {
  name: string;
  data: number[];
}

/** 后端返回的图表定义 */
export interface AiChart {
  type: 'bar' | 'line' | 'pie' | 'table';
  title: string;
  categories: string[];
  series: AiChartSeries[];
}

/** 后端返回的表格定义 */
export interface AiTable {
  columns: string[];
  rows: string[][];
}

/** 智能问数解析后的查询计划（回显给用户，便于确认口径） */
export interface AiQueryPlan {
  template_id: number;
  template_name: string;
  period_labels: string[];
  metrics: Array<{ field_name: string; field_label: string }>;
  dimension: 'company' | 'period' | 'field';
  chart_type: AiChart['type'];
  aggregation?: 'sum' | 'avg' | 'max' | 'min';
  company_names?: string[];
  group_by_field?: string;
  group_by_field_label?: string;
}

export interface AiQueryResponse {
  answer: string;
  plan: AiQueryPlan | null;
  chart: AiChart | null;
  table: AiTable | null;
  scope_note: string | null;
}

/** 会话消息：用户提问 / AI 回复 / 错误提示 */
export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  response?: AiQueryResponse;
  /** 流式问数中的阶段性状态文本（如"正在理解您的问题..."），完成后清空 */
  statusText?: string;
}

export const AI_QUESTION_MAX_LENGTH = 500;

/** recharts 需要的行式数据：每个分类一行，系列名作为列 */
export type ChartDatum = Record<string, string | number>;

/**
 * 把后端 {categories, series} 列式结构转为 recharts 行式数据。
 * 系列长度短于分类数时按 0 补齐，避免图表因缺值断裂。
 */
export function normalizeChartData(chart: AiChart | null | undefined): ChartDatum[] {
  if (!chart || !Array.isArray(chart.categories) || chart.categories.length === 0) {
    return [];
  }
  const series = Array.isArray(chart.series) ? chart.series : [];
  return chart.categories.map((category, idx) => {
    const datum: ChartDatum = { category };
    series.forEach((s) => {
      const value = Array.isArray(s.data) ? s.data[idx] : undefined;
      datum[s.name] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    });
    return datum;
  });
}

/** 系列名列表（用作 recharts 的 dataKey），空系列返回空数组 */
export function getChartSeriesNames(chart: AiChart | null | undefined): string[] {
  if (!chart || !Array.isArray(chart.series)) return [];
  return chart.series.filter((s) => s && s.name).map((s) => s.name);
}

/** 是否具备渲染图表的条件：非 table 类型且有分类与系列 */
export function shouldRenderChart(chart: AiChart | null | undefined): boolean {
  if (!chart || chart.type === 'table') return false;
  return chart.categories?.length > 0 && getChartSeriesNames(chart).length > 0;
}

/**
 * 建议问题：基于可见模板生成，引导用户用系统认得的说法提问。
 * 另附两条运营统计固定引导（各部门下发情况 / 各机构填报情况），
 * 这两类问题由后端规则识别直接作答，不依赖具体模板。
 */
export function buildSuggestedQuestions(
  templates: ReportTemplate[] | undefined,
  periodLabels?: Record<number, string[]>
): string[] {
  const published = (templates || []).filter((t) => t.status === 'published');
  const questions: string[] = [];
  published.slice(0, 3).forEach((t) => {
    const period = periodLabels?.[t.id]?.[0];
    questions.push(period
      ? `${period}「${t.name}」各机构的数据对比`
      : `「${t.name}」最新一期各机构的数据对比`);
  });
  if (published.length > 0) {
    questions.push(`「${published[0].name}」近几期的趋势变化`);
  }
  // 运营统计类固定引导：不依赖模板指标，规则识别口径稳定
  questions.push('各部门下发报表的情况');
  questions.push('各分公司填报情况分析');
  return questions.slice(0, 6);
}

/** 提问校验：空、纯空白、超长均拦在前端，减少无效请求 */
export function validateQuestion(text: string | null | undefined): { valid: boolean; error?: string } {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { valid: false, error: '请输入要查询的问题' };
  }
  if (trimmed.length > AI_QUESTION_MAX_LENGTH) {
    return { valid: false, error: `问题长度不能超过 ${AI_QUESTION_MAX_LENGTH} 字` };
  }
  return { valid: true };
}

/** 把一次成功查询的口径压成一行文本，随历史发给模型，让「那上个季度呢」这类追问有据可依 */
export function formatPlanContext(plan: AiQueryPlan | null | undefined): string {
  if (!plan) return '';
  const parts = [
    `报表=${plan.template_name}`,
    `周期=${plan.period_labels.join('、')}`,
    `指标=${plan.metrics.map((m) => m.field_label).join('、')}`,
    `维度=${plan.dimension === 'period' ? '周期趋势' : plan.dimension === 'field' ? `按${plan.group_by_field_label || plan.group_by_field}分组` : '机构对比'}`,
  ];
  if (plan.aggregation && plan.aggregation !== 'sum') {
    parts.push(`聚合=${plan.aggregation}`);
  }
  if (plan.company_names && plan.company_names.length > 0) {
    parts.push(`机构=${plan.company_names.join('、')}`);
  }
  return `[上一轮查询口径 ${parts.join(' ')}]`;
}

/**
 * 生成随请求发送的历史上下文：仅保留成功的问答文本，最多 3 轮（6 条消息）。
 * 错误消息不入上下文，避免污染模型判断。
 * 成功回答会把查询口径前置到内容里（后端截断保留开头），保证追问时模型知道上一轮查的是什么。
 */
export function buildRequestHistory(messages: AiMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  const usable = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const planContext = m.role === 'assistant' ? formatPlanContext(m.response?.plan) : '';
      return {
        role: m.role as 'user' | 'assistant',
        content: planContext ? `${planContext}\n${m.content}` : m.content,
      };
    });
  return usable.slice(-6);
}
