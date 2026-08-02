# 智能问数白名单机制与权限策略 — 评估与优化方案

## 一、当前架构评估

### 1.1 白名单机制 — 做得好的

| 方面 | 现状 | 评价 |
|------|------|------|
| 多层防御 | 模板可见性 → 状态过滤 → 字段校验 → 执行拦截 | ✅ 纵深正确 |
| LLM 不接触数据库 | 只输出 JSON 计划，取数走 AggregationService | ✅ 黄金实践 |
| 容错兜底 | 指标不匹配 → 默认前 3 个；周期不匹配 → 最近 1 个 | ✅ 用户体验好 |
| 标识字段排除 | `looksLikeIdentifier` 排除车牌号/编码字段 | ✅ 细节到位 |
| 数量硬上限 | 模板 30、指标 6、周期 12 | ✅ 防止滥用 |

### 1.2 白名单机制 — 存在的问题

#### 问题 1：上下文信息过度暴露给 LLM

当前每次请求，system prompt 中包含**全部可用模板的完整字段清单**，包括"其他字段"（`others`），这些字段在计划阶段完全用不到：

```java
// AiPlanResolver.java
if (!c.others().isEmpty()) {
    catalog.append("  其他字段: ").append(c.others().stream().limit(15)
            .map(ReportTemplateField::getFieldLabel).collect(Collectors.joining("、"))).append('\n');
}
```

风险：模板的完整字段结构（包括备注、说明等非统计字段）都泄露给了第三方 LLM 服务商。

#### 问题 2：无字段级敏感度标记

当前的白名单是"全有或全无"——用户能读模板，就能在 AI 查询中获取该模板的所有指标。报表中可能存在敏感的财务数据字段，它们和普通字段一样暴露在 LLM 上下文中。

#### 问题 3：提示注入防护仅依赖 LLM 自觉

```java
// AiPlanResolver.java
- unanswerable_reason: 若问题与报表数据无关、或所需报表/指标不在清单中，填写一句中文说明；否则为 null
注意：不要编造清单外的模板、指标或周期；不要输出 JSON 以外的任何文字。
```

没有对用户输入做任何过滤或净化。恶意用户可以通过精心构造的 prompt 尝试绕过限制。

#### 问题 4：company_names 未严格校验

```java
List<String> requestedCompanies = stringList(plan.path("company_names")).stream()
        .distinct().limit(20).collect(Collectors.toList());
```

LLM 输出的机构名直接使用，虽然最终会通过 `matchesCompany` 模糊匹配过滤，但 20 个的上限过大。

#### 问题 5：对话历史未净化

```java
if (history != null) {
    List<Map<String, String>> recent = history.size() > MAX_HISTORY_MESSAGES
            ? history.subList(history.size() - MAX_HISTORY_MESSAGES, history.size())
            : history;
    for (Map<String, String> h : recent) {
        String role = h.get("role");
        String content = h.get("content");
        if (content == null || content.isBlank()) continue;
        if (!"user".equals(role) && !"assistant".equals(role)) continue;
        messages.add(Map.of("role", role, "content", truncate(content, 500)));
    }
}
```

前几轮的 AI 回答（可能包含实际数据）会被完整发回 LLM，增加了数据泄露面。

---

### 1.3 权限策略 — 做得好的

| 方面 | 现状 | 评价 |
|------|------|------|
| 职能分离 | 运营统计 vs 报表问数，角色硬隔离 | ✅ 设计正确 |
| SQL 级过滤 | `findForUser` 在 SQL 层按角色过滤模板 | ✅ 无法绕过 |
| 执行时二次校验 | `canReadTemplate` 在取数前再次检查 | ✅ 防御深度 |

### 1.4 权限策略 — 存在的问题

#### 问题 6：权限检查缺失导致误导性错误消息

`AiQueryService.doQuery()` 对 `handler`/`branch_admin` 没有显式拦截：

```java
// 角色限制检查
if (securityUtils.isAiQueryLimitedToOperationStats(user)) {
    // ... 仅拦截 super_admin / digital_admin
}
// handler/branch_admin 会走到这里
List<AiTemplateContext> contexts = contextBuilder.buildContexts(user);
if (contexts.isEmpty()) {
    return textOnly("当前没有可供问数的报表。请先创建并发布模板、下发任务并完成填报后再来提问。", contexts);
}
```

