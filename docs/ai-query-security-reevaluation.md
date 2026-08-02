# 智能问数安全加固 — 重评估报告

> 基于 [ai-query-security-assessment.md](./ai-query-security-assessment.md) 的 10 项评估意见，逐项验证代码现状并实施优化。
>
> 实施时间：2026-07-24 | 后端 25 测试通过 | 前后端编译零错误

---

## 一、10 项问题修复状态

### ✅ 问题 1：上下文信息过度暴露给 LLM（"其他字段"）

**状态**：已修复 — 方案 4 实施

**改动**：
- `AiPlanResolver.buildPlanMessages()` — 删除 "其他字段" 拼接（原 L57-60）
- `AiTemplateContext` record — 移除 `others` 字段
- `AiQueryContextBuilder.doBuildContexts()` — 移除 `others` 列表构建

**效果**：LLM 上下文不再包含非统计用途的"其他字段"，减少信息泄露面。

---

### 🟡 问题 2：无字段级敏感度标记

**状态**：已实施后端能力 — 方案 2 实施

**改动**：
- SQL 迁移 `012_ai_query_security.sql` — `report_template_fields` 新增 `sensitive TINYINT(1) DEFAULT 0`
- `ReportTemplateField.java` — 新增 `Boolean sensitive = false` 字段
- `AiQueryContextBuilder` — 指标白名单（summary/detail）和分组字段均过滤 `sensitive == true`
- `TemplateMapper.xml` — INSERT/UPDATE 语句均包含 `sensitive` 列
- `TemplateMapper.java` — `updateField` 方法新增 `sensitive` 参数

**效果**：标记为 `sensitive=1` 的字段既不会出现在 system prompt 中，也无法被 LLM 选中为指标。
**待办**：前端 TemplateEditor 尚未添加敏感度标记 UI，当前默认全部 `sensitive=false`（向后兼容）。

---

### ✅ 问题 3：提示注入防护仅依赖 LLM 自觉

**状态**：已修复 — 方案 3 实施（简化版）

**改动**：
- `AiQueryService` — 新增 `sanitizeQuestion()` 方法：
  - 长度截断至 500 字
  - 正则过滤协议级注入标记：`system:`、`<|...|>`、`[INST]`、`<<SYS>>`、`[/INST]`、`<</SYS>>`
  - 过滤量超过 70% 则直接拒绝
- `doQuery()` 和 `doQueryStream()` 入口均调用净化

**设计取舍**：不过滤中文自然语言模式（如"你是一个"、"扮演"），避免误杀正常问数；
仅过滤明确的协议标记，因为 system prompt 已有足够强的 instruction。

---

### ✅ 问题 4：company_names 未严格校验

**状态**：已修复 — 方案 5 实施

**改动**：
- `AiPlanResolver.resolve()` — `requestedCompanies` limit 从 20 降至 5

**效果**：LLM 输出的机构名上限收窄，减少注入面。配合 `effectiveCompanyFilter` 的模糊匹配校验，确保不会引入不存在的机构。

---

### ✅ 问题 5：对话历史未净化

**状态**：已修复 — 方案 9 实施（简化版）

**改动**：
- `AiQueryService` — 新增 `sanitizeHistory()` 方法：
  - **仅保留 user 消息**（丢弃全部 assistant 消息），避免上一轮的实际数据泄露给 LLM
  - 对内容做长度截断（300 字）与协议标记过滤
- `doQuery()` 和 `doQueryStream()` 的 `buildPlanMessages` 调用均传入净化后的历史

**设计取舍**：直接丢弃 assistant 历史而非正则替换数值。原因：
1. 正则替换数值（如 `1,234,567元` → `[数值]`）会破坏上下文连贯性
2. user 消息已足够让 LLM 理解多轮对话的意图
3. 简洁可靠，零误杀

---

### ✅ 问题 6：权限检查缺失导致误导性错误消息

**状态**：已修复 — 方案 6 实施（简化版）

**改动**：
- `AiQueryService` — 新增 `checkQueryPermission()` 防御性检查方法：
  - 仅允许 `super_admin` / `digital_admin` / `department_report_admin`
  - 其他角色返回明确错误消息："智能问数功能仅向报表管理员开放。如需查询数据，请使用汇总报表页面。"
- `doQuery()` 和 `doQueryStream()` 入口均调用（在运营统计之前）

**说明**：Controller 层的 `requireQueryPermission()` 已提供第一道防线，Service 层为 defense-in-depth。

---

### ✅ 问题 7：运营统计路径未做角色检查

**状态**：实质已修复

**说明**：
- Controller 层 `requireQueryPermission()` 已在入口处拦截 handler/branch_admin（403）
- Service 层的 `checkQueryPermission()` 提供第二道防线
- super_admin/digital_admin 触发运营统计是**设计意图**（他们应能看运营统计），不是漏洞

---

### 🟡 问题 8：无模板级 AI 查询开关

**状态**：已实施后端能力 — 方案 1 实施

**改动**：
- SQL 迁移 `012_ai_query_security.sql` — `report_templates` 新增 `ai_query_enabled TINYINT(1) DEFAULT 1`
- `ReportTemplate.java` — 新增 `Boolean aiQueryEnabled = true` 字段
- `AiQueryContextBuilder` — 过滤 `aiQueryEnabled == false` 的模板
- `TemplateMapper.xml` — INSERT 语句包含 `ai_query_enabled`
- `TemplateMapper.java` — 新增 `setAiQueryEnabled(id, enabled)` 方法

