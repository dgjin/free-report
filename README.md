# FreeReport 私有化部署

FreeReport 是面向企业私有化部署的报表填报、审批和汇总系统，采用 React + Spring Boot + MySQL 技术栈。

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

执行 SQL 迁移脚本创建表结构和初始数据：

```bash
# 按顺序执行
mysql -u freereport -p freereport < sql/001_schema.sql
mysql -u freereport -p freereport < sql/002_seed.sql
mysql -u freereport -p freereport < sql/003_fix_vehicle_detail_fields.sql
mysql -u freereport -p freereport < sql/004_department_reporting.sql
mysql -u freereport -p freereport < sql/005_department_admin_backfill.sql
mysql -u freereport -p freereport < sql/006_performance_indexes.sql
mysql -u freereport -p freereport < sql/007_recall_and_onetime.sql
```

所有演示账号初始密码为 `123456`。正式使用前必须修改或删除演示账号。

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