handler 看到的是"没有可供问数的报表"，实际原因是"你没有权限"。这既不安全（信息泄露不准确）也不友好。

#### 问题 7：运营统计路径未做角色检查

```java
// 运营统计类问题：规则识别直接作答，不消耗 LLM 调用
Map<String, Object> operationAnswer = operationAnalyzer.answerIfMatched(question, user);
if (operationAnswer != null) {
    onEvent.accept(SseEvent.json("text_only", operationAnswer));
    ...
    return;
}
```

这段代码在 `isAiQueryLimitedToOperationStats` 检查**之前**执行。如果 handler 输入"各部门下发报表的情况"，系统会走到 `buildIssueStats`，虽然 SQL 层会按 `handler` 的 companyId 过滤，但语义上 handler 不应该能触发"各部门下发"这种运营统计查询。

#### 问题 8：无模板级 AI 查询开关

所有 `published` 状态的模板自动进入白名单。如果一个模板包含敏感字段（如薪酬数据），管理员无法将其排除在 AI 查询之外，除非将整个模板下线。

#### 问题 9：无请求频率和配额控制

`AiQueryAuditor` 只限制了单用户并发为 1，但没有：
- 每用户每小时/每天的最大调用次数
- Token 消耗配额
- 短期突发流量防护

#### 问题 10：审计日志不完整

```java
log.info("[AI_QUERY_AUDIT] user={}({}) role={} outcome={} costMs={} scope={} question={}",
        user.getId(), user.getUsername(), user.getRole(), outcome,
        System.currentTimeMillis() - startedAt, scope, truncate(str(question), 200));
```

缺少：哪些模板/指标名被发送给了 LLM、LLM 返回了什么 `template_id`、token 消耗量、是否触发了白名单拦截。

---

## 二、优化方案

### 方案 1：模板级 AI 查询开关

在 `report_templates` 表增加 `ai_query_enabled` 字段：

```sql
ALTER TABLE report_templates ADD COLUMN ai_query_enabled TINYINT(1) NOT NULL DEFAULT 1;
```

修改 `AiQueryContextBuilder.buildContexts()`：

```java
List<ReportTemplate> usable = templates.stream()
        .filter(t -> "published".equals(t.getStatus()))
        .filter(t -> Boolean.TRUE.equals(t.getAiQueryEnabled()))  // 新增
        .limit(MAX_TEMPLATES_IN_PROMPT)
        .collect(Collectors.toList());
```

---

### 方案 2：字段级敏感度标记

在 `report_template_fields` 表增加 `sensitive` 字段：

```sql
ALTER TABLE report_template_fields ADD COLUMN sensitive TINYINT(1) NOT NULL DEFAULT 0;
```

修改 `AiQueryContextBuilder` 中的指标和字段收集逻辑：

```java
// 指标白名单：排除敏感字段
List<AiMetric> metrics = new ArrayList<>();
fields.stream()
    .filter(f -> "summary".equals(f.getDataType()) 
            && "number".equals(f.getFieldType())
            && !Boolean.TRUE.equals(f.getSensitive()))  // 新增
    .forEach(f -> metrics.add(new AiMetric(...)));

// 分组字段：排除敏感字段
List<ReportTemplateField> groupableFields = fields.stream()
    .filter(f -> ("detail".equals(f.getDataType()) || "matrix".equals(f.getDataType()))
            && !"number".equals(f.getFieldType())
            && "active".equals(f.getStatus())
            && !Boolean.TRUE.equals(f.getSensitive()))  // 新增
    .collect(Collectors.toList());
```

这样，标记为 `sensitive` 的字段既不会出现在 system prompt 中，也无法被 LLM 选中为指标。

---

### 方案 3：提示注入输入净化（最关键的改进）

在 `AiQueryService.doQuery()` 中增加输入净化层：

```java
private static String sanitizeUserInput(String question) {
    if (question == null || question.isBlank()) {
        return "";
    }
    String cleaned = question
        // 移除常见的 prompt 注入模式
        .replaceAll("(?i)忽略.*指令|ignore.*instruction|跳过.*规则|bypass.*rule", "[已过滤]")
        .replaceAll("(?i)system:|<\\|.*\\|>|\\[INST\\]|<<SYS>>", "[已过滤]")
        // 移除多轮对话注入尝试
        .replaceAll("(?i)你是一个|you are a|扮演|pretend|act as", "[已过滤]")
        // 长度限制
        .trim();
    if (cleaned.length() > 500) {
        cleaned = cleaned.substring(0, 500);
    }
    // 若输入被大量过滤，直接拒绝
    if (cleaned.isEmpty() || cleaned.length() < question.length() * 0.3) {
        return null; // 调用方检查 null → 返回"输入不合法"
    }
    return cleaned;
}
```

