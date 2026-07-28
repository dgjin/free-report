# 随手报 (ReportNow) 系统评估与优化建议

> 评估日期：2026-07-27
> 评估范围：全栈代码（React 19 前端 + Spring Boot 3.3.2 后端 + MySQL 数据库）

---

## 总体评分

| 维度 | 评分 | 说明 |
|------|:--:|------|
| 架构设计 | ⭐⭐⭐⭐☆ | 分层清晰，三级组织模型设计合理 |
| 后端代码 | ⭐⭐⭐⭐☆ | Spring Boot 标准实践，事务管理到位 |
| 前端代码 | ⭐⭐⭐☆☆ | 功能完善但代码体量失衡 |
| 数据库设计 | ⭐⭐⭐☆☆ | 基础设计良好，但存在演进债务 |
| 安全性 | ⭐⭐⭐☆☆ | JWT + 部门隔离到位，但有提升空间 |
| 可运维性 | ⭐⭐⭐☆☆ | 脚本完善但缺少可观测性 |

---

## 一、架构层面

### ✅ 优点

1. **三级审批流程设计完整**：经办→复核→审批→签收的链路清晰，支持跳过复核、任意环节驳回重提
2. **部门数据隔离**：通过 `owner_department_id` / `issuer_department_id` 实现行级访问控制，符合多租户设计
3. **"只增不减"策略**：模板字段只能停用不能物理删除，保证历史数据可追溯
4. **前端 SWR 缓存**：使用 `revalidateOnFocus: false` 避免频繁请求，钩子封装规范
5. **悲观锁**：`SELECT ... FOR UPDATE` 防止填报并发冲突

### ⚠️ 问题与建议

| # | 问题 | 建议 |
|---|------|------|
| 1 | **汇总计算依赖 Java 内存聚合**，`AggregationService` 在应用层做 SUM/COUNT/AVG，当分公司数量和数据量增长后会成为性能瓶颈 | 引入聚合预计算表或物化视图，`report_aggregations` 表已有 JSON 快照设计但未被充分利用，建议改为定时任务或触发器增量更新 |
| 2 | **缺少工作流引擎抽象**，审批流程硬编码在 `SubmissionService` 中，未来若扩展审批规则（如会签、金额阈值审批）需大幅改造 | 将审批状态机提取为独立的工作流服务，使用策略模式管理不同审批节点 |
| 3 | **汇总与下发缺少时间窗口约束**，理论上可以在截止日期前发起汇总或提前强制收回 | 加入 deadline 校验，超期任务应阻止填报，汇总前检查是否所有分公司已提交 |

---

## 二、前端代码质量

### ✅ 优点

1. **React 19 + lazy 路由分割**：按页面拆分 chunk，首屏加载快
2. **Toast/Confirm 系统**：统一的弹窗工具类，交互一致性好
3. **Excel 导入/导出**：前端解析 + 模板匹配，体验流畅

### ⚠️ 问题与建议

| # | 文件 | 问题 | 建议 |
|---|------|------|------|
| 1 | `Dashboard.tsx` (~42KB) | 单文件过大，包含工作台首页、签收弹窗、任务列表、帮助弹窗等多种职责 | 拆分为 `DashboardStats`、`PendingReceiptModal`、`TaskList`、`HelpGuideDrawer` 等子组件 |
| 2 | `ReportFill.tsx` (~43KB) | 同样巨大，包含汇总表单、明细表格、交叉表、Excel 导入、审批流展示 | 拆分为 `SummaryForm`、`DetailTable`、`CrossTable`、`ImportModal`、`ApprovalTimeline` |
| 3 | `AggregationView.tsx` (~41KB) | 四个 Tab 全在一个文件 | 每个 Tab 提取为独立组件，使用 `React.lazy` 按需加载 |
| 4 | `api.ts` 中使用 `any` 类型过多 | 多个方法返回 `any`，失去 TypeScript 类型安全 | 为所有 API 响应定义明确的 DTO 类型 |
| 5 | `request()` 函数中 401 处理用 `window.location.href` 会导致 React 应用重新加载 | 硬跳转丢失应用状态 | 改用 React Router 的 `navigate('/login')` 或事件总线通知 |
| 6 | **缺少前端错误边界 (Error Boundary)** | 组件崩溃会导致白屏 | 为 `Layout` 和关键页面添加 `ErrorBoundary` |

---

## 三、后端代码质量

### ✅ 优点

1. `@Transactional` 事务注解使用正确，Service 层聚合多个 Mapper 操作
2. 统一异常处理 `GlobalExceptionHandler` + `DomainException`，API 响应格式一致
3. MyBatis 混合模式（注解 + XML），查询灵活

### ⚠️ 问题与建议

