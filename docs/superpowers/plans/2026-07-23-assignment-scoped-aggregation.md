# 按下发机构范围汇总 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让总部多维汇总仅显示并统计指定模板、指定周期实际收到报表的分公司和总部部门。

**Architecture:** 保留现有按模板和周期筛选任务的逻辑，增加一个纯函数，将筛选后的下发任务与机构记录映射为汇总目标。聚合接口遍历这些目标，而不是遍历全部启用机构；前端直接展示后端限定后的数据集合。

**Tech Stack:** TypeScript、Express、React、Node.js test runner、MySQL

## Global Constraints

- 汇总范围以指定模板、指定周期的实际下发任务为唯一依据。
- 实际收到报表的分公司和其他总部部门都显示。
- 未下发机构不显示，也不参与总数、合计、平均值和明细汇总。
- 已下发但未完成的机构仍显示，但其数据不计入数值统计。
- 已停用机构的历史下发任务仍显示。
- 不修改数据库结构或既有历史数据。

---

### Task 1: 解析实际下发的汇总目标

**Files:**
- Modify: `server/src/routes/aggregations.ts`
- Create: `tests/aggregation-scope.test.ts`

**Interfaces:**
- Consumes: `ReportAssignment[]`、`Company[]`、`templateId: number`、`periodLabel: string`
- Produces: `selectAggregationTargets(assignments, companies, templateId, periodLabel): Array<{ assignment: ReportAssignment; company: Company }>`

- [ ] **Step 1: 写出失败的范围测试**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAggregationTargets } from '../server/src/routes/aggregations';

const assignments = [
  { id: 1, template_id: 7, assigned_to_company_id: 10, period_label: '2026-07' },
  { id: 2, template_id: 7, assigned_to_company_id: 20, period_label: '2026-07' },
  { id: 3, template_id: 7, assigned_to_company_id: 30, period_label: '2026-06' },
  { id: 4, template_id: 8, assigned_to_company_id: 40, period_label: '2026-07' },
] as any[];

const companies = [
  { id: 10, name: '北京分公司', level: 'branch', status: 'active' },
  { id: 20, name: '计划财务部', level: 'department', status: 'active' },
  { id: 30, name: '历史分公司', level: 'branch', status: 'inactive' },
  { id: 40, name: '无关分公司', level: 'branch', status: 'active' },
  { id: 50, name: '未下发分公司', level: 'branch', status: 'active' },
] as any[];

test('aggregation targets contain only institutions assigned for the template period', () => {
  const targets = selectAggregationTargets(assignments, companies, 7, '2026-07');
  assert.deepEqual(targets.map(({ company }) => company.id), [10, 20]);
});

