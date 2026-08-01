# 随手报 ReportNow 私有化部署

随手报（ReportNow）是面向企业私有化部署的报表填报、审批和汇总系统，采用 React + Spring Boot + MySQL 技术栈。

## 技术架构

- **前端**：React 19 + Vite + Tailwind CSS（端口 3000）
- **后端**：Spring Boot 3.3.2 + Java 17 + MyBatis 3.0.3（端口 3001）
- **数据库**：MySQL 8.0+（utf8mb4）

## 运行要求

- Node.js 22+（前端构建）
- JDK 17+（Spring Boot 后端）
- Maven 3.8+（后端构建）
- MySQL 8.0+
- 一个空数据库和具备建表、读写权限的应用账号

## 1. 配置

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env`（前端开发代理用）：

```dotenv
# 前端 Vite 代理目标（Spring Boot 后端地址）
VITE_API_BASE_URL=http://localhost:3001
```

编辑 `server-springboot/src/main/resources/application.yml`（后端数据库配置）：

```yaml
spring:
  datasource:
    url: jdbc:mysql://${MYSQL_HOST:localhost}:${MYSQL_PORT:3306}/${MYSQL_DATABASE:freereport}?useSSL=${MYSQL_SSL:false}&serverTimezone=UTC&characterEncoding=UTF-8&allowPublicKeyRetrieval=true
    username: ${MYSQL_USER:freereport}
    password: ${MYSQL_PASSWORD:freereport123}

jwt:
  secret: ${JWT_SECRET:your-jwt-secret-here}
  expiration: 86400000

cors:
  allowed-origins: ${CORS_ORIGINS:http://localhost:5173,http://localhost:3000}
```

生产环境建议数据库只允许应用服务器所在内网访问，并定期备份。

## 2. 初始化数据库

安装前端依赖：

```bash
npm install
```

执行 SQL 迁移脚本创建表结构和初始数据。注意迁移顺序：`002_seed.sql` 依赖 `004` 的 `owner_department_id` 列与 `department` 级别、`008` 的 `digital_admin` 角色与 `pending_approval` 状态，因此必须放在结构与枚举迁移之后；`003`/`005` 是种子数据修正与 backfill，同样必须在 `002` 之后。

```bash
# 推荐顺序（不可打乱）：
# 结构演进 → 索引/枚举扩展 → 种子数据 → 数据修正与 backfill
for f in \
  sql/001_schema.sql \
  sql/004_department_reporting.sql \
  sql/006_performance_indexes.sql \
  sql/007_recall_and_onetime.sql \
  sql/008_template_approval.sql \
  sql/009_template_schedule.sql \
  sql/010_query_optimization.sql \
  sql/002_seed.sql \
  sql/003_fix_vehicle_detail_fields.sql \
  sql/005_department_admin_backfill.sql; do
  mysql -u freereport -p freereport < "$f"
done
```

如需从零重置数据库（清除全部业务数据）：

```bash
mysql -u freereport -p -e "DROP DATABASE IF EXISTS freereport; CREATE DATABASE freereport CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
# 然后执行上面的迁移脚本
```

所有演示账号初始密码为 `123456`。正式使用前必须修改或删除演示账号。

模板审批流程：部门报表管理员创建模板后为草稿状态，需提交数智化转型办公室（演示账号 `digital_admin`）审批，通过发布后方可下发填报任务。

## 3. 启动

### 开发模式

启动 Spring Boot 后端：

```bash
cd server-springboot
./mvnw spring-boot:run
# 或
mvn spring-boot:run
```

启动前端开发服务器（另一个终端）：

```bash
npm run dev
```

访问 `http://localhost:3000`，API 代理到 `http://localhost:3001`。

### 生产部署

构建前端：

```bash
npm run build
```

构建并运行 Spring Boot：

```bash
cd server-springboot
mvn clean package -DskipTests
java -jar target/free-report-server-1.0.0.jar
```

健康检查：`GET /api/health`

## 4. 数据库权限

推荐为应用创建独立账号，不授予全局管理权限。初始化阶段需要目标数据库内的 `CREATE`、`ALTER`、`INDEX`、`SELECT`、`INSERT`、`UPDATE`、`DELETE` 权限。建表完成后可撤销 `CREATE`、`ALTER` 和 `INDEX`。

## 5. 备份与恢复

备份：

```bash
mysqldump --single-transaction --routines --triggers freereport > freereport_backup.sql
```

恢复到空库：

```bash
mysql freereport < freereport_backup.sql
```

执行备份命令时通过 MySQL 客户端的安全凭据机制输入密码，不要把密码直接写进命令行或脚本。

## 6. 验证

前端类型检查：

```bash
npm run lint
npm run build
```

后端编译：

```bash
cd server-springboot
mvn compile
```

## 7. 安全加固

- JWT Secret 使用至少 32 字节的随机字符串
- 生产环境设置 `CORS_ORIGINS` 为具体域名，不要通配
- MySQL 密码使用强密码，定期更换
- 数据库只允许应用服务器内网访问
- 定期执行 `mvn dependency:check` 检查依赖漏洞

## 8. 核心功能

### 报表全生命周期
- **模板管理**：支持汇总指标、明细行、二维交叉表三种数据区域，字段只增不减设计规范
- **模板审批**：部门创建 → 数智化转型办公室审批 → 发布下发
- **任务下发**：支持周期性自动下发与一次性下发，可配置周期计划
- **填报提交**：分公司经办人在线填报，支持 Excel 批量导入明细
- **三级审批**：经办人 → 复核人 → 审批人 → 部门签收
- **汇总报表**：多机构对比、明细穿透、填报进度统计，支持导出 Excel

### 智能问数
- 自然语言提问，自动定位报表、周期与指标
- 生成文字结论、图表与数据明细
- 支持多轮对话追问
- 结果可下载为 Excel（含图表数据）

### AI 智能帮助
- 帮助抽屉内置对话式 AI 问答
- 基于系统帮助文档知识库（角色权限、审批流程、操作指南、模板设计、FAQ）
- 输入自然语言问题，快速获得准确解答
- 支持多轮对话追问

### 权限与安全
- **角色隔离**：超级管理员、数智化转型办公室、部门报表管理员、分公司经办人、复核人/审批人
- **模板隔离**：各部门模板相互隔离，跨部门访问返回 404 防遍历探测
- **智能问数权限分档**：超管与数智办仅限运营统计查询，具体报表数值仅部门管理员可问
- **只读模式**：数智化转型办公室可查看模板但不可编辑其他部门模板

### 审批体验优化
- 签收/复核/审批弹窗：审批流程与操作按钮置顶，无需滚动即可处理
- 明细数据分页：每页 10 行，支持翻页浏览
- 审批时间线：可视化展示审批流转历史