| # | 文件 | 问题 | 建议 |
|---|------|------|------|
| 1 | `SubmissionService.java` (~20KB) | 单个 Service 方法过于庞大，`createOrUpdateSubmission` 承担了权限检查、状态校验、审批流程创建、数据持久化等多重职责 | 拆分为：权限校验层 → 状态机层 → 持久化层，遵循单一职责原则 |
| 2 | `AggregationService.java` (~18KB) | 汇总计算在 Java 内存中通过 Stream 聚合，N+1 查询问题明显——先查 assignments，再逐个查 submissions，再逐个查 submission_data | 使用 SQL 聚合函数一次性完成计算：`GROUP BY` + `SUM`/`COUNT`/`AVG`，将汇总逻辑下沉到数据库 |
| 3 | `SecurityUtils` 注入 `HttpServletRequest` | 作为 `@Component` 注入 request，依赖 Web 上下文，无法在非 Web 场景（如定时任务、测试）中使用 | 改用 `SecurityContextHolder` 或 `RequestContextHolder` 获取当前用户 |
| 4 | **缺少接口幂等性** | 重复提交可能创建重复审批记录 | 为提交接口添加幂等键（如 submission_id + version） |
| 5 | **缺少操作日志/审计** | 除 `assignment_recalls` 外，模板编辑、用户权限变更等重要操作无审计记录 | 引入 Spring AOP 切面记录关键业务操作日志 |

---

## 四、数据库设计

### ✅ 优点

1. 表结构清晰，外键约束完整
2. `uq_assignment_period` 唯一约束防止重复下发
3. `ON DELETE CASCADE` 保证数据一致性
4. 索引覆盖常见查询场景

### ⚠️ 问题与建议

| # | 问题 | 建议 |
|---|------|------|
| 1 | **SQL 迁移存在版本漂移**：`001_schema.sql` 的 `report_assignments.status` ENUM 不含 `pending_receipt`/`received`/`returned`/`recalled`；`report_submissions.status` 不含 `pending_receipt`/`returned`；`companies.level` 不含 `department`。这些通过后续 004、007 迁移修补 | 生成一份完整的当前 schema DDL 作为参考文档，避免新人困惑 |
| 2 | `report_submission_data.value` 为 `TEXT` 类型，数值字段也存储为字符串 | 数值型数据建议增加 `numeric_value DECIMAL` 冗余列，直接支持 SQL 聚合 |
| 3 | 缺少软删除机制 | `companies`/`users` 只有 `status` 字段做逻辑禁用，但没有 `deleted_at` 软删除标记，删除操作不可逆 |
| 4 | **缺少数据归档策略** | 随着时间推移 `report_submission_data` 表会快速增长 | 按周期分区（MySQL Partition）或定期归档历史数据 |

---

## 五、安全性

### ✅ 优点

1. JWT 无状态认证，bcrypt 密码加密
2. 部门级数据隔离，行级访问控制
3. 模板管理权限双重校验（前端路由 + 后端 Service）

### ⚠️ 问题与建议

| # | 问题 | 建议 |
|---|------|------|
| 1 | **JWT 无刷新机制**，token 24h 过期后必须重新登录 | 增加 refresh token 或滑动过期策略 |
| 2 | **开发环境默认密码 `123456` 硬编码在前端** | 移除默认密码，使用环境变量注入或开发模式单独处理 |
| 3 | 种子数据中所有用户密码相同 | 生产环境部署时建议提供密码随机化脚本 |
| 4 | `CORS` 配置需确认生产环境收紧 | 确保 `allowedOrigins` 不为 `*` |

---

## 六、性能优化建议

### 短期（1-2 周可落地）

| 优先级 | 优化项 | 预期收益 |
|:--:|------|------|
| 🔴 | `AggregationService` 汇总计算下沉到 SQL | 汇总页面加载时间减少 50-70% |
| 🔴 | 大组件拆分 + `React.memo` 优化渲染 | 减少填报页不必要的重渲染 |
| 🟡 | 模板列表/任务列表增加分页（当前可能全量返回） | 控制前后端数据传输量 |
| 🟡 | `report_assignments` 增加 `template_id + period_label` 联合索引 | 加速汇总查询 |

### 中期（1 月内）

| 优先级 | 优化项 |
|:--:|------|
| 🟡 | 引入 Redis 缓存热点数据（模板字段、机构树） |
| 🟡 | 后端增加 API 响应压缩 (gzip) |
| 🟢 | 前端大列表使用虚拟滚动（`react-window`） |

---

## 七、业务报表专业建议

作为报表业务系统，以下功能建议可提升产品竞争力：

1. **数据校验规则引擎**：当前字段只有 `required` 校验，建议增加交叉校验（如 "A > B 时提示"）、阈值告警（如 "销售额 < 0"）
2. **同比/环比分析**：汇总视图增加与历史周期的对比计算
3. **报表打印/PDF 导出**：当前只有 Excel 导出，增加正式报表格式的 PDF 输出
4. **填报提醒**：截止日期前自动提醒未填报机构（钉钉/企微/邮件）
5. **模板版本管理**：模板修改后，历史下发任务应绑定当时的模板快照，而非引用最新模板字段

---

## 总结

该项目整体架构合理，核心业务流程（三级审批、部门隔离、汇总报表）实现完整，已具备生产可用能力。主要改进方向集中在：**大型组件拆分**、**汇总计算性能优化**、**API 类型安全**和**可观测性建设**。建议按优先级分阶段推进，短期可快速见效的 SQL 下沉优化和组件拆分值得优先投入。
