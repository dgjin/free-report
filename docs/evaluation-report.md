# free-report 随手报 — 全面代码与功能设计专业评估报告

> 评估日期：2026-08-02  
> 评估范围：前端 (React 18 + TypeScript + Vite + SWR) + 后端 (Spring Boot 3 + MyBatis + MySQL) + 数据库 (11 个增量迁移脚本)  
> 代码规模：Java 92 文件 / TypeScript 35 文件 / SQL 11 文件

---

## 一、系统画像

| 维度 | 信息 |
|------|------|
| **定位** | 跨层级企业报表填报、审批、汇总与智能分析平台 |
| **前端技术栈** | React 18 + TypeScript + Vite + SWR + Tailwind CSS + Recharts |
| **后端技术栈** | Spring Boot 3 + MyBatis + MySQL 8 + JWT |
| **数据库迁移** | 11 个增量 SQL + 1 个数据巡检脚本 |
| **核心流程** | 模板设计 → 审批 → 周期下发 → 填报 → 三级审批 → 签收 → 汇总 → 智能问数 |

---

## 二、架构设计评估

### 2.1 整体分层 ⭐⭐⭐⭐☆ (良好)

```
┌──────────────────────────────────────────────┐
│   React SPA (Vite + SWR + Tailwind)           │
│   12 pages / 14 utils / 1 service             │
├──────────────────────────────────────────────┤
│   REST API (JSON, SNAKE_CASE)                 │
├──────────────────────────────────────────────┤
│   Controller (13) → Service (12) → Mapper (12)│
│        ↓              ↓              ↓        │
│   SecurityUtils  AiQueryService  Mapper.xml   │
├──────────────────────────────────────────────┤
│   MySQL (8 tables + 3 auxiliary tables)       │
└──────────────────────────────────────────────┘
```

**优点：**

- Controller → Service → Mapper 三层清晰，职责边界分明
- 13 个 Controller 按领域严格拆分（模板/下发/提交/审批/汇总/AI/签收/提醒/数据导入）
- 12 个 Service 对应 12 个 Mapper，粒度均匀，无「上帝 Service」
- 增量 SQL 迁移脚本带 `schema_migrations` 追踪，可复现

**可改进：**

- **无领域服务编排层** —— 跨 Service 的复杂操作（如「审批通过后自动汇总」）直接散落在 Controller 中调用多个 Service，缺少显式的 Application Service 或 Domain Event 来编排
- **无事件驱动机制** —— 审批通过后应触发「更新 assignment 状态」「更新 submission 状态」「更新 aggregation」「发送通知」四个操作，目前是在代码里硬串联

### 2.2 数据流设计 ⭐⭐⭐⭐☆ (良好)

前端采用 **SWR 自动重新验证** 模式，数据变更后调用 `mutate()` 自动刷新列表：

```typescript
// api.ts - SWR hooks pattern
export function useAssignments() {
  return useSWR('/api/assignments', fetcher);
}
export function useTemplates() {
  return useSWR('/api/templates', fetcher);
}
```

**优点：** 数据一致性由 SWR 保证，无需手动管理缓存失效。

**问题：** 所有 hook 使用默认 `revalidateOnFocus`，多 Tab 操作时会频繁刷新——生产环境建议配置 `revalidateOnFocus: false` 或使用 `dedupingInterval`。

---

## 三、后端逐模块评估

### 3.1 SubmissionService — 核心填报服务 ⭐⭐⭐☆☆

这是系统最重要的服务，但也是设计复杂度最高的模块。代码约 300 行，`saveOrUpdateSubmission` 是一个「万能方法」：

```
单方法处理了：
┌─ 新建草稿
├─ 更新草稿
├─ 驳回后重新提交（新版本）
├─ 直接提交（跳过审批）
└─ 提交并进入审批流
```

**问题：**

1. **控制流过于复杂** — 单个方法包含 5 条不同的执行路径，嵌套的 if/else 超过 4 层。单元测试几乎不可写。
2. **版本号非原子递增** — `SELECT MAX(version) + 1` 在并发下可能产生版本冲突（虽然实际并发概率低，但设计上不严谨）。
3. **职责过载** — 同一个方法既做 `saveDraft` 又做 `submit`，违反单一职责。

**建议重构：**

