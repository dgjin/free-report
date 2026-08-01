import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const serverRoot = new URL('../server-springboot/src/main/', import.meta.url);
const read = (relative: string) => fs.readFileSync(new URL(relative, serverRoot), 'utf8');

const controller = read('java/com/freereport/controller/AiQueryController.java');
// 智能问数已按职责拆分：AiQueryService 只留编排，上下文/计划/结果/审计由协作组件承担
const service = read('java/com/freereport/service/AiQueryService.java');
const contextBuilder = read('java/com/freereport/service/AiQueryContextBuilder.java');
const planResolver = read('java/com/freereport/service/AiPlanResolver.java');
const resultBuilder = read('java/com/freereport/service/AiResultBuilder.java');
const auditor = read('java/com/freereport/service/AiQueryAuditor.java');
const periodData = read('java/com/freereport/service/AiPeriodData.java');
const aggEnum = read('java/com/freereport/service/AiAgg.java');
const client = read('java/com/freereport/service/AiClient.java');
const properties = read('java/com/freereport/config/AiProperties.java');
const request = read('java/com/freereport/dto/AiQueryRequest.java');
const applicationYml = read('resources/application.yml');

test('AiQueryController 暴露 /api/ai/query 与 /api/ai/config 两个端点', () => {
  assert.match(controller, /@RequestMapping\("\/api\/ai"\)/);
  assert.match(controller, /@PostMapping\("\/query"\)/);
  assert.match(controller, /@GetMapping\("\/config"\)/);
  assert.match(controller, /@Valid\s+@RequestBody\s+AiQueryRequest/);
});

test('AiQueryController 仅放行超级管理员、数智化转型办公室与部门报表管理员，其余 403', () => {
  assert.match(controller, /isSuperAdmin\(\)/);
  assert.match(controller, /isDigitalAdmin\(\)/);
  assert.match(controller, /isDepartmentReportAdmin\(\)/);
  assert.match(controller, /throw new DomainException\([^)]*403\)/s);
});

