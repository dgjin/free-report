# 智能问数功能分析报告 — 参照 DataEase/SQLBot

> 编写日期：2026-08-02
> 参照项目：[dataease/SQLBot](https://github.com/dataease/SQLBot) (GitHub Star 6.5k+)
> 分析对象：随手报 ReportNow 智能问数模块

---

## 一、架构对比总览

| 维度 | SQLBot | FreeReport 智能问数 | 差异分析 |
|------|--------|---------------------|----------|
| **核心范式** | Text-to-SQL（LLM 生成 SQL） | 双阶段计划（LLM 生成 JSON 计划 → 聚合引擎取数） | FreeReport 不让 LLM 生成 SQL，取数走已有的 AggregationService 权限路径，安全性更高但灵活度受限 |
| **检索增强** | RAG + 向量嵌入（embedding 余弦相似度匹配数据源 schema） | 白名单全量注入（用户可见模板/指标/周期全量写入 prompt） | SQLBot 按相似度精选 top-K 表结构，FreeReport 全量注入（上限 30 模板） |
| **Few-shot 校准** | SQL 示例库 + 术语库 + 自定义提示词（"越问越准"） | 无 few-shot 机制 | **FreeReport 最大差距**：无法通过示例校准 LLM 输出 |
| **数据源** | 通用关系型数据库（MySQL/PG/Oracle/ClickHouse/Hive 等 10+） | 仅本系统 MySQL（固定表结构） | FreeReport 是业务系统内置问数，非通用 BI 工具 |
| **权限模型** | 工作空间隔离 + 行权限 + 列权限（细粒度） | 部门级数据隔离 + 角色矩阵 + 敏感字段过滤 | FreeReport 权限与业务流程深度耦合 |
| **流式输出** | 支持 SSE 流式 | 支持 SSE 流式（打字机效果） | 两者均已实现 |
| **安全防御** | CVE 修复历史（SQL 注入/提示注入/权限提升/SSRF/RCE） | 8 层纵深防御（输入/权限/上下文/历史/频率/审计/UI/测试） | FreeReport 主动安全设计更系统化 |
| **对话管理** | 多对话窗口 + 标题自动生成 + 上下文数量配置 | 单对话流 + 历史净化（仅保留 user 消息） | SQLBot 对话管理更成熟 |
| **集成能力** | Web 嵌入 + 弹窗嵌入 + MCP 调用 + n8n/Dify/MaxKB/DataEase 集成 | 无嵌入能力 | SQLBot 定位为可嵌入组件 |

---

## 二、SQLBot 核心设计要点

### 2.1 RAG 检索增强生成

SQLBot 的核心创新在于使用向量嵌入（embedding）技术匹配用户问题与数据源 schema：

```
用户问题 → embedding 向量化
                    ↓
            余弦相似度计算
                    ↓
        匹配 top-K 最相关的数据表结构
                    ↓
        将匹配的 schema 作为 LLM 上下文
                    ↓
            LLM 生成 SQL 查询语句
                    ↓
            执行 SQL → 返回结果 + 可视化
```

**优势**：当数据源有数百张表时，不需要把全部 schema 塞入 prompt，只注入最相关的几张表的结构，减少 token 消耗并提高准确率。

### 2.2 SQL 示例库（"越问越准"）

SQLBot 允许管理员维护一组「问题 → SQL」的示例对。当用户提问时，系统会：
1. 计算用户问题与已有示例问题的相似度
2. 将最匹配的示例 SQL 作为 few-shot 注入 prompt
3. LLM 参照示例生成更精准的 SQL

这是 SQLBot "越问越准" 的核心机制——通过持续积累高质量的 SQL 示例，系统的问数准确率随使用逐步提升。

### 2.3 术语库

管理员可维护业务术语映射（如"营收" → `SUM(revenue)`），术语在 prompt 构建时自动注入，帮助 LLM 理解业务黑话。

### 2.4 工作空间与行/列权限

- **工作空间隔离**：不同业务单元在独立工作空间内管理数据源、对话、SQL 示例
- **行权限**：按用户/角色过滤数据行（如某用户只能看本部门数据）
- **列权限**：按用户/角色隐藏敏感列（如某用户不能看薪酬列）

### 2.5 数据预测

SQLBot v1.1+ 支持基于历史数据的趋势预测（时间序列预测），在图表中展示预测线。

---

## 三、FreeReport 智能问数当前实现分析

### 3.1 双阶段 LLM 架构

```
用户问题
    ↓
[阶段一] LLM 计划生成
    ↓ 输出 JSON 计划（template_id, periods, metrics, dimension, aggregation）
    ↓
白名单校验（模板/指标/周期必须落在用户可见范围内）
    ↓
AggregationService 取数（复用已有聚合引擎，含权限校验）
    ↓
[阶段二] LLM 结论生成（流式 SSE）
    ↓ 输出文字结论 + 图表 + 表格
```

**设计亮点**：
- LLM 不生成 SQL，取数走已有聚合引擎的安全路径
- 白名单校验确保 LLM 输出不会越权
- 运营统计类问题（各部门下发/各机构填报）规则识别直接作答，不消耗 LLM 调用
- SSE 流式输出打字机效果，用户体验好

### 3.2 安全防御体系（8 层纵深）

| 层 | 实现 | 对标 SQLBot |
|----|------|-------------|
| 输入层 | `sanitizeQuestion()` 长度截断 500 字 + 协议标记正则过滤 + 70% 阈值拒绝 | SQLBot 有 CVE-2026-33324 提示词注入修复，但未做主动过滤 |
| 权限层 | Controller + Service 双层权限校验 | SQLBot 工作空间隔离 + 行/列权限 |
| 上下文层 | sensitive 过滤 + aiQueryEnabled 过滤 | SQLBot 列权限 |
| 历史层 | 丢弃 assistant 消息 + user 截断 300 字 | SQLBot 可配置上下文数量 |
| 频率层 | 20 次/小时/用户滑动窗口 + 并发限 1 | SQLBot 无频率限制 |
| 审计层 | AiAuditContext 全量记录 | SQLBot 有操作日志（X-Pack） |
| UI 层 | 模板 AI 开关 + 字段敏感标记 | SQLBot 数据表启用/禁用 |
| 测试层 | 35 项 JUnit（含 10 项安全专项） | SQLBot 无公开测试 |

### 3.3 当前局限性

1. **无 few-shot 校准**：LLM 输出质量完全依赖模型能力，无法通过示例积累提升
2. **全量 prompt 注入**：30 个模板 × 指标 + 周期全量写入 prompt，token 消耗大
3. **无术语库**：业务术语（如"营收""在手订单"）无法映射到字段，LLM 可能理解偏差
4. **无向量检索**：模板匹配靠 LLM 从全量清单中选，准确率随模板数量增长而下降
5. **无对话标题**：多轮对话缺少标题管理，历史回顾困难
6. **无数据预测**：不支持趋势预测分析
7. **单对话流**：不支持多对话窗口管理
8. **无执行详情**：用户无法查看 token 消耗、执行时间等指标

---

## 四、合理化建议

以下建议按**投入产出比**排序，高价值低成本的优先：

### 建议 1：引入查询示例库（对标 SQLBot 的 SQL 示例，高优先级）

**痛点**：当前 LLM 输出质量完全依赖模型能力，遇到复杂问题（如"按品牌分组统计在手量的平均值"）时可能选错指标或维度。

**方案**：在 `report_templates` 旁新增 `ai_query_examples` 表，存储「问题 → 查询计划 JSON」示例对：

```sql
CREATE TABLE ai_query_examples (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    template_id BIGINT NOT NULL,
    question    VARCHAR(500) NOT NULL,
    plan_json   TEXT NOT NULL,      -- 与 AiPlanResolver 输出一致的 JSON
    enabled     TINYINT(1) DEFAULT 1,
    sort_order  INT DEFAULT 0,
    created_by  BIGINT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

在 `AiPlanResolver.buildPlanMessages()` 中，将匹配度最高的 2~3 条示例作为 few-shot 注入 system prompt：

```
参考示例：
问题："各机构本期数据对比" → 计划：{"template_id":4,"dimension":"company",...}
问题："按品牌分组的平均在手量" → 计划：{"template_id":4,"dimension":"field","group_by_field":"brand",...}
```

**收益**：
- "越问越准"——管理员积累优质示例后，同类问题的准确率显著提升
- 复杂分组/聚合场景的输出质量可控
- 成本低：仅需 1 张表 + prompt 注入逻辑 + 管理界面

### 建议 2：引入术语库（对标 SQLBot 术语库，高优先级）

**痛点**：字段标签（如 `field_c9au6l` 标签"年初余额"）对 LLM 来说不够直观，业务人员说"在手量"但字段叫"current_holdings"，LLM 可能匹配不上。

**方案**：新增 `ai_query_terms` 表，存储业务术语 → 字段映射：

```sql
CREATE TABLE ai_query_terms (
    id           BIGINT PRIMARY KEY AUTO_INCREMENT,
    template_id  BIGINT,       -- NULL 表示全局术语
    term         VARCHAR(100) NOT NULL,  -- "在手量"
    mapping      VARCHAR(500) NOT NULL,  -- "field_c9au6l（年初余额）"
    enabled      TINYINT(1) DEFAULT 1,
    sort_order   INT DEFAULT 0
);
```

在 `AiPlanResolver.buildPlanMessages()` 的 system prompt 中追加术语段：

```
业务术语对照：
- 在手量 → 年初余额
- 营收 → 营业收入合计
- 完成率 → 已签收 ÷ 任务数
```

**收益**：
- LLM 能理解业务黑话，减少"无法理解"的回复
- 术语可按模板/全局配置，灵活度高
- 成本极低：1 张表 + prompt 追加

### 建议 3：prompt 精选优化（对标 SQLBot 向量检索，中优先级）

**痛点**：当前 30 个模板全量注入 prompt，当模板数增长到 50+ 时 token 消耗大且 LLM 容易选错。

**方案**：两阶段精选——
1. **快速预筛**：用关键词匹配（模板名包含用户问题中的词）缩小候选范围到 5~10 个
2. **全量注入精选结果**：只把候选模板的指标/周期注入 prompt

无需引入向量数据库，关键词匹配 + 倒排索引即可实现 80% 的效果。

**收益**：
- prompt token 消耗降低 60%+
- LLM 选择准确率提升（候选少 → 干扰少）
- 成本中等：需改 `AiQueryContextBuilder` 的 context 组装逻辑

### 建议 4：对话标题自动生成（对标 SQLBot，低优先级）

**痛点**：当前多轮对话无标题，用户无法快速回顾历史对话。

**方案**：在第一轮问数完成后，用 LLM 生成一个 ≤15 字的对话标题，存储在前端 `sessionStorage`（或后端 `ai_query_conversations` 表）。

```
用户问题："2026年07月各机构总收入" → 标题："7月各机构收入对比"
```

**收益**：
- 多轮对话管理体验显著提升
- 成本低：前端改动为主，可先用 sessionStorage 不新增表

### 建议 5：执行详情面板（对标 SQLBot 执行详情，低优先级）

**痛点**：用户无法了解问数耗时和 token 消耗，不利于优化提问方式。

**方案**：在 SSE 的 `done` 事件中追加执行详情：

```json
{
  "event": "done",
  "data": {
    "elapsed_ms": 8523,
    "plan_tokens": 1250,
    "summary_tokens": 380,
    "model": "qwen3.6:latest"
  }
}
```

前端在消息底部以小字展示「耗时 8.5s · 消耗 1630 tokens」。

**收益**：
- 透明度提升，用户可自行优化提问
- 成本低：后端已有 `System.currentTimeMillis()` 计时，token 数从 LLM 响应头可取

### 建议 6：数据预测能力（对标 SQLBot 数据预测，中优先级）

**痛点**：当前仅支持历史数据查询和对比，无法预测趋势。

**方案**：当 `dimension="period"` 且周期数 ≥ 3 时，在图表上追加一条预测线（简单线性回归或移动平均）：

```
实际值：●——●——●——●
预测值：              ○──○──○（虚线）
```

前端 `recharts` 已支持 `Line` 的 `strokeDasharray` 属性，无需新增依赖。

**收益**：
- 分析能力从"回顾"扩展到"前瞻"
- 成本中等：需在前端添加预测计算逻辑（简单回归）+ 图表渲染

### 建议 7：多对话窗口管理（对标 SQLBot 多对话，低优先级）

**痛点**：当前为单对话流，切换话题时历史上下文可能干扰。

**方案**：前端新增对话列表侧边栏，每个对话独立维护 messages 数组，存储在 `sessionStorage`。点击「新建对话」清空当前流。

**收益**：
- 话题隔离，避免上下文串扰
- 成本低：纯前端改动，无需后端表

### 建议 8：自定义提示词（对标 SQLBot 自定义提示词，中优先级）

**痛点**：当前 system prompt 硬编码在 `AiPlanResolver` 中，不同部门/场景可能需要定制化提示。

**方案**：新增 `ai_query_prompts` 表，存储可覆盖的 system prompt 片段：

```sql
CREATE TABLE ai_query_prompts (
    id           BIGINT PRIMARY KEY AUTO_INCREMENT,
    name         VARCHAR(100) NOT NULL,
    prompt_text  TEXT NOT NULL,
    scope        VARCHAR(50),  -- 'plan' / 'summary' / 'system_prefix'
    template_id  BIGINT,       -- NULL = 全局
    enabled      TINYINT(1) DEFAULT 1
);
```

`AiPlanResolver` 读取时优先使用自定义提示词，无配置时回退到硬编码默认值。

**收益**：
- 不同业务场景可定制 LLM 行为
- 管理员无需改代码即可调优

---

## 五、不建议引入的功能

| 功能 | 原因 |
|------|------|
| Text-to-SQL 直接生成 SQL | FreeReport 是业务系统不是通用 BI 工具，已有聚合引擎的权限校验路径比 LLM 生成的 SQL 更安全；SQLBot 的 CVE 修复历史也证明 Text-to-SQL 路径的安全风险持续存在 |
| 向量数据库（如 Chroma/Milvus） | FreeReport 模板数量级在 10~50 范围，全量注入 prompt 完全可控；引入向量数据库增加运维成本远大于收益 |
| MCP 协议支持 | FreeReport 是独立业务系统，不是需要被其他 AI 应用调用的工具平台 |
| 多数据源支持 | FreeReport 的数据模型与业务流程（模板→下发→填报→审批→汇总）深度耦合，不支持外接任意数据库 |
| 工作空间隔离 | FreeReport 已有三级组织架构（总部→部门→分公司）+ 角色矩阵，比工作空间模型更贴合业务场景 |

---

## 六、优先级排序与实施路线图

| 优先级 | 建议 | 预计工时 | 价值 |
|--------|------|----------|------|
| **P0** | 查询示例库（few-shot 校准） | 2~3 天 | 准确率提升最显著，"越问越准" |
| **P0** | 术语库 | 1~2 天 | 业务术语理解，减少"无法理解"回复 |
| **P1** | prompt 精选优化 | 1~2 天 | token 消耗降低，大模板量时准确率保障 |
| **P1** | 自定义提示词 | 2 天 | 运营可调优，无需开发介入 |
| **P2** | 对话标题 | 0.5 天 | 多轮对话体验 |
| **P2** | 执行详情 | 0.5 天 | 透明度提升 |
| **P2** | 多对话窗口 | 1 天 | 话题隔离 |
| **P3** | 数据预测 | 1~2 天 | 分析能力扩展 |

**建议先做 P0（查询示例库 + 术语库）**，这两项改动最小但效果最显著，能让智能问数从"能用"提升到"好用"。

---

*本报告仅供参考，不修改任何代码。*