test('aggregation targets retain inactive institutions with historical assignments', () => {
  const targets = selectAggregationTargets(assignments, companies, 7, '2026-06');
  assert.deepEqual(targets.map(({ company }) => company.id), [30]);
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `node --import tsx --test tests/aggregation-scope.test.ts`

Expected: FAIL，因为 `selectAggregationTargets` 尚未导出。

- [ ] **Step 3: 实现最小目标解析函数**

在 `server/src/routes/aggregations.ts` 中引入 `Company` 类型并增加：

```ts
export function selectAggregationTargets(
  assignments: ReportAssignment[],
  companies: Company[],
  templateId: number,
  periodLabel: string,
): Array<{ assignment: ReportAssignment; company: Company }> {
  const companiesById = new Map(companies.map((company) => [company.id, company]));
  return selectAssignmentsForPeriod(assignments, templateId, periodLabel)
    .map((assignment) => ({
      assignment,
      company: companiesById.get(assignment.assigned_to_company_id),
    }))
    .filter(
      (target): target is { assignment: ReportAssignment; company: Company } =>
        target.company !== undefined,
    );
}
```

- [ ] **Step 4: 运行范围测试并确认通过**

Run: `node --import tsx --test tests/aggregation-scope.test.ts`

Expected: 2 tests PASS。

- [ ] **Step 5: 提交纯函数及测试**

```bash
git add server/src/routes/aggregations.ts tests/aggregation-scope.test.ts
git commit -m "test: define assignment-scoped aggregation targets"
```

### Task 2: 聚合接口改为遍历实际下发目标

**Files:**
- Modify: `server/src/routes/aggregations.ts`
- Test: `tests/aggregation-scope.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `selectAggregationTargets`
- Produces: `/api/aggregations/by-template/:templateId` 中仅包含实际下发机构的 `company_data`

- [ ] **Step 1: 增加接口结构回归测试**

在 `tests/aggregation-scope.test.ts` 增加：

```ts
import { readFileSync } from 'node:fs';

test('aggregation route iterates assignment-scoped targets instead of all institutions', () => {
  const source = readFileSync(
    new URL('../server/src/routes/aggregations.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /const targets = selectAggregationTargets\(/);
  assert.match(source, /for \(const \{ assignment, company \} of targets\)/);
  assert.doesNotMatch(source, /for \(const branch of branches\)/);
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `node --import tsx --test tests/aggregation-scope.test.ts`

Expected: 新增测试 FAIL，因为接口仍遍历 `branches`。

- [ ] **Step 3: 替换接口数据流**

将全量机构过滤和循环替换为：

```ts
const targets = selectAggregationTargets(
  await db.getAssignments(),
  await db.getCompanies(),
  templateId,
  periodLabel,
);

for (const { assignment, company } of targets) {
  const companyItem: any = {
    company_id: company.id,
    company_name: company.name,
    company_code: company.code,
    has_assignment: true,
    assignment_status: assignment.status,
    has_submitted: false,
    submission_version: 0,
    values: {},
  };
```

循环中的 `branch.name` 和 `branch.code` 全部替换为 `company.name` 和 `company.code`，移除多余的 `if (assignment)` 包裹，但保留最新有效提交、统计计算和 `companyDataList.push(companyItem)` 的现有行为。

- [ ] **Step 4: 运行范围测试与全量测试**

Run: `node --import tsx --test tests/aggregation-scope.test.ts`

Expected: 3 tests PASS。

Run: `npm test`

Expected: 全部测试通过，MySQL 集成测试在未配置测试库时保持 SKIP。

- [ ] **Step 5: 提交接口修改**

```bash
git add server/src/routes/aggregations.ts tests/aggregation-scope.test.ts
git commit -m "fix: aggregate only assigned institutions"
```

### Task 3: 调整机构统计文案并完成验证

**Files:**
- Modify: `src/pages/AggregationView.tsx`
- Test: `tests/aggregation-scope.test.ts`

**Interfaces:**
- Consumes: 后端限定后的 `aggregationData.company_data`
- Produces: 适用于分公司和总部部门的“机构”统计文案

- [ ] **Step 1: 增加前端文案测试**

在 `tests/aggregation-scope.test.ts` 增加：

```ts
test('aggregation view labels the scoped denominator as institutions', () => {
  const source = readFileSync(
    new URL('../src/pages/AggregationView.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /\{aggregationData\.company_data\.length\} 个机构/);
  assert.doesNotMatch(source, /\{aggregationData\.company_data\.length\} 个分公司/);
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `node --import tsx --test tests/aggregation-scope.test.ts`

Expected: 新增文案测试 FAIL，页面当前显示“个分公司”。

- [ ] **Step 3: 修改统计单位**

将 `src/pages/AggregationView.tsx` 中对比网格右上角的分母单位从：

```tsx
{aggregationData.company_data.length} 个分公司
```

改为：

```tsx
{aggregationData.company_data.length} 个机构
```

- [ ] **Step 4: 完成自动化校验**

Run: `npm test`

Expected: 全量测试通过。

Run: `npm run lint`

Expected: TypeScript 检查退出码 0。

Run: `npm run build`

Expected: Vite 和服务端 bundle 构建成功。

Run: `git diff --check`

Expected: 无输出。

- [ ] **Step 5: 重启并验证真实接口**

重启本地服务后，以有权查看该模板的部门管理员登录，调用：

```text
GET /api/aggregations/by-template/{templateId}?period_label={periodLabel}
```

验证 `company_data` 中每个 `company_id` 都能在该模板和周期的 `report_assignments.assigned_to_company_id` 中找到，且未下发机构不存在。

- [ ] **Step 6: 提交前端及验证测试**

```bash
git add src/pages/AggregationView.tsx tests/aggregation-scope.test.ts
git commit -m "fix: label aggregation targets as institutions"
```