```java
// 当前（反模式）
public SubmissionResult saveOrUpdateSubmission(Long assignmentId, 
    Boolean submit, List<FieldData> data) { /* 300行混杂逻辑 */ }

// 建议
public SubmissionResult saveDraft(Long assignmentId, List<FieldData> data);
public SubmissionResult submit(Long assignmentId, List<FieldData> data);

// 版本号用数据库原子操作
@Insert("INSERT INTO report_submissions (...) " +
    "SELECT ..., COALESCE(MAX(version),0)+1 FROM report_submissions WHERE assignment_id = #{assignmentId}")
```

### 3.2 DataImportService — 数据导入引擎 ⭐⭐⭐⭐⭐

这是系统中设计最好的模块之一（约 360 行）：

**设计亮点：**

| 特性 | 实现 |
|------|------|
| **全量校验后单事务写入** | `validateAllRows()` → 全部通过后才 `@Transactional` 写入，零脏数据 |
| **行级校验** | 公司合法性 → 字段归属 → 值校验 → 状态冲突 → 四层防护 |
| **双模式** | `archive`（覆盖写入）vs `prefill`（仅填写空数据）|
| **错误聚合** | `ImportErrorAccumulator` 收集所有行的所有错误，一次性返回 |

**一个值得注意的风险：**

```java
// DataImportService 中 archive 模式的实现
deleteSubmissionData(submissionId);       // ① 先删
insertSubmissionDataBatch(submissionId, rows);  // ② 再插
```

虽然标注了 `@Transactional`，但如果 ① 成功后数据库连接断开，② 失败，产生空提交。建议改为：

```java
// 使用临时表 + RENAME 实现原子替换
INSERT INTO report_submission_data_temp ...
RENAME TABLE report_submission_data TO ..., report_submission_data_temp TO ...
```

### 3.3 AggregationService — 汇总引擎 ⭐⭐⭐☆☆

汇总查询是 Dashboard 和 AiQuery 的数据源，其核心 SQL 涉及大量 LEFT JOIN + GROUP BY：

**性能瓶颈分析：**

| 查询场景 | 涉及表 | 风险 |
|---------|--------|------|
| 单模板单周期汇总 | submission + data + field (3 表 JOIN) | ✅ 低风险 |
| 多周期横向对比 | 同上 × N 周期（N 次子查询 UNION） | ⚠️ 中等 |
| 全模板全周期（Dashboard） | 同上 × M 模板 × N 周期 | 🔴 高风险 |

**已做的优化（值得肯定）：**

- SQL `010_query_optimization.sql` 添加了覆盖索引 `(submission_id, field_id, row_index, numeric_value)`
- `008_template_approval.sql` 引入了 `numeric_value` 冗余列，支持 SQL 层直接聚合
- `checks/numeric_value_audit.sql` 有数据质量巡检脚本

**依然存在的问题：**

1. **无结果缓存** — 相同汇总查询在 Dashboard / AggregationView / AiQuery 各触发一次，无共享缓存
2. **无分页** — 机构数超过 100 时，`getAggregationDetail` 返回全量数据
3. **numeric_value 的维护一致性** — 写入 `report_submission_data` 时需要同步填充 `numeric_value`，如果有直接 INSERT 绕过了 Service 层，该列会是 NULL（已有巡检脚本监控）

### 3.4 ApprovalService — 审批引擎 ⭐⭐⭐⭐☆

审批流设计简洁有效：

```
三级审批链：
  handler（经办人提交）
    → reviewer（复核人审核）
      → approver（终审审批）
        → 状态变更为 approved → 触发签收流程
```

**优点：**

- `approval_records` 表用 `(submission_id, approval_level)` 唯一约束防止重复审批
- 审批操作与 submission 状态联动由服务层保证
- 审批记录保留完整历史

**可以增强的地方：**

- 审批链目前是**硬编码的三级** —— 如果未来需要动态配置审批级数（如小型分公司只需两级），需要改代码
- 缺少审批超时自动提醒机制

### 3.5 SecurityUtils — RBAC 权限引擎 ⭐⭐⭐⭐☆

**角色-权限矩阵设计完整：**