在 `doQuery()` 入口调用：

```java
private Map<String, Object> doQuery(String question, List<Map<String, String>> history, AuthUser user) {
    String safeQuestion = sanitizeUserInput(question);
    if (safeQuestion == null) {
        return textOnly("您的问题包含不支持的指令，请重新描述您的数据需求。", List.of());
    }
    
    Map<String, Object> operationAnswer = operationAnalyzer.answerIfMatched(safeQuestion, user);
    // ... 后续逻辑使用 safeQuestion
}
```

---

### 方案 4：上下文最小化 — 移除"其他字段"

LLM 的计划阶段不需要知道"其他字段"，这些字段既不参与指标选择也不参与分组：

```java
// AiPlanResolver.buildPlanMessages() — 删除 others 部分
// 当前代码（应删除）：
if (!c.others().isEmpty()) {
    catalog.append("  其他字段: ").append(c.others().stream().limit(15)
            .map(ReportTemplateField::getFieldLabel).collect(Collectors.joining("、"))).append('\n');
}
```

同时，`AiTemplateContext` 中的 `others` 字段也应移除，减少内存占用和信息泄露面。

---

### 方案 5：LLM 输出的 company_names 严格校验

当前 `requestedCompanies` 仅通过 `matchesCompany` 模糊匹配，建议改为严格白名单：

```java
// AiQueryService 中，取数后得到真实机构名白名单
Set<String> realCompanyNames = periodDataList.stream()
    .flatMap(pd -> pd.companyData().stream())
    .map(c -> str(c.get("company_name")))
    .collect(Collectors.toSet());

// 取交集，不在白名单的直接丢弃
List<String> companyFilter = plan.requestedCompanies().stream()
    .filter(name -> realCompanyNames.stream().anyMatch(r -> r.contains(name) || name.contains(r)))
    .limit(5)  // 从 20 降到 5
    .collect(Collectors.toList());
```

---

### 方案 6：权限检查前置与明确错误消息

重构 `doQuery()` 的入口权限逻辑：

```java
private Map<String, Object> doQuery(String question, List<Map<String, String>> history, AuthUser user) {
    String safeQuestion = sanitizeUserInput(question);
    if (safeQuestion == null) {
        return textOnly("您的问题包含不支持的指令，请重新描述您的数据需求。", List.of());
    }

    // ===== 权限检查前置（在运营统计之前）=====
    String role = user.getRole();

    // 1. handler / branch_admin：完全不可用
    if ("handler".equals(role) || "branch_admin".equals(role)) {
        return textOnly("智能问数功能仅向报表管理员开放。如需查询数据，请使用汇总报表页面。", List.of());
    }

    // 2. super_admin / digital_admin：仅运营统计
    if ("super_admin".equals(role) || "digital_admin".equals(role)) {
        Map<String, Object> operationAnswer = operationAnalyzer.answerIfMatched(safeQuestion, user);
        if (operationAnswer != null) {
            return operationAnswer;
        }
        return textOnly("当前角色仅支持运营统计类查询，可问我「各部门下发报表的情况」或「各分公司填报情况分析」。"
                + "具体报表数据请由对应部门的报表管理员查询。", List.of());
    }

    // 3. department_report_admin：完整功能
    Map<String, Object> operationAnswer = operationAnalyzer.answerIfMatched(safeQuestion, user);
    if (operationAnswer != null) {
        return operationAnswer;
    }
    // ... 后续完整问数流程
```

**变化总结：**
- handler/branch_admin 在入口处明确拒绝，错误消息清晰
- super_admin/digital_admin 的运营统计逻辑与 department_report_admin 完全分离
- 运营统计不再对所有角色开放

---

### 方案 7：请求频率与配额控制

扩展 `AiQueryAuditor`，增加基于用户的内存计数器：

