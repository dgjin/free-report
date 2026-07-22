# FreeReport 私有化部署

FreeReport 是 React + Express + MySQL 的企业报表填报、审批和汇总应用。本版本面向本地或内网私有化运行，不依赖 Cloudflare。

## 运行要求

- Node.js 22+
- MySQL 8.0+
- 一个空数据库和具备建表、读写权限的应用账号

MySQL 应使用 `utf8mb4`。生产环境建议数据库只允许应用服务器所在内网访问，并定期备份。

## 1. 配置

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env`：

```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=free_report
MYSQL_USER=free_report_app
MYSQL_PASSWORD=数据库密码
MYSQL_SSL=false
MYSQL_CONNECTION_LIMIT=10
JWT_SECRET=至少 32 字节的随机字符串
PORT=3000
CORS_ORIGINS=http://localhost:3000
```

如果 MySQL 要求 TLS，设置 `MYSQL_SSL=true`。`.env` 已被 Git 忽略，禁止提交。

## 2. 初始化空库

安装依赖并创建表：

```bash
npm install
npm run db:migrate
```

需要演示账号和样例报表时，再显式执行：

```bash
npm run db:seed
```

所有演示账号初始密码为 `123456`。正式使用前必须修改或删除演示账号。

## 3. 启动

开发运行：

```bash
npm run dev
```

生产运行：

```bash
npm run build
NODE_ENV=production npm start
```

访问 `http://服务器地址:3000`，健康检查为 `GET /api/health`。应用会在监听端口前检查 MySQL 连接；配置缺失或连接失败时直接退出。

## 4. 数据库权限

推荐为应用创建独立账号，不授予全局管理权限。初始化阶段需要目标数据库内的 `CREATE`、`ALTER`、`INDEX`、`SELECT`、`INSERT`、`UPDATE`、`DELETE` 权限。建表完成后可撤销 `CREATE`、`ALTER` 和 `INDEX`。

## 5. 备份与恢复

备份：

```bash
mysqldump --single-transaction --routines --triggers free_report > free_report.sql
```

恢复到空库：

```bash
mysql free_report < free_report.sql
```

执行备份命令时通过 MySQL 客户端的安全凭据机制输入密码，不要把密码直接写进命令行或脚本。

## 6. 验证

```bash
npm test
npm run lint
npm run build
```

若配置了专用测试库 `MYSQL_TEST_DATABASE`，测试套件还会验证真实 MySQL 连通性。不要把生产数据库设置为测试库。