| 角色 | 读模板 | 管模板 | 下发 | 填报 | 审批 | 汇总 | 智能问数 |
|------|--------|--------|------|------|------|------|----------|
| super_admin | ✅全部 | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️仅运营统计 |
| department_report_admin | ✅本部门 | ✅本部门 | ✅ | ❌ | ❌ | ✅本部门 | ✅ |
| digital_admin | ✅全部 | ❌(仅审批) | ❌ | ❌ | ✅模板审批 | ✅ | ⚠️仅运营统计 |
| handler | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| branch_admin | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |

**设计精妙之处：**

- `canReadAssignment` 通过 `assignedToCompanyId` 和 `issuerDepartmentId` 做数据隔离
- `isAiQueryLimitedToOperationStats` 对 super_admin/digital_admin 限制智能问数仅能看运营统计，防止越权查看具体报表数值
- 使用 `RequestContextHolder` 获取当前请求用户，无需在每个方法传参

**一个小问题：**

```java
public boolean canManageTemplate(Long ownerDepartmentId) {
    // super_admin 被明确排除，不能管理任何模板
    return !isSuperAdmin(user) && isDepartmentReportAdmin(user) && ...;
}
```

这是故意的设计——超级管理员只读，不能编辑。但注释应该更明确。

---

## 四、前端评估

### 4.1 组件设计 ⭐⭐⭐⭐☆

**12 个页面组件，职责清晰：**

| 页面 | 行数 | 复杂度 |
|------|------|--------|
| Dashboard | ~1000 | 高 — 多角色多视图 |
| AggregationView | ~1100 | 高 — 四个 Tab、多维分析 |
| ReportFill | ~450 | 中 — 表单 + 表格 + 交叉表 |
| TemplateList | ~680 | 中 — 生命周期管理 |
| AiQuery | ~430 | 中 — 对话 + 图表渲染 |
| OrganizationManagement | ~740 | 中 — 树形机构管理 |

**ReportFill 的核心问题依然存在：**

- `loadData()` 函数约 80 行，混合了加载、错误处理、数据重构、兜底逻辑
- `summaryForm` 用 `Record<string, string>` 存储所有值（包括数字），前后端来回转换

### 4.2 工具函数库 ⭐⭐⭐⭐⭐

`src/utils/` 下的 13 个工具模块质量很高：

| 模块 | 亮点 |
|------|------|
| `excelFieldParser.ts` (23KB) | 自动识别标题/表头/注释行，推断字段类型，中文→英文映射 |
| `dataImportMapping.ts` (11.7KB) | 自动列映射、交叉表定位、strict 归档模式 |
| `detailImport.ts` (9.9KB) | 表头自动定位、模糊匹配、值规范化 |
| `toast.tsx` (6.9KB) | 轻量通知系统、confirm/prompt 对话框 |
| `reportOperations.ts` (6.3KB) | 下发任务四桶分类算法 |
| `dataValidation.ts` (8.2KB) | 必填/数字/日期/下拉值校验 + 跨字段规则（sum_of/detail_sum_of）|
| `aggregationView.ts` (3.8KB) | 交叉表分组、行列索引、搜索过滤 |
| `reportExport.ts` (3.9KB) | 填报数据 Excel 多工作表导出 |
| `aiQuery.ts` (5.9KB) | 图表数据标准化、建议问题生成、历史上下文构建 |

这些工具模块在代码质量上超过了页面组件，说明团队在前端工程化方面有良好的实践。

### 4.3 TypeScript 类型安全 ⭐⭐⭐☆☆

`types.ts` 定义了完整的领域类型，但存在一些不一致：

```typescript
// api.ts - 返回类型不匹配
async getCompanies(): Promise<Company> {  // 实际返回 Company[]
  return request<Company>('/api/companies');
}
```

部分 API 方法的泛型标注不准确，建议开启 `strict: true` 并修复所有类型错误。

### 4.4 SWR 使用 ⭐⭐⭐⭐☆

SWR 的选择非常适合这个报表系统——数据以读为主，写操作后 `mutate()` 刷新。

**改进建议：**

- 为高频轮询的 Dashboard 配置 `refreshInterval`（如 30 秒）
- 为汇总查询配置 `dedupingInterval: 5000` 防止短时间重复请求

---

## 五、数据库设计评估

### 5.1 Schema 设计 ⭐⭐⭐⭐☆

核心表设计合理，外键约束完整：

