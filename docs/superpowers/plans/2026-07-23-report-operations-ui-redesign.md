# 下发管理与汇总报表界面重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将下发管理改造成异常优先工作台，并将汇总报表改造成概览加页签的分层数据视图。

**Architecture:** 用纯前端视图模型统一任务分类、筛选、排序和报表进度计算；页面拆分为职责单一的展示组件。待签收接口仅补充已有数据字段，签收弹窗复用现有操作接口；汇总接口和数据库结构保持不变。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Express、MySQL、Node.js test runner

## Global Constraints

- 仅使用现有任务、截止日期、提交状态、汇总值、平均值和明细数据。
- 不新增同比、环比、业务阈值、自动预警、催办或通知能力。
- 部门报表管理员可管理所属部门任务并签收；超级管理员保持只读；分公司填报流程不变。
- 任务概览四类互斥：已完成、异常、待签收、待填报。
- 汇总内容分为机构对比、明细数据、填报进度三个页签。
- 不修改数据库结构。
- 使用 `ui-designer` 指导视觉实现，并遵循现有浅色后台界面风格。

---

### Task 1: 任务状态视图模型

**Files:**
- Create: `src/utils/reportOperations.ts`
- Create: `tests/report-operations-view-model.test.ts`

**Interfaces:**
- Produces: `classifyAssignment(assignment, today?): OperationBucket`
- Produces: `getAssignmentOverview(assignments, today?): Record<OperationBucket, number>`
- Produces: `filterOperationAssignments(assignments, filters, today?): ReportAssignment[]`
- Produces: `groupAssignmentProgress(assignments): ReportProgressGroup[]`

- [ ] **Step 1: 写失败测试**

测试必须覆盖：

```ts
const today = new Date('2026-07-23T00:00:00+08:00');

assert.equal(classifyAssignment(assignment('received', '2026-07-20'), today), 'completed');
assert.equal(classifyAssignment(assignment('returned', '2026-07-30'), today), 'abnormal');
assert.equal(classifyAssignment(assignment('pending', '2026-07-20'), today), 'abnormal');
assert.equal(classifyAssignment(assignment('pending_receipt', '2026-07-30'), today), 'pending_receipt');
assert.equal(classifyAssignment(assignment('filling', '2026-07-30'), today), 'pending_fill');
```

另测：

- 四类统计总数等于任务总数。
- 默认“需处理”筛选包含异常和三天内截止的待填报任务。
- 文本搜索匹配机构、机构编码、报表名称和标题。
- 报表、周期与状态筛选可以组合。
- 报表进度按 `template_id + period_label` 分组，完成数只统计完成类任务。

- [ ] **Step 2: 验证测试失败**

Run: `node --import tsx --test tests/report-operations-view-model.test.ts`

Expected: FAIL，模块 `src/utils/reportOperations.ts` 不存在。

- [ ] **Step 3: 实现纯函数**

定义：

```ts
export type OperationBucket = 'abnormal' | 'pending_fill' | 'pending_receipt' | 'completed';

export interface OperationFilters {
  query: string;
  bucket: OperationBucket | 'actionable' | 'all';
  templateId: number | 'all';
  periodLabel: string | 'all';
}

export interface ReportProgressGroup {
  key: string;
  templateId: number;
  templateName: string;
  periodLabel: string;
  total: number;
  completed: number;
  abnormal: number;
}
```

日期比较先将今天和截止日期都归一化到本地零点。分类优先级固定为：完成 → 退回/驳回或逾期 → 待签收 → 待填报。任务默认排序为异常优先、截止日期升序、ID 降序。

- [ ] **Step 4: 验证通过**

Run: `node --import tsx --test tests/report-operations-view-model.test.ts`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/utils/reportOperations.ts tests/report-operations-view-model.test.ts
git commit -m "feat: add report operations view model"
```

### Task 2: 扩展待签收展示数据

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/src/types.ts`
- Modify: `src/types.ts`
- Modify: `src/services/api.ts`
- Create: `tests/pending-receipt-contract.test.ts`

