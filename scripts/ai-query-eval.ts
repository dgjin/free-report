/**
 * 智能问数 golden 评测脚本（手动运行，依赖真实后端与 LLM，不进 npm test）。
 *
 * 用法：
 *   1. 启动后端（3001）并配置好 AI_*；
 *   2. npx tsx scripts/ai-query-eval.ts [--base http://localhost:3001] [--user admin] [--pass 123456]
 *
 * 逐条发送 tests/ai-query-golden.json 中的问题，校验后端返回的查询计划是否符合期望，
 * 用于换模型 / 调 prompt 之后的行为回归验证。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

interface GoldenExpect {
  template_name_contains?: string;
  dimension?: string;
  chart_type?: string;
  aggregation?: string;
  company_names_match?: string;
  metrics_contain_any?: string[];
  unanswerable?: boolean;
}

interface GoldenCase {
  name: string;
  question: string;
  expect: GoldenExpect;
}

function arg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const BASE = arg('--base', 'http://localhost:3001');
const USERNAME = arg('--user', 'admin');
const PASSWORD = arg('--pass', '123456');

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`登录失败: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.token) throw new Error('登录响应缺少 token');
  return data.token;
}

async function ask(token: string, question: string): Promise<any> {
  const res = await fetch(`${BASE}/api/ai/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question, history: [] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** 单条期望校验，返回失败原因列表（空数组=通过） */
function check(expect: GoldenExpect, response: any): string[] {
  const failures: string[] = [];
  const plan = response.plan;

  if (expect.unanswerable) {
    if (plan != null) failures.push(`期望拒答，实际返回了计划: ${JSON.stringify(plan)}`);
    return failures;
  }
  if (plan == null) {
    failures.push(`期望返回计划，实际拒答: ${String(response.answer).slice(0, 100)}`);
    return failures;
  }
  if (expect.template_name_contains && !String(plan.template_name || '').includes(expect.template_name_contains)) {
    failures.push(`模板不匹配: 期望含「${expect.template_name_contains}」，实际「${plan.template_name}」`);
  }
  if (expect.dimension && plan.dimension !== expect.dimension) {
    failures.push(`维度不匹配: 期望 ${expect.dimension}，实际 ${plan.dimension}`);
  }
  if (expect.chart_type && plan.chart_type !== expect.chart_type) {
    failures.push(`图表类型不匹配: 期望 ${expect.chart_type}，实际 ${plan.chart_type}`);
  }
  if (expect.aggregation && plan.aggregation !== expect.aggregation) {
    failures.push(`聚合方式不匹配: 期望 ${expect.aggregation}，实际 ${plan.aggregation}`);
  }
  if (expect.company_names_match) {
    const names: string[] = plan.company_names || [];
    if (!names.some((n) => n.includes(expect.company_names_match!) || expect.company_names_match!.includes(n))) {
      failures.push(`机构筛选不匹配: 期望含「${expect.company_names_match}」，实际 ${JSON.stringify(names)}`);
    }
  }
  if (expect.metrics_contain_any) {
    const fieldNames: string[] = (plan.metrics || []).map((m: any) => m.field_name);
    if (!expect.metrics_contain_any.some((f) => fieldNames.includes(f))) {
      failures.push(`指标不匹配: 期望含 ${JSON.stringify(expect.metrics_contain_any)} 之一，实际 ${JSON.stringify(fieldNames)}`);
    }
  }
  return failures;
}

async function main() {
  const goldenPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'ai-query-golden.json');
  const golden = JSON.parse(readFileSync(goldenPath, 'utf-8'));
  const cases: GoldenCase[] = golden.cases;

  console.log(`# 智能问数 golden 评测：${cases.length} 条用例，目标 ${BASE}，账号 ${USERNAME}`);
  const token = await login();

  let passed = 0;
  for (const c of cases) {
    const startedAt = Date.now();
    try {
      const response = await ask(token, c.question);
      const failures = check(c.expect, response);
      const cost = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (failures.length === 0) {
        passed++;
        console.log(`✅ PASS [${c.name}] (${cost}s)`);
      } else {
        console.log(`❌ FAIL [${c.name}] (${cost}s)`);
        failures.forEach((f) => console.log(`     - ${f}`));
      }
    } catch (e: any) {
      console.log(`❌ ERROR [${c.name}] ${e?.message || e}`);
    }
  }
  console.log(`\n结果：${passed}/${cases.length} 通过`);
  process.exitCode = passed === cases.length ? 0 : 1;
}

main().catch((e) => {
  console.error('评测执行失败：', e?.message || e);
  process.exitCode = 1;
});