```
companies (树形自引用)
  ├── users (FK → companies)
  ├── report_assignments (FK → companies)
  └── report_submissions (FK → companies)

report_templates
  ├── report_template_fields (FK → templates)
  ├── report_assignments (FK → templates)
  ├── report_aggregations (FK → templates)
  └── report_template_schedules (FK → templates)

report_assignments
  ├── report_submissions (FK → assignments)
  └── report_aggregations (FK → assignments)

report_submissions
  ├── report_submission_data (FK → submissions, CASCADE)
  ├── approval_records (FK → submissions, CASCADE)
  └── submission_receipts (FK → submissions)
```

### 5.2 EAV 模式的改进

**这是系统最大的数据模型问题。** `report_submission_data` 使用 EAV（Entity-Attribute-Value）模式：

```sql
submission_id | field_id | row_index | value (TEXT) | numeric_value (DECIMAL)
```

**已做的改进（008 迁移）：** 增加了 `numeric_value` 冗余列，可在 SQL 层直接聚合。这是正确的方向。

**仍然存在的问题：**

1. **data_type 信息未持久化到数据行** — 无法从 `report_submission_data` 单表判断某行是 summary 还是 detail。需要 JOIN `report_template_fields` 才能知道，增加查询复杂度
2. **row_index = 0 的语义二义性** — summary 字段也用 `row_index=0`，detail 字段第一行也是 `row_index=0`，需要靠 `field.data_type` 区分
3. **日期值存为文本** — 无法在 SQL 层做日期范围筛选

**建议的渐进式改进：**

```sql
-- 短期：给 data 表增加冗余列
ALTER TABLE report_submission_data 
  ADD COLUMN data_type ENUM('summary','detail') NULL,
  ADD COLUMN date_value DATE NULL;

-- 填充已有数据
UPDATE report_submission_data d
JOIN report_template_fields f ON d.field_id = f.id
SET d.data_type = f.data_type;

-- 加索引
CREATE INDEX idx_data_type_field_row ON report_submission_data(data_type, field_id, row_index);
```

### 5.3 索引策略 ⭐⭐⭐⭐⭐

增量索引脚本 `006` 和 `010` 的设计非常专业：

- `001` 建表时已包含核心业务索引
- `006` 补充了高频查询索引
- `010` 补充了覆盖索引 `(submission_id, field_id, row_index, numeric_value)` — 直接命中聚合查询

**还有缺失的索引：**

```sql
-- 审批待办查询（高频）
CREATE INDEX idx_approval_status_assignee ON approval_records(status, approver_id);

-- 签收状态查询
CREATE INDEX idx_receipt_submission ON submission_receipts(submission_id);
```

---

## 六、智能问数（AI Query）评估

### 6.1 安全设计 ⭐⭐⭐⭐⭐

多层防护机制是这套系统的精髓：

```
用户输入 "各机构总收入"
  → AiQueryContextBuilder: 组装白名单上下文
  → AiClient: 发给 LLM，返回 JSON 查询计划
  → AiPlanResolver: 模板ID/指标/周期/分组字段逐一白名单校验
  → AggregationService: 执行已有汇总引擎（不生成 SQL）
  → AiResultBuilder: 构建图表 + 调用 LLM 生成文字结论
```

**关键原则：LLM 只理解语义，不生成 SQL，不接触数据库。** 这是 AI + 数据库场景的黄金实践。

### 6.2 架构模块一览

| 模块 | 职责 |
|------|------|
| `AiQueryController` | 接口入口，权限校验，审计记录 |
| `AiQueryService` | 编排 5 个子模块的调用流程 |
| `AiQueryContextBuilder` | 根据用户权限组装可用模板/指标/周期白名单 |
| `AiClient` | 调用 LLM API (DeepSeek/Ollama)，宽松 JSON 解析 |
| `AiPlanResolver` | 校验 LLM 返回的查询计划，白名单拦截 |
| `AiResultBuilder` | 构建图表数据、表格数据、文字结论 |
| `AiQueryAuditor` | 并发控制 + 审计日志 |
| `AiProperties` | 可切换模型的配置 |

### 6.3 改进空间

1. **上下文窗口浪费** — 每次请求都把所有模板的所有字段发给 LLM，模板数 30+、字段数 200+ 时上下文可能超出 DeepSeek 的窗口
2. **无流式输出** — 用户需等待 5-15 秒才能看到结果，WebSocket/SSE 流式返回可大幅改善体验
3. **无结果缓存** — 相同问题重复问会重新调用 LLM，建议基于问题+计划的哈希做短时缓存
4. **历史上下文注入不够精准** — 目前把查询口径直接拼到 assistant 消息开头，语义上不太自然。更好的做法是用独立的 system 消息注入