**Interfaces:**
- Produces: `PendingReceipt`，包含 `id`、`assignment_id`、`assignment_title`、`template_name`、`company_name`、`period_label`、`version`、`submitted_by_name`、`submitted_at`、`comment`
- Produces: `api.getPendingReceipts(): Promise<PendingReceipt[]>`

- [ ] **Step 1: 写失败的接口契约测试**

断言 `Database.getPendingReceipts` 查询：

```sql
JOIN users u ON u.id=s.submitted_by
```

并选择：

```sql
a.period_label, u.display_name submitted_by_name
```

断言客户端不再使用 `any[]`，而是返回 `PendingReceipt[]`。

- [ ] **Step 2: 验证测试失败**

Run: `node --import tsx --test tests/pending-receipt-contract.test.ts`

Expected: FAIL，因为查询和类型字段尚不存在。

- [ ] **Step 3: 实现查询与共享类型**

在服务端与客户端定义相同字段的 `PendingReceipt`。修改 `getPendingReceipts` 的联表查询补充周期和提交人姓名；不改变路由路径和权限中间件。

- [ ] **Step 4: 验证通过**

Run: `node --import tsx --test tests/pending-receipt-contract.test.ts`

Run: `npm run lint`

Expected: 均退出 0。

- [ ] **Step 5: 提交**

```bash
git add server/src/db.ts server/src/types.ts src/types.ts src/services/api.ts tests/pending-receipt-contract.test.ts
git commit -m "feat: enrich pending receipt details"
```

### Task 3: 构建异常优先的下发管理工作台

**Files:**
- Create: `src/components/report-operations/StatusOverview.tsx`
- Create: `src/components/report-operations/AssignmentFilters.tsx`
- Create: `src/components/report-operations/AssignmentTable.tsx`
- Create: `src/components/report-operations/ReportProgressList.tsx`
- Modify: `src/pages/AssignmentList.tsx`
- Create: `tests/report-operations-ui.test.ts`

**Interfaces:**
- Consumes: Task 1 的视图模型函数
- Produces: 总部角色的异常工作台；分公司角色保留填报任务视图

- [ ] **Step 1: 写失败的页面结构测试**

测试源码结构包含：

```ts
assert.match(page, /getAssignmentOverview/);
assert.match(page, /filterOperationAssignments/);
assert.match(page, /groupAssignmentProgress/);
assert.match(page, /<StatusOverview/);
assert.match(page, /<AssignmentFilters/);
assert.match(page, /<AssignmentTable/);
assert.match(page, /<ReportProgressList/);
```

组件测试还需断言：

- 状态数字卡是 `button` 并含 `aria-pressed`。
- 搜索框有明确 `aria-label`。
- 空结果提供“清除筛选”按钮。
- 超级管理员不渲染“新建下发”写操作。
- 任务表包含桌面表格和移动卡片的响应式类。

- [ ] **Step 2: 验证测试失败**

Run: `node --import tsx --test tests/report-operations-ui.test.ts`

Expected: FAIL，因为组件尚不存在。

- [ ] **Step 3: 使用 `ui-designer` 实现组件**

页面顶部使用紧凑标题栏。四张状态卡依次为异常、待填报、待签收、已完成。筛选栏包含搜索、报表、周期和清除按钮。

总部任务表固定列：

```text
机构 | 报表 / 周期 | 截止日期 | 状态 | 操作
```

异常任务使用左侧红色标记，三天内截止使用黄色标记，其他任务不增加彩色边框。报表进度卡显示名称、周期、完成数/总数、异常数、进度条和“查看汇总”。

`AssignmentList` 仅负责加载数据、保存筛选状态和协调导航；展示逻辑下沉到组件。超级管理员使用相同视图但不显示新建、签收或退回操作。

- [ ] **Step 4: 验证**

Run: `node --import tsx --test tests/report-operations-view-model.test.ts tests/report-operations-ui.test.ts`

Run: `npm run lint`

Expected: 均通过。

- [ ] **Step 5: 提交**