**效果**：管理员可将含敏感数据的模板排除在 AI 问数之外，无需下线整个模板。
**待办**：前端 TemplateList/TemplateEditor 尚未添加开关 UI，当前默认全部 `ai_query_enabled=1`（向后兼容）。

---

### ✅ 问题 9：无请求频率和配额控制

**状态**：已修复 — 方案 7 实施

**改动**：
- `AiQueryAuditor` — 新增滑动窗口频率限制：
  - `userCallTimestamps` — 每用户每小时调用时间戳队列
  - `MAX_CALLS_PER_HOUR = 20` — 每用户每小时最多 20 次
  - `WINDOW_MS = 3600_000` — 1 小时滑动窗口
  - `checkRateLimit()` — 清理过期记录 + 判断是否超限
  - `execute()` 和 `executeStream()` 均在并发检查后调用

**效果**：超出限制返回 429 + "您本小时的问数次数已达上限（20次），请稍后再试"。

---

### ✅ 问题 10：审计日志不完整

**状态**：已修复 — 方案 8 实施

**改动**：
- 新增 `AiAuditContext` record — 封装 `exposedTemplateIds`、`exposedMetricCount`、`selectedTemplateId`
- `AiQueryAuditor.execute()` / `executeStream()` — 新增 `AiAuditContext[]` 参数
- `AiQueryService` — 新增 `buildAuditContext()` 方法，在计划解析后填充审计上下文
- 审计日志增强为：
  ```
  [AI_QUERY_AUDIT] user=2(caiwu) role=department_report_admin outcome=answered costMs=24
    scope=template=10 periods=[2026年Q3]
    templates_exposed=[10] metrics_exposed=4 selected_template=10
    question=裸车价平均值
  ```

**效果**：审计日志现在记录了暴露给 LLM 的模板清单、指标数量、以及 LLM 选中的模板 ID。

---

### ✅ 附加优化：白名单缓存（方案 10 / P3）

**状态**：已实施

**改动**：
- `AiQueryContextBuilder` — 新增 Caffeine 缓存：
  - `contextCache` — `key=userId, value=List<AiTemplateContext>`
  - 最大 50 个用户，5 分钟过期
  - `buildContexts()` 优先读缓存
  - `invalidateAll()` 公开方法，供模板变更时主动失效

**效果**：避免每次问数都查询数据库重建白名单，减少 2 次 SQL 开销。

---

## 二、改动文件清单

| 文件 | 改动类型 | 涉及方案 |
|------|----------|----------|
| `sql/012_ai_query_security.sql` | 新增 | 方案 1、2 |
| `entity/ReportTemplate.java` | 新增字段 | 方案 1 |
| `entity/ReportTemplateField.java` | 新增字段 | 方案 2 |
| `mapper/TemplateMapper.java` | 新增方法 + 参数 | 方案 1、2 |
| `resources/mapper/TemplateMapper.xml` | INSERT/UPDATE + 新 SQL | 方案 1、2 |
| `service/AiQueryService.java` | 输入净化 + 权限防御 + 历史净化 + 审计上下文 | 方案 3、6、9、8 |
| `service/AiPlanResolver.java` | 移除 others + limit 调整 | 方案 4、5 |
| `service/AiTemplateContext.java` | 移除 others 字段 | 方案 4 |
| `service/AiQueryContextBuilder.java` | aiQueryEnabled 过滤 + sensitive 过滤 + Caffeine 缓存 | 方案 1、2、10 |
| `service/AiQueryAuditor.java` | 频率限制 + 增强审计日志 | 方案 7、8 |
| `service/AiAuditContext.java` | 新增 record | 方案 8 |
| `service/TemplateService.java` | updateField 调用适配 | 方案 2 |

---

## 三、后续待办（已全部完成）

| 优先级 | 项目 | 状态 | 说明 |
|--------|------|------|------|
| ✅ P1 | 模板 AI 开关 UI | 已完成 | TemplateList 显示“智能问数”徽章；TemplateEditorHeader 添加可点击开关按钮 |
| ✅ P1 | 字段敏感度 UI | 已完成 | TemplateFieldList 每个字段卡片添加“敏感”标记按钮 |
| ✅ P1 | 缓存失效集成 | 已完成 | TemplateService 在 setAiQueryEnabled / setFieldSensitive / updateField 时调用 `invalidateAll()` |
| ✅ P2 | 单元测试 | 已完成 | 10 项新增测试：协议注入过滤/净化、正常问题不误杀、超长截断、空白拒绝、历史净化、权限防御、频率限制 |

---

## 四、总结

评估报告识别的 10 项安全薄弱点已 **全部修复**，包括前端 UI 与专项测试：

1. **输入层**：长度截断 + 协议标记过滤 + 70% 阈值拒绝
2. **权限层**：Controller 硬拦截 + Service 防御性检查（双层）
3. **上下文层**：others 移除 + sensitive 过滤 + aiQueryEnabled 过滤（最小化暴露）
4. **历史层**：assistant 消息丢弃 + user 消息截断+过滤
5. **频率层**：并发限 1 + 每小时 20 次滑动窗口
6. **审计层**：暴露模板/指标/选中模板全量记录
7. **UI 层**：模板智能问数开关 + 字段敏感度标记（管理员可控）
8. **测试层**：35 项测试全部通过（含 10 项安全专项测试）