```java
@Component
public class AiQueryAuditor {
    // 单用户并发限 1
    private final Set<Long> inFlightUsers = ConcurrentHashMap.newKeySet();
    
    // 每用户每小时 20 次调用限制（滑动窗口）
    private final Map<Long, Deque<Long>> userCallTimestamps = new ConcurrentHashMap<>();
    private static final int MAX_CALLS_PER_HOUR = 20;
    private static final long WINDOW_MS = 3600_000;
    
    public Map<String, Object> execute(AuthUser user, String question, Supplier<Map<String, Object>> action) {
        // 并发检查
        if (!inFlightUsers.add(user.getId())) {
            throw new DomainException("您有一条问数请求正在处理中，请等它完成后再提问", 429);
        }
        
        // 频率检查
        if (!checkRateLimit(user.getId())) {
            inFlightUsers.remove(user.getId());
            throw new DomainException("您本小时的问数次数已达上限（" + MAX_CALLS_PER_HOUR + "次），请稍后再试", 429);
        }
        
        try {
            return action.get();
        } finally {
            inFlightUsers.remove(user.getId());
        }
    }
    
    private boolean checkRateLimit(Long userId) {
        Deque<Long> timestamps = userCallTimestamps
                .computeIfAbsent(userId, k -> new ConcurrentLinkedDeque<>());
        long now = System.currentTimeMillis();
        // 清理过期记录
        while (!timestamps.isEmpty() && now - timestamps.peekFirst() > WINDOW_MS) {
            timestamps.pollFirst();
        }
        if (timestamps.size() >= MAX_CALLS_PER_HOUR) {
            return false;
        }
        timestamps.addLast(now);
        return true;
    }
}
```

---

### 方案 8：增强审计日志

扩展审计日志结构，将关键信息结构化存储：

```java
// AiQueryAuditor.execute() 的 finally 块
log.info("[AI_QUERY_AUDIT] user={}({}) role={} outcome={} costMs={} "
        + "templates_exposed=[{}] metrics_exposed=[{}] "
        + "llm_selected_template={} tokens_approx={} "
        + "question={}",
        user.getId(), user.getUsername(), user.getRole(), outcome,
        System.currentTimeMillis() - startedAt,
        exposedTemplateIds,
        exposedMetricCount,
        selectedTemplateId,
        estimateTokens(contexts, question),
        truncate(str(question), 200));
```

---

### 方案 9：对话历史净化

历史对话中的 AI 回复可能包含实际数据，不应原样发回 LLM：

```java
// 在 AiPlanResolver.buildPlanMessages() 中
for (Map<String, String> h : recent) {
    String role = h.get("role");
    String content = h.get("content");
    if (content == null || content.isBlank()) continue;
    if (!"user".equals(role) && !"assistant".equals(role)) continue;
    if ("assistant".equals(role)) {
        // AI 回复只保留结构化的查询摘要，剥离实际数值
        content = extractQuerySummary(content);
    }
    messages.add(Map.of("role", role, "content", truncate(content, 300)));
}

/**
 * 从 AI 回复中提取查询摘要，移除具体数值。
 * 原始："2026年07月总收入合计1,234,567元，北京分公司最高（456,789元）"
 * 摘要："已查询2026年07月各机构总收入，北京分公司最高"
 */
private String extractQuerySummary(String aiResponse) {
    if (aiResponse == null) return "";
    return aiResponse
        .replaceAll("[\\d,]+(\\.\\d+)?(?:元|万元|条|台|辆|公里|千米)", "[数值]")
        .replaceAll("\\d+(\\.\\d+)?%", "[百分比]");
}
```

---

### 方案 10：白名单缓存与版本控制

当前每次请求都重构白名单，可增加缓存：

```java
@Component
public class AiQueryContextBuilder {
    // 缓存 key = userId，value = 上下文列表
    private final Cache<Long, CacheEntry> contextCache = Caffeine.newBuilder()
            .maximumSize(50)
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .build();
    
    public List<AiTemplateContext> buildContexts(AuthUser user) {
        CacheEntry cached = contextCache.getIfPresent(user.getId());
        if (cached != null && cached.isFresh()) {
            return cached.contexts();
        }
        // ... 原有构建逻辑
        List<AiTemplateContext> contexts = /* 构建 */;
        contextCache.put(user.getId(), new CacheEntry(contexts, System.currentTimeMillis()));
        return contexts;
    }
    
    /** 模板/字段变更时主动失效 */
    public void invalidateAll() {
        contextCache.invalidateAll();
    }
}
```