```bash
git add src/components/report-operations src/pages/AssignmentList.tsx tests/report-operations-ui.test.ts
git commit -m "feat: redesign assignment operations dashboard"
```

### Task 4: 在工作台集成签收弹窗

**Files:**
- Create: `src/components/report-operations/ReceiptDialog.tsx`
- Modify: `src/pages/AssignmentList.tsx`
- Modify: `tests/report-operations-ui.test.ts`

**Interfaces:**
- Consumes: `PendingReceipt`、`api.processReceipt`
- Produces: `ReceiptDialog` props：

```ts
interface ReceiptDialogProps {
  receipt: PendingReceipt | null;
  assignmentId: number | null;
  onClose: () => void;
  onCompleted: () => Promise<void>;
}
```

- [ ] **Step 1: 写失败测试**

断言：

- 页面为部门管理员并行加载 assignments 与 pending receipts。
- 待签收任务通过 `assignment_id` 匹配签收记录。
- 超级管理员不调用 `getPendingReceipts`。
- 弹窗使用 `role="dialog"`、`aria-modal="true"` 和标题关联。
- 退回原因是受控输入，空原因不调用接口。
- 请求期间禁用关闭、签收和退回按钮。
- 错误显示在弹窗内，而不是只调用 `alert`。
- 成功后执行 `onCompleted` 重新加载任务和签收列表。

- [ ] **Step 2: 验证测试失败**

Run: `node --import tsx --test tests/report-operations-ui.test.ts`

Expected: 新增断言 FAIL。

- [ ] **Step 3: 实现签收弹窗**

弹窗展示报表、机构、周期、版本、提交人、提交时间、备注及“查看完整填报内容”。“确认签收”弹出二次确认；“退回修改”展开原因输入区并校验非空。接口失败时保留输入内容。

- [ ] **Step 4: 验证**

Run: `node --import tsx --test tests/report-operations-ui.test.ts`

Run: `npm run lint`

Expected: 均通过。

- [ ] **Step 5: 提交**

```bash
git add src/components/report-operations/ReceiptDialog.tsx src/pages/AssignmentList.tsx tests/report-operations-ui.test.ts
git commit -m "feat: process receipts from operations dashboard"
```

### Task 5: 汇总页视图模型与页签组件

**Files:**
- Create: `src/utils/aggregationView.ts`
- Create: `src/components/aggregation/MetricOverview.tsx`
- Create: `src/components/aggregation/AggregationTabs.tsx`
- Create: `src/components/aggregation/InstitutionComparison.tsx`
- Create: `src/components/aggregation/DetailDataTable.tsx`
- Create: `src/components/aggregation/SubmissionProgress.tsx`
- Create: `tests/aggregation-view-model.test.ts`
- Create: `tests/aggregation-ui.test.ts`

**Interfaces:**
- Produces: `AggregationTab = 'institutions' | 'details' | 'progress'`
- Produces: `filterInstitutionRows(companyData, query)`
- Produces: `filterDetailRows(detailRows, query)`
- Produces: `getUncountedInstitutionCount(companyData)`

- [ ] **Step 1: 写失败的视图模型与结构测试**

视图模型测试：

- 机构搜索匹配名称和编码。
- 明细搜索匹配 `company_name` 和 `company_code`。
- 未统计机构数等于 `has_submitted === false` 的机构数。

组件结构测试：

- 页签按钮含 `role="tab"` 和 `aria-selected`。
- 页签面板含 `role="tabpanel"`。
- 仅当前页签组件被渲染。
- 指标卡展示合计、平均值和统计机构数。
- 机构对比和明细表有搜索框与空状态。
- 填报进度展示机构、状态、版本和截止日期；若当前聚合响应缺少截止日期，使用页面已加载的 assignments 按机构和模板周期匹配。

- [ ] **Step 2: 验证测试失败**

Run: `node --import tsx --test tests/aggregation-view-model.test.ts tests/aggregation-ui.test.ts`

Expected: FAIL，模块与组件不存在。

- [ ] **Step 3: 实现视图模型和组件**