test('AiQueryService 通过聚合引擎取数，不绕过权限校验', () => {
  // 多周期取数走批量接口（一次调用替代逐周期 N+1），权限校验仍在聚合引擎内部
  assert.match(service, /aggregationService\.getAggregationsByTemplateAndPeriods\(/);
  const components: Record<string, string> = { service, contextBuilder, planResolver, resultBuilder, auditor };
  for (const [name, src] of Object.entries(components)) {
    assert.doesNotMatch(src, /\bselect\s+.*\bfrom\b/i, `${name} 不应直接拼装 SQL`);
  }
  // 模板可见范围来自现有的按用户过滤查询
  assert.match(contextBuilder, /templateMapper\.findForUser\(/);
});

test('AiQueryService 对查询计划做合法性校验并限制规模', () => {
  // 周期数量上限，防止一次问数打爆聚合与 token
  assert.match(planResolver, /MAX_PERIODS\s*=\s*\d+/);
  assert.match(planResolver, /MAX_METRICS\s*=\s*\d+/);
  // LLM 返回非纯 JSON 时的兜底解析
  assert.match(planResolver, /parseJsonLoose/);
  assert.match(planResolver, /unanswerable_reason/);
});

test('AiQueryService 返回 answer/plan/chart/table/scope_note 契约字段', () => {
  for (const key of ['answer', 'plan', 'chart', 'table', 'scope_note']) {
    assert.match(service, new RegExp(`"${key}"`), `缺少返回字段 ${key}`);
  }
  assert.match(resultBuilder, /"categories"/);
  assert.match(resultBuilder, /"series"/);
  assert.match(resultBuilder, /"columns"/);
  assert.match(resultBuilder, /"rows"/);
});

test('AiQueryService 支持明细型台账问数（明细数值合计与记录数指标）', () => {
  // 纯明细台账（如公务车）无汇总字段，需提供明细逐行合计与记录数两类指标
  assert.match(contextBuilder, /RECORD_COUNT_FIELD/);
  assert.match(contextBuilder, /AiMetric\.Source\.DETAIL/);
  assert.match(contextBuilder, /AiMetric\.Source\.ROW_COUNT/);
  assert.match(periodData, /"detail_rows"/);
  assert.match(periodData, /"detail_summary"/);
  // 车牌号、发动机号等标识类数值字段默认不作为求和指标
  assert.match(contextBuilder, /looksLikeIdentifier/);
});

test('AiQueryService 上下文组装批量取周期，不做逐模板 N+1 查询', () => {
  assert.match(contextBuilder, /findPeriodLabelsByTemplateIds/);
  assert.doesNotMatch(contextBuilder, /assignmentMapper\.findByTemplateId\(/, '不应在循环里逐模板查周期');
  const mapper = fs.readFileSync(
    new URL('../server-springboot/src/main/resources/mapper/AssignmentMapper.xml', import.meta.url), 'utf8');
  assert.match(mapper, /findPeriodLabelsByTemplateIds/);
});

test('AiQueryService 具备审计日志与单用户并发限制', () => {
  assert.match(auditor, /AI_QUERY_AUDIT/);
  assert.match(auditor, /inFlightUsers/);
  assert.match(auditor, /throw new DomainException\([^)]*429\)/s, '并发冲突应返回 429');
});

test('AiQueryService 支持聚合方式与机构筛选', () => {
  assert.match(aggEnum, /enum AiAgg/);
  for (const agg of ['SUM', 'AVG', 'MAX', 'MIN']) {
    assert.match(aggEnum, new RegExp(`\\b${agg}\\b`), `缺少聚合方式 ${agg}`);
  }
  assert.match(planResolver, /"aggregation"/);
  assert.match(planResolver, /"company_names"/);
  assert.match(resultBuilder, /matchesCompany/);
});

test('数字带千分位且喂给模型的表格不再用逗号分隔', () => {
  assert.match(resultBuilder, /%,d|%,\.2f/, 'formatNumber 应输出千分位');
  assert.match(resultBuilder, /String\.join\(" \| "/, 'tableToText 应改用竖线分隔');
});

test('AiClient 走 OpenAI 兼容协议且不引入额外 HTTP 依赖', () => {
  assert.match(client, /java\.net\.http\.HttpClient/);
  assert.match(client, /chat\/completions/);
  assert.match(client, /response_format/);
  assert.match(client, /Bearer/);
  const pom = fs.readFileSync(new URL('../server-springboot/pom.xml', import.meta.url), 'utf8');
  assert.doesNotMatch(pom, /okhttp|httpclient5|feign/i, '不应为智能问数新增 HTTP 客户端依赖');
});

test('AiProperties 与 application.yml 保持可配置的 ai 配置节', () => {
  assert.match(properties, /@ConfigurationProperties\(prefix\s*=\s*"ai"\)/);
  assert.match(applicationYml, /^ai:/m);
  for (const key of ['enabled', 'base-url', 'api-key', 'model', 'timeout-seconds']) {
    assert.match(applicationYml, new RegExp(`^\\s{2}${key}:`, 'm'), `application.yml 缺少 ai.${key}`);
  }
  // 全部支持环境变量覆盖，便于生产 DeepSeek / 测试 Ollama 之间切换
  for (const env of ['AI_ENABLED', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_TIMEOUT']) {
    assert.match(applicationYml, new RegExp(`\\$\\{${env}`), `application.yml 缺少 ${env} 覆盖`);
  }
});

test('AiQueryRequest 校验问题非空且不超过 500 字', () => {
  assert.match(request, /@NotBlank/);
  assert.match(request, /@Size\(max\s*=\s*500/);
});

test('前端路由与菜单接入智能问数入口', () => {
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const layout = fs.readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
  assert.match(app, /path="ai-query"/);
  assert.match(app, /import\('\.\/pages\/AiQuery'\)/);
  const navItems = layout.match(/to="\/ai-query"/g) || [];
  assert.equal(navItems.length, 3, '部门报表管理员、数智化转型办公室与超级管理员菜单各应有一项智能问数');
  assert.match(api, /\/api\/ai\/query/);
  assert.match(api, /\/api\/ai\/config/);
});