---

## 七、测试与质量保障

### 当前状况 ⭐⭐☆☆☆

| 维度 | 状态 |
|------|------|
| 后端单元测试 | ❌ 几乎没有 |
| 后端集成测试 | ❌ 没有 |
| 前端测试 | ⚠️ 15 个文件但覆盖有限 |
| 数据质量监控 | ✅ `checks/numeric_value_audit.sql` |
| 接口契约测试 | ❌ 没有 |
| E2E 测试 | ❌ 没有 |

### 建议的测试策略（按优先级）

1. **P0：后端 Service 层单元测试** — 至少覆盖 `SubmissionService`、`DataImportService`、`ApprovalService`、`AiPlanResolver`
2. **P0：API 集成测试** — 核心流程的端到端验证（模板→下发→填报→审批→汇总）
3. **P1：前端关键页面测试** — `ReportFill` 的数据加载/保存/提交流程
4. **P2：E2E 测试** — Playwright/Cypress 覆盖完整用户旅程

---

## 八、数据一致性风险矩阵

| 风险点 | 等级 | 场景 | 建议 |
|--------|------|------|------|
| 版本号并发冲突 | ⚠️ 中 | 两个 handler 同时驳回重提 | 用数据库原子操作 `INSERT SELECT MAX+1` |
| DataImport archive 模式非原子 | ⚠️ 中 | 删除+插入之间有断连风险 | 用临时表+RENAME 或事务确认 |
| numeric_value 与 value 不一致 | ⚠️ 中 | 直接 SQL 插入跳过了 Java 层 | 已有巡检脚本，建议加应用层触发器 |
| assignment 状态与 submission 状态不一致 | ✅ 低 | 代码状态机设计合理，事务保护 | 建议记录状态变更日志 |
| aggregation 物化数据过期 | ✅ 低 | 审批通过后即时更新 | 建议加定时任务全量重算 |

---

## 九、综合评分

| 评估维度 | 评分 | 说明 |
|---------|------|------|
| 架构设计 | ★★★★☆ | 分层清晰，缺少事件驱动和缓存层 |
| 后端代码质量 | ★★★★☆ | Service 层拆分明细到位，方法内聚性好 |
| 前端代码质量 | ★★★☆☆ | 工具库优秀，ReportFill 需要重构 |
| 前端工程化 | ★★★★★ | 13 个 utils、SWR hooks、类型定义完整 |
| 数据库设计 | ★★★★☆ | 增量迁移+索引脚本专业，EAV 模式已部分优化 |
| 安全性 | ★★★★☆ | RBAC 矩阵完整，AI 场景多层防护 |
| 智能问数 | ★★★★☆ | 架构好，缺流式输出和缓存 |
| 测试覆盖 | ★★☆☆☆ | 严重不足，是最大短板 |
| 可观测性 | ★★★☆☆ | 缺 trace ID，有基础的巡检脚本 |
| 数据迁移管理 | ★★★★★ | 增量 SQL + schema_migrations + 巡检脚本 |

**综合评分：3.6 / 5.0**

---

## 十、优先改进路线图

### 🔴 P0 — 线上稳定性（建议 1-2 周内完成）

| # | 改进项 | 工作量 | 影响范围 |
|---|--------|--------|----------|
| 1 | `getCompanies` 返回类型标注修复 (`api.ts`) | 5 min | 前端类型安全 |
| 2 | 前端错误信息透传——后端 `DomainException` message 应在 `request()` 中返回 | 30 min | 用户体验 |
| 3 | `SubmissionService` 版本号改为数据库原子操作 | 2 h | 数据一致性 |
| 4 | 汇总查询增加 Redis 缓存（TTL=5min） | 4 h | 性能 |
| 5 | 添加 API 请求 trace ID（MDC + Filter） | 2 h | 可观测性 |
| 6 | 补充 `SubmissionService` / `DataImportService` / `ApprovalService` 的核心单元测试 | 8 h | 质量保障 |

### 🟠 P1 — 代码质量（建议 1 个月内完成）