使用 `ui-designer` 落实已确认的浅色数据工作台。指标卡按响应式网格排列；页签使用蓝色底边表示当前项。桌面表格数值右对齐，移动端允许表格区域自身横向滚动但页面主体不横向溢出。

- [ ] **Step 4: 验证**

Run: `node --import tsx --test tests/aggregation-view-model.test.ts tests/aggregation-ui.test.ts`

Run: `npm run lint`

Expected: 均通过。

- [ ] **Step 5: 提交**

```bash
git add src/utils/aggregationView.ts src/components/aggregation tests/aggregation-view-model.test.ts tests/aggregation-ui.test.ts
git commit -m "feat: add layered aggregation components"
```

### Task 6: 重构汇总页面并处理加载与错误状态

**Files:**
- Modify: `src/pages/AggregationView.tsx`
- Modify: `tests/aggregation-ui.test.ts`

**Interfaces:**
- Consumes: Task 5 的视图模型和组件
- Produces: 概览 + 三页签的完整汇总页面

- [ ] **Step 1: 写失败测试**

断言页面：

```ts
assert.match(source, /<MetricOverview/);
assert.match(source, /<AggregationTabs/);
assert.match(source, /activeTab === 'institutions'/);
assert.match(source, /activeTab === 'details'/);
assert.match(source, /activeTab === 'progress'/);
```

并覆盖：

- 切换模板时清除旧聚合数据。
- 请求错误时保存错误消息并显示重试按钮。
- 无下发周期时禁用周期选择并显示空状态。
- URL 始终同步 `template_id` 和 `period_label`。
- 加载时显示结构化骨架屏，而不是纯文字。

- [ ] **Step 2: 验证测试失败**

Run: `node --import tsx --test tests/aggregation-ui.test.ts`

Expected: 新页面断言 FAIL。

- [ ] **Step 3: 重构页面**

`AggregationView` 只负责模板、任务、周期、聚合数据、错误、加载状态和当前页签。移除连续铺开的旧机构表与明细表，改为按当前页签渲染。

复制操作继续复制 `aggregationData.summary`。页面标题和表头统一使用“机构”，不再使用仅指分公司的文案。

- [ ] **Step 4: 验证**

Run: `node --import tsx --test tests/aggregation-view-model.test.ts tests/aggregation-ui.test.ts`

Run: `npm run lint`

Expected: 均通过。

- [ ] **Step 5: 提交**

```bash
git add src/pages/AggregationView.tsx tests/aggregation-ui.test.ts
git commit -m "feat: redesign aggregation workspace"
```

### Task 7: 全量验证与本地冒烟测试

**Files:**
- Modify only if verification exposes a defect in the files above.

- [ ] **Step 1: 运行完整自动化验证**

Run: `npm test`

Expected: 全部测试通过；MySQL 集成测试在未配置测试库时可以 SKIP。

Run: `npm run lint`

Expected: TypeScript 检查退出码 0。

Run: `npm run build`

Expected: Vite 和服务端 bundle 构建成功。

Run: `git diff --check`

Expected: 无输出。

- [ ] **Step 2: 重启本地服务**

使用现有 `.env` 和 MySQL，在 `http://localhost:3000` 启动合并候选代码，确认健康接口返回 `status: ok`。

- [ ] **Step 3: 部门管理员冒烟测试**

使用部门管理员验证：

- 默认进入需处理视图。
- 状态卡、搜索、报表和周期筛选可以组合。
- 待签收任务可在弹窗签收或填写原因退回。
- 操作成功后数字、任务行和进度卡同步刷新。
- 进度卡进入正确模板和周期的汇总页。
- 三个汇总页签、搜索、空状态和复制指标可用。

- [ ] **Step 4: 超级管理员与窄屏验证**

- 超级管理员能查看全部任务与汇总，不出现新建、签收或退回按钮。
- 窄屏下任务列表使用卡片布局，主要操作可见；汇总表仅在自身容器横向滚动。

- [ ] **Step 5: 最终提交**

若验证产生修复：

```bash
git add <修复文件>
git commit -m "fix: polish report operations workspace"
```

若无修复，保持已有任务提交不变。