配合 `AiTemplateContext` 和 `AiResolvedPlan` 增加序列号校验——如果缓存的上下文版本与执行时的版本不一致，拒绝执行。

---

## 三、改动优先级

| 优先级 | 方案 | 改动量 | 安全影响 | 说明 |
|--------|------|--------|----------|------|
| 🔴 P0 | 方案 3：提示注入净化 | 30 min | 高 | 防止 prompt injection，几乎无副作用 |
| 🔴 P0 | 方案 6：权限检查前置 | 1 h | 高 | 修复 handler 可触发运营统计的漏洞 |
| 🔴 P0 | 方案 9：对话历史净化 | 1 h | 中 | 防止历史数据泄露给 LLM |
| 🟠 P1 | 方案 4：移除"其他字段" | 30 min | 中 | 减少信息泄露面，改一行代码 |
| 🟠 P1 | 方案 5：company_names 严格校验 | 30 min | 低 | 减少 LLM 输出注入面 |
| 🟠 P1 | 方案 7：频率配额控制 | 2 h | 中 | 防止滥用和成本爆炸 |
| 🟡 P2 | 方案 1：模板级 AI 开关 | 2 h | 中 | 需 DDL 变更 |
| 🟡 P2 | 方案 2：字段级敏感度 | 3 h | 中 | 需 DDL 变更 + UI 改动 |
| 🟡 P2 | 方案 8：增强审计日志 | 1 h | 低 | 可观测性提升 |
| 🟢 P3 | 方案 10：白名单缓存 | 2 h | 低 | 性能优化，非安全必须 |

---

## 四、优化后的完整数据流

```
用户输入
     │
     ▼
┌─────────────────────────────────────┐
│  输入净化层（方案3）                   │
│  - 过滤 prompt injection 模式        │
│  - 长度截断                          │
│  - 非法输入 → 直接拒绝               │
└────────────────┬────────────────────┘
                 │
     ┌───────────▼───────────┐
     │  角色权限检查（方案6）   │
     │  handler → 直接拒绝    │
     │  super_admin → 仅运营   │
     │  dept_admin → 完整功能  │
     └───────────┬───────────┘
                 │
     ┌───────────▼───────────┐
     │  运营统计意图识别       │
     │  （仅 dept_admin）     │
     │  → 不消耗 LLM         │
     └───────────┬───────────┘
                 │
     ┌───────────▼──────────────────┐
     │  白名单构建（方案1/2/4/7/10）  │
     │  - 仅 ai_query_enabled 模板   │
     │  - 排除 sensitive 字段        │
     │  - 排除"其他字段"              │
     │  - Caffeine 缓存 + 版本校验    │
     └───────────┬──────────────────┘
                 │ 最小化上下文
     ┌───────────▼──────────────────┐
     │  LLM（DeepSeek）              │
     │  - 净化后的对话历史（方案9）    │
     │  - MongoDB「其他字段」不发     │
     └───────────┬──────────────────┘
                 │ JSON 计划
     ┌───────────▼──────────────────┐
     │  白名单校验 + 机构名严格匹配    │
     │  （方案5：limit 5）           │
     └───────────┬──────────────────┘
                 │
     ┌───────────▼──────────────────┐
     │  AggregationService 取数      │
     │  canReadTemplate 二次校验     │
     └───────────┬──────────────────┘
                 │
     ┌───────────▼──────────────────┐
     │  增强审计日志（方案8）          │
     │  template / metric / tokens   │
     └──────────────────────────────┘
```

---

## 五、总结

当前系统的白名单机制和权限策略的**骨架是正确的**——多层防御、LLM 不接触 SQL、取数走已有权限路径。但在细节上存在几个实际可利用的薄弱点：

1. **提示注入**：用户输入无任何净化，完全依赖 LLM 的 instruction following 能力
2. **权限检查顺序错误**：运营统计在角色检查之前执行，handler 可触发
3. **上下文过量**："其他字段"泄露了不必要的模板结构信息
4. **对话历史泄露**：上一轮的 AI 回复（含实际数据）被原样发回 LLM

建议优先实施 P0 级别的 3 项改动（方案 3/6/9），总计约 2.5 小时工作量，即可堵住最关键的漏洞。