| # | 改进项 | 工作量 | 影响范围 |
|---|--------|--------|----------|
| 7 | `SubmissionService.saveOrUpdateSubmission` 拆分为 `saveDraft` + `submit` | 6 h | 可维护性 |
| 8 | `ReportFill.loadData` 拆分为 `loadAssignment` + `loadSubmission` + `mergeData` | 4 h | 可维护性 |
| 9 | 引入 Domain Event 机制——审批通过后解耦后续操作 | 8 h | 架构 |
| 10 | API 增加 Rate Limiting（Resilience4j / Bucket4j） | 4 h | 安全 |
| 11 | 智能问数增加 SSE 流式输出 | 12 h | 用户体验 |

### 🟡 P2 — 架构演进（后续迭代）

| # | 改进项 | 工作量 | 影响范围 |
|---|--------|--------|----------|
| 12 | 审批链改为可动态配置（审批级数、审批人策略） | 16 h | 业务灵活性 |
| 13 | 引入分布式锁处理并发导入场景 | 8 h | 数据一致性 |
| 14 | 建设数据变更审计日志（CDC 或应用层切面） | 12 h | 审计合规 |
| 15 | E2E 测试覆盖核心用户旅程 | 16 h | 质量保障 |
| 16 | `report_submission_data` 增加 `data_type` 冗余列 | 4 h | 查询性能 |

---

## 十一、总结

free-report 是一个**设计思路正确、工程实践扎实**的企业级报表系统。核心亮点包括：

1. **增量 SQL 迁移** — `schema_migrations` + 编号脚本 + 巡检检查，在中小企业项目中少见
2. **智能问数的多层防护** — LLM 不生成 SQL，白名单校验，权限控制，是 AI+数据库场景的典范实现
3. **前端工具库质量** — `excelFieldParser`、`dataImportMapping`、`toast` 等模块达到了生产级水准
4. **RBAC 权限矩阵** — 角色-资源-操作的映射完整且一致，数据隔离逻辑清晰
5. **DataImportService** — 全量校验后单事务写入的设计正确

主要短板集中在**测试覆盖不足**和**部分核心方法复杂度偏高**。建议按上述路线图分阶段推进，优先处理 P0 级别的线上稳定性问题。

---

## 附录：模块清单

### 后端 Controller (13 个)

| Controller | 路由前缀 | 职责 |
|-----------|---------|------|
| AuthController | `/api/auth` | 登录认证、个人信息 |
| TemplateController | `/api/templates` | 模板 CRUD、字段管理 |
| TemplateApprovalController | `/api/template-approvals` | 模板审批 |
| AssignmentController | `/api/assignments` | 下发任务管理 |
| SubmissionController | `/api/submissions` | 填报提交 |
| ApprovalController | `/api/approvals` | 审批操作 |
| AggregationController | `/api/aggregations` | 汇总查询 |
| ReceiptController | `/api/receipts` | 签收管理 |
| DataImportController | `/api/data-import` | 数据导入 |
| AiQueryController | `/api/ai/query` | 智能问数 |
| CompanyController | `/api/companies` | 机构管理 |
| UserController | `/api/users` | 用户管理 |
| HealthController | `/api/health` | 健康检查 |

### 前端页面 (12 个)

| 页面 | 功能 |
|------|------|
| Dashboard | 首页仪表盘 |
| AggregationView | 多维汇总报表 |
| AssignmentList | 下发管理与状态跟进 |
| ApprovalList | 审批中心 |
| ReportFill | 填报页面 |
| TemplateList | 报表模板库 |
| TemplateEditor | 模板设计页 |
| TemplateApprovalList | 模板审批面板 |
| Login | 登录页 |
| AiQuery | 智能问数 |
| OrganizationManagement | 机构与用户管理 |
| GlobalReadOnlyView | 超级管理员全局只读视图 |

### 数据库表 (11 个)

| 表名 | 用途 |
|------|------|
| companies | 机构（树形自引用）|
| users | 用户 |
| report_templates | 报表模板 |
| report_template_fields | 模板字段定义 |
| report_template_schedules | 周期下发计划 |
| report_assignments | 下发任务 |
| report_submissions | 提交记录 |
| report_submission_data | 提交数据（EAV 模式）|
| approval_records | 审批记录 |
| submission_receipts | 签收记录 |
| report_aggregations | 汇总数据（JSON）|
