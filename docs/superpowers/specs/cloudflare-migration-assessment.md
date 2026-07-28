# FreeReport 云端迁移评估报告：Spring Boot + MySQL → Cloudflare Pages + Workers + Supabase Postgres

> 评估日期：2026-07-26  
> 项目路径：`/Users/dgjin/Documents/Codex/2026-07-22/cong/free-report`  
> 当前栈：React 19 + Vite + Tailwind CSS v4（前端）/ Spring Boot 3.3.2 + MyBatis + MySQL 8.0（后端）  
> 目标栈：Cloudflare Pages + Cloudflare Workers + Supabase Postgres

---

## 1. 前端静态部署适配（Cloudflare Pages）

### 1.1 Vite 构建输出适配

当前 `vite.config.ts` 已配置 `build.rollupOptions.output.manualChunks`，将 `xlsx`、`motion`、`lucide-react`、`react-vendor` 拆分为独立 chunk。Cloudflare Pages 对静态资源的处理与 Vite 默认输出完全兼容，无需调整构建逻辑。

**需要新增的配置文件：**

```toml
# /Users/dgjin/Documents/Codex/2026-07-22/cong/free-report/wrangler.toml（前端部分仅作参考，Pages 以 Git 集成方式部署）
# 实际通过 Cloudflare Dashboard 或 GitHub Actions 绑定仓库自动构建
```

```toml
# /Users/dgjin/Documents/Codex/2026-07-22/cong/free-report/public/_headers
# 静态资源缓存策略：哈希化文件长期缓存，HTML 永不缓存
/*.js
  Cache-Control: public, max-age=31536000, immutable
/*.css
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache, no-store, must-revalidate
```

### 1.2 环境变量（API_BASE_URL 等）

当前前端代码中，`src/services/api.ts` 第 46-71 行的 `request` 函数直接使用相对路径 `/api/xxx` 发起请求。在 Vite 开发模式下，通过 `vite.config.ts` 第 33-38 行的 `server.proxy` 将 `/api` 代理到 `http://localhost:3001`。

迁移到 Cloudflare Pages 后，前端需要知道 Workers 的绝对 URL。推荐引入环境变量：

```typescript
// /Users/dgjin/Documents/Codex/2026-07-22/cong/free-report/src/services/api.ts（需修改）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // 拼接 base URL：本地为空（相对路径），生产为 Workers URL
  const fullUrl = API_BASE_URL ? `${API_BASE_URL}${url}` : url;
  const res = await fetch(fullUrl, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401) {
      removeToken();
      window.location.href = '/login';
    }
    throw new Error(data?.error || '请求服务出现异常');
  }
  return data as T;
}
```

```bash
# .env（本地开发，已存在，追加一行）
VITE_API_BASE_URL=
```

```bash
# .env.production（新建，用于 Cloudflare Pages 构建）
VITE_API_BASE_URL=https://free-report-api.your-subdomain.workers.dev
```

Cloudflare Pages 构建时会自动读取以 `VITE_` 开头的环境变量并注入到 `import.meta.env` 中。

### 1.3 SPA 路由回退配置

当前 `src/App.tsx` 使用 `BrowserRouter`，路由包括 `/login`、`/templates`、`/templates/:id`、`/assignments`、`/fill/:assignmentId` 等。静态托管需要将所有路径回退到 `index.html`。

**Cloudflare Pages 配置：**

```toml
# /Users/dgjin/Documents/Codex/2026-07-22/cong/free-report/public/_routes.toml
[[redirects]]
from = "/*"
to = "/index.html"
status = 200
```

或更精确地排除 API 和静态资源：

```toml
# /Users/dgjin/Documents/Codex/2026-07-22/cong/free-report/public/_routes.toml
[[redirects]]
from = "/api/*"
to = "/api/:splat"
status = 200

[[redirects]]
from = "/assets/*"
to = "/assets/:splat"
status = 200

[[redirects]]
from = "/*"
to = "/index.html"
status = 200
```

### 1.4 静态资源缓存策略

Vite 构建后的 `dist/` 目录结构：

```
dist/
├── index.html          # 入口 HTML，永不缓存
├── assets/
│   ├── index-xxx.js    # 带内容哈希，可长期缓存
│   ├── index-xxx.css
│   ├── xlsx-xxx.js
│   ├── motion-xxx.js
│   └── ...
```

Cloudflare Pages 默认对静态文件启用 CDN 缓存，但建议显式配置 `_headers` 文件（见 1.1）。

---

## 2. 后端 API 迁移方案

### 2.1 方案 A：Hono (TypeScript) on Workers + Supabase Postgres

**架构：**

```
Cloudflare Workers (Hono + TypeScript)
    ↓ 直连 TCP (Supabase pooling)
Supabase Postgres (PostgREST 可选，但推荐原始 SQL)
```

**优点：**

- 与前端同栈（TypeScript），维护成本低
- Workers 全球边缘部署，延迟低
- 按请求计费，空闲时零成本
- 可从现有 `express-backend` 分支直接移植业务逻辑
- `jose` + `bcryptjs` 均兼容 Workers Runtime

**缺点：**

- 需要重写数据访问层（MyBatis XML → 原始 SQL / pg 驱动）
- Workers 有 50MB 代码体积限制、30s 请求超时、无本地文件系统
- 无连接池（需使用 Supabase 的 connection pooling，如 PgBouncer）
- 事务处理需手动管理（`BEGIN` / `COMMIT` / `ROLLBACK`）

**工作量评估：**

| 模块 | 工作量 | 说明 |
|------|--------|------|
| 路由层（Hono）| 2-3 天 | 从 Express Router 迁移到 Hono，中间件模式类似 |
| 数据访问层（pg）| 5-7 天 | 重写 `server/src/db.ts` 中所有 SQL，替换 `mysql2/promise` 为 `pg` |
| 认证（JWT + bcrypt）| 1 天 | `jose` 替换 `jsonwebtoken`，`bcryptjs` 直接复用 |
| 类型定义 | 1 天 | 复用 `server/src/types.ts` |
| 测试与联调 | 3-4 天 | 端到端验证所有 API |
| **总计** | **12-15 天** | 单人全职 |

**从 Express 历史版本移植的具体路径：**

`express-backend` 分支保留了完整的 Express + mysql2 实现，文件结构：

```
server.ts              # Express 入口 + 路由挂载
server/src/
  auth.ts              # JWT 签发/验证 + 权限中间件
  db.ts                # Database 类，所有 SQL 操作
  mysql.ts             # mysql2 Pool 配置
  types.ts             # 共享类型定义
  errors.ts            # DomainError
  department-policy.ts # 部门权限策略
  template-lifecycle.ts
  submission-workflow.ts
  routes/
    templates.ts
    companies.ts
    assignments.ts
    submissions.ts
    approvals.ts
    aggregations.ts
    users.ts
    receipts.ts
```

**移植步骤：**

1. **新建 `workers/` 目录**，初始化 Hono 项目：

```bash
npm create cloudflare@latest workers -- --template hono
```

2. **替换数据库驱动**：将 `mysql2/promise` 替换为 `pg`（Cloudflare Workers 原生支持 `pg` 通过 TCP 连接，或使用 `@supabase/supabase-js` 的 REST API）。推荐直接使用 `pg` + connection string：

```typescript
// workers/src/db.ts
import { Client } from 'pg';

export async function withClient<T>(callback: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
```

3. **逐文件移植路由**：以 `server/src/routes/templates.ts` 为例，Express 的 `Router.get('/', authenticate, async (req, res) => {...})` 对应 Hono：

```typescript
// workers/src/routes/templates.ts
import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import { db } from '../db';

const app = new Hono();

app.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const templates = await db.getTemplatesForUser(user);
  // ... 复用 express-backend 中的业务逻辑
  return c.json(result);
});

export default app;
```

4. **复用核心逻辑**：`db.ts` 中的 SQL 语句需要修改语法（MySQL → Postgres，见第 3 节），但业务逻辑（如 `lockWritableTemplate`、`transaction`）可直接复用。

### 2.2 方案 B：保留 Java Spring Boot，部署到 Render/Railway

**架构：**

```
Cloudflare Pages（前端静态）
    ↓ CORS / 反向代理
Render / Railway（Spring Boot JAR）
    ↓ JDBC
Supabase Postgres / 保留 MySQL
```

**优点：**

- 后端代码零改动，立即部署
- MyBatis XML、Spring Security、JWT 等全部保留
- 适合快速验证、过渡期使用

**缺点：**

- Render/Railway 免费实例有休眠机制（30 分钟无请求后休眠，下次请求冷启动 10-30 秒）
- 付费实例 $7-25/月，持续运行有成本
- 需要处理 CORS 或配置反向代理
- 无法利用 Workers 的边缘部署优势
- 长期维护两套部署基础设施

**工作量：**

- 部署配置：1 天（Dockerfile 或原生 JAR 部署）
- 数据库迁移（如需 Postgres）：3-5 天
- CORS / 网络联调：1 天
- **总计：5-7 天**

### 2.3 方案对比

| 维度 | 方案 A：Hono on Workers | 方案 B：保留 Java on Render |
|------|------------------------|---------------------------|
| 开发工作量 | 12-15 天 | 5-7 天 |
| 月度成本 | $0（Workers 免费额度 100k/天）+ Supabase 免费层 | $7-25/月（Render）+ 数据库 |
| 冷启动 | 无（Workers 边缘启动 < 1ms） | 有（免费实例休眠后 10-30s） |
| 维护成本 | 低（全栈 TS，前后端统一） | 高（Java 运行时 + TS 前端） |
| 可扩展性 | 高（自动扩展） | 中（受限于实例规格） |
| 长期推荐度 | ★★★★★ | ★★☆☆☆（仅适合过渡） |

**推荐：方案 A（Hono on Workers）**，虽然初期工作量大，但长期维护成本最低，且与 Cloudflare 生态深度整合。

---

## 3. 数据库迁移策略

### 3.1 MySQL schema → Postgres schema 语法差异

基于 `sql/001_schema.sql` 的实际差异：

| MySQL 特性 | Postgres 等价 | 涉及文件 |
|-----------|--------------|---------|
| `BIGINT UNSIGNED AUTO_INCREMENT` | `BIGSERIAL PRIMARY KEY` | 001_schema.sql 所有表 |
| `ENUM(...)` | `VARCHAR` + CHECK 约束，或自定义 TYPE | 001_schema.sql 多表 |
| `JSON` | `JSONB`（推荐，支持索引） | report_template_fields.field_config, report_aggregations.aggregated_data |
| `DATETIME(3)` | `TIMESTAMP(3)` | 所有 created_at/updated_at |
| `CURRENT_TIMESTAMP(3)` | `CURRENT_TIMESTAMP(3)` | 相同 |
| `ON UPDATE CURRENT_TIMESTAMP(3)` | 需触发器或应用层更新 | report_templates.updated_at, approval_records.updated_at |
| `TEXT` | `TEXT` | 相同 |
| `TINYINT(1)` | `BOOLEAN` | 007_recall_and_onetime.sql |
| `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` | 删除（Postgres 默认 UTF8） | 所有 CREATE TABLE |
| `INDEX idx_...` | `CREATE INDEX` | 相同 |
| `UNIQUE KEY` | `UNIQUE` | 相同 |
| `INSERT IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` | 002_seed.sql |
| `JSON_OBJECT(...)` / `JSON_ARRAY(...)` | `jsonb_build_object(...)` / `ARRAY[...]::jsonb` | 002_seed.sql |
| `ON DUPLICATE KEY UPDATE` | `INSERT ... ON CONFLICT (...) DO UPDATE` | 004_department_reporting.sql |
| `JOIN ... UPDATE` | `UPDATE ... FROM ...` | 003_fix_vehicle_detail_fields.sql |

### 3.2 7 个 SQL 文件的移植优先级

```
P0 - 必须先执行（schema 基础）
  └── 001_schema.sql          → 001_schema_pg.sql（核心表结构）

P1 - 功能扩展（依赖 P0）
  └── 004_department_reporting.sql → 004_department_reporting_pg.sql（部门报表体系）
  └── 007_recall_and_onetime.sql   → 007_recall_and_onetime_pg.sql（收回/一次性下发）

P2 - 数据修正（依赖 P0+P1）
  └── 003_fix_vehicle_detail_fields.sql → 003_fix_vehicle_detail_fields_pg.sql（业务数据修正）
  └── 005_department_admin_backfill.sql → 005_department_admin_backfill_pg.sql（角色回填）

P3 - 性能优化（可选，随时执行）
  └── 006_performance_indexes.sql       → 006_performance_indexes_pg.sql（索引）

P4 - 种子数据（最后执行）
  └── 002_seed.sql            → 002_seed_pg.sql（初始数据）
```

### 3.3 Supabase 初始化方案

**推荐：空库 + 种子数据**

原因：
- 当前系统为内部管理系统，数据量小（种子数据仅 8 家公司、14 个用户、2 个模板）
- 生产环境数据可通过管理界面重新录入，或编写一次性迁移脚本
- 避免处理 MySQL → Postgres 的数据类型转换边界问题

**初始化脚本：**

```sql
-- supabase/migrations/20260726000001_init.sql（001_schema_pg.sql 示例片段）
CREATE TYPE company_level AS ENUM ('headquarter', 'department', 'branch');
CREATE TYPE user_role AS ENUM ('super_admin', 'headquarter_admin', 'department_report_admin', 'branch_admin', 'handler', 'reviewer', 'approver');
CREATE TYPE template_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE assignment_status AS ENUM ('pending', 'filling', 'submitted', 'pending_receipt', 'received', 'returned', 'approved', 'aggregated', 'rejected', 'recalled');
CREATE TYPE submission_status AS ENUM ('draft', 'pending_review', 'pending_approval', 'pending_receipt', 'received', 'returned', 'approved', 'rejected');
CREATE TYPE approval_level AS ENUM ('handler', 'reviewer', 'approver');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE field_type AS ENUM ('text', 'number', 'date', 'select', 'textarea');
CREATE TYPE data_type AS ENUM ('summary', 'detail');
CREATE TYPE field_status AS ENUM ('active', 'inactive');
CREATE TYPE company_status AS ENUM ('active', 'inactive');

CREATE TABLE companies (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL UNIQUE,
  parent_id BIGINT NULL,
  level company_level NOT NULL,
  address VARCHAR(255) NULL,
  contact VARCHAR(80) NULL,
  phone VARCHAR(40) NULL,
  status company_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_companies_parent FOREIGN KEY (parent_id) REFERENCES companies(id)
);

-- ON UPDATE CURRENT_TIMESTAMP 需触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP(3);
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3.4 数据类型映射详表

| MySQL | Postgres | 备注 |
|-------|----------|------|
| `BIGINT UNSIGNED` | `BIGSERIAL` / `BIGINT` | `BIGSERIAL` 用于自增主键 |
| `INT UNSIGNED` | `INTEGER` | Postgres 无 UNSIGNED |
| `TINYINT(1)` | `BOOLEAN` | `is_one_time` 等布尔字段 |
| `ENUM(...)` | 自定义 `TYPE` 或 `VARCHAR` + `CHECK` | 推荐自定义 TYPE 保持约束 |
| `JSON` | `JSONB` | `JSONB` 支持 GIN 索引，查询更快 |
| `DATETIME(3)` | `TIMESTAMP(3)` | 毫秒精度保留 |
| `TEXT` | `TEXT` | 完全兼容 |
| `VARCHAR(n)` | `VARCHAR(n)` | 完全兼容 |
| `ON DELETE CASCADE` | `ON DELETE CASCADE` | 完全兼容 |

---

## 4. 认证方案

### 4.1 JWT 在 Workers 中的实现

当前 Spring Boot 使用 `io.jsonwebtoken:jjwt`（jjwt 0.12.6），JWT secret 为 Base64 编码字符串，HS256 签名。

**Workers 中必须使用 `jose` 库**（`jsonwebtoken` 依赖 Node.js `crypto` 模块，不兼容 Workers Runtime）：

```typescript
// workers/src/auth.ts
import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(env.JWT_SECRET); // 复用相同的 secret 字符串

export async function generateToken(user: AuthenticatedUser): Promise<string> {
  return new SignJWT({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    company_id: user.company_id,
    company_name: user.company_name,
    company_code: user.company_code,
    company_level: user.company_level,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<AuthenticatedUser> {
  const { payload } = await jwtVerify(token, SECRET, { clockTolerance: 60 });
  return {
    id: payload.id as number,
    username: payload.username as string,
    display_name: payload.display_name as string,
    company_id: payload.company_id as number,
    company_name: payload.company_name as string,
    company_code: payload.company_code as string,
    company_level: payload.company_level as string,
    role: payload.role as string,
  };
}
```

**关键兼容性说明：**

- Spring Boot 的 `jjwt` 和 Workers 的 `jose` 都支持 HS256，只要 secret 相同，token 可以互验
- Spring Boot 中 secret 是 Base64 解码后作为 HMAC key（`Keys.hmacShaKeyFor(Base64.getDecoder().decode(secret))`）
- `jose` 中直接使用 `new TextEncoder().encode(secret)` 将字符串编码为 Uint8Array
- **注意**：如果 secret 在 Spring Boot 中是 Base64 编码的，在 `jose` 中需要先 Base64 解码再编码，或直接使用原始字符串。当前 `.env` 中的 `JWT_SECRET=YjM2N2Y0ZWE4NzQ3YmJlYTdjNTkwYjRiOGU0MGM0OTg=` 是 Base64 字符串，建议 Workers 中也保持相同处理方式：

```typescript
import { base64url } from 'jose';
const rawSecret = base64url.decode(env.JWT_SECRET); // 与 Spring Boot 的 Base64.decode 对齐
```

### 4.2 密码哈希（bcryptjs 在 Workers 中的兼容性）

当前 Spring Boot 使用 `BCryptPasswordEncoder`（`spring-security-crypto`），Express 历史版本使用 `bcryptjs`。

**`bcryptjs` 是纯 JavaScript 实现，完全兼容 Cloudflare Workers Runtime**，无需任何调整：

```typescript
// workers/src/auth.ts
import bcrypt from 'bcryptjs';

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// 如需创建新用户（复用相同的 salt rounds）
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10); // Spring Boot 默认也是 10 rounds
}
```

**兼容性验证：** 当前 `002_seed.sql` 中的密码哈希 `$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu` 是由 `bcryptjs` 生成的，`BCryptPasswordEncoder` 可以验证，`bcryptjs` 也可以验证，双向兼容。

### 4.3 CORS 配置

当前 Spring Boot 通过 `application.yml` 第 42-43 行配置 CORS：

```yaml
cors:
  allowed-origins: ${CORS_ORIGINS:http://localhost:5173,http://localhost:3000}
```

Express 历史版本在 `server.ts` 中动态校验 origin。

**Workers 中 Hono 的 CORS 配置：**

```typescript
// workers/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use(cors({
  origin: (origin) => {
    const allowed = env.CORS_ORIGINS.split(',').map((o) => o.trim());
    return allowed.includes(origin) ? origin : allowed[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
}));
```

**生产环境 CORS_ORIGINS 值：**

```bash
# Workers secrets
wrangler secret put CORS_ORIGINS
# 输入: https://free-report.pages.dev,https://free-report.your-domain.com
```

---

## 5. 环境变量与 Secrets 管理

### 5.1 Wrangler secrets 配置

```bash
# 1. 初始化 wrangler（在 workers/ 目录下）
cd workers
npx wrangler login

# 2. 创建 Worker
npx wrangler init --from-dash free-report-api

# 3. 设置 secrets（不会进入 git，加密存储在 Cloudflare）
npx wrangler secret put JWT_SECRET
# 输入: YjM2N2Y0ZWE4NzQ3YmJlYTdjNTkwYjRiOGU0MGM0OTg=

npx wrangler secret put DATABASE_URL
# 输入: postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres?pgbouncer=true

npx wrangler secret put CORS_ORIGINS
# 输入: https://free-report.pages.dev

# 4. 非敏感配置放入 wrangler.toml
```

```toml
# workers/wrangler.toml
name = "free-report-api"
main = "src/index.ts"
compatibility_date = "2026-07-26"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "production"
```

### 5.2 Supabase connection string 安全存储

**绝对不要将 connection string 提交到 git。** 使用 Wrangler secrets：

```bash
npx wrangler secret put DATABASE_URL
```

**connection string 格式：**

```
postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres?pgbouncer=true
```

必须加 `?pgbouncer=true` 启用连接池，因为 Workers 是无状态的，无法保持长连接。

### 5.3 本地开发 vs 生产环境变量隔离

```
free-report/
├── .env                    # 本地开发（前端 + Spring Boot）
├── .env.production         # 前端生产构建（VITE_API_BASE_URL）
├── workers/
│   ├── .dev.vars           # 本地 wrangler dev 变量（不加密，仅本地）
│   └── wrangler.toml       # Worker 配置（非敏感变量）
```

```bash
# workers/.dev.vars（本地开发，gitignore）
JWT_SECRET=free-report-development-secret
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/freereport
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
ENVIRONMENT=development
```

```bash
# .env.production（前端，可提交）
VITE_API_BASE_URL=https://free-report-api.your-subdomain.workers.dev
```

---

## 6. 构建与部署流程

### 6.1 GitHub Actions CI/CD 流水线

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=free-report

  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: cd workers && npm ci
      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: workers
          command: deploy
```

### 6.2 前端 Pages 自动部署

Cloudflare Pages 支持 Git 集成自动部署：

1. 在 Cloudflare Dashboard → Pages → 创建项目
2. 连接 GitHub 仓库
3. 构建设置：
   - 构建命令：`npm run build`
   - 构建输出目录：`dist`
   - 根目录：`/`
4. 环境变量：在 Dashboard 中设置 `VITE_API_BASE_URL`

### 6.3 后端 Workers 部署

```bash
cd workers
npm run deploy
# 或
npx wrangler deploy
```

### 6.4 数据库迁移脚本执行时机

**推荐：手动执行 + 版本控制**

数据库迁移不应在 CI/CD 中自动执行（风险过高），建议：

1. 将 Postgres 版 SQL 文件放入 `supabase/migrations/`
2. 使用 Supabase CLI 本地执行和验证：

```bash
# 本地开发
npx supabase migration up

# 生产环境（手动执行）
npx supabase db push
```

3. 或直接使用 `psql`：

```bash
psql $DATABASE_URL -f sql/001_schema_pg.sql
psql $DATABASE_URL -f sql/002_seed_pg.sql
```

**迁移执行 checklist：**

- [ ] 在 Supabase 创建新项目
- [ ] 本地执行所有迁移 SQL 验证无误
- [ ] 执行种子数据 SQL
- [ ] 验证所有表、索引、外键、触发器
- [ ] 运行后端测试确认 API 正常
- [ ] 配置 Wrangler secrets（DATABASE_URL, JWT_SECRET, CORS_ORIGINS）
- [ ] 部署 Workers
- [ ] 部署 Pages
- [ ] 端到端测试登录、填报、审批、汇总流程

---

## 7. 本地部署保留策略

### 7.1 保持本地 MySQL + Spring Boot 独立部署能力

迁移到 Cloudflare 后，本地开发环境仍需保留 Spring Boot + MySQL 方案，原因：

- 部分开发者熟悉 Java 生态
- 本地调试 Workers + Postgres 需要额外配置
- 作为灾备方案

**保留策略：**

1. `server-springboot/` 目录完全保留，不做任何删除
2. 新增 `workers/` 目录存放 Hono 后端，两者并行存在
3. 前端通过环境变量切换 API 目标

### 7.2 前端 API_BASE_URL 动态切换

修改 `src/services/api.ts`，引入环境变量判断：

```typescript
// /Users/dgjin/Documents/Codex/2026-07-22/cong/free-report/src/services/api.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const fullUrl = API_BASE_URL ? `${API_BASE_URL}${url}` : url;
  const res = await fetch(fullUrl, { ...options, headers });
  // ... 其余逻辑不变
}
```

**环境变量配置：**

```bash
# .env（本地开发，Spring Boot 后端）
VITE_API_BASE_URL=
# 空值表示使用相对路径，Vite dev server 会 proxy 到 localhost:3001
```

```bash
# .env.local（本地开发，Workers 后端，不提交 git）
VITE_API_BASE_URL=http://localhost:8787
```

```bash
# .env.production（Cloudflare Pages 构建）
VITE_API_BASE_URL=https://free-report-api.your-subdomain.workers.dev
```

### 7.3 环境判断逻辑

```typescript
// /Users/dgjin/Documents/Codex/2026-07-22/cong/free-report/src/utils/env.ts
export const isDev = import.meta.env.DEV;
export const isCloudflare = import.meta.env.VITE_DEPLOY_TARGET === 'cloudflare';
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

export function getApiUrl(path: string): string {
  if (apiBaseUrl) {
    return `${apiBaseUrl}${path}`;
  }
  return path; // 相对路径，依赖 Vite proxy 或同域部署
}
```

```bash
# .env.production 可追加
VITE_DEPLOY_TARGET=cloudflare
```

**本地开发启动命令：**

```bash
# 方案 1：本地 Spring Boot + MySQL
npm run dev              # Vite dev server (port 3000) + proxy /api → localhost:3001
cd server-springboot && ./mvnw spring-boot:run  # Spring Boot (port 3001)

# 方案 2：本地 Workers + Postgres
npm run dev              # Vite dev server (port 3000)
cd workers && npm run dev  # wrangler dev (port 8787)
# 前端 .env.local 中设置 VITE_API_BASE_URL=http://localhost:8787
```

---

## 附录：关键文件路径汇总

| 文件 | 路径 | 作用 |
|------|------|------|
| 前端 API 层 | `src/services/api.ts` | 需修改：支持 `VITE_API_BASE_URL` |
| Vite 配置 | `vite.config.ts` | 无需修改，已支持 proxy |
| 前端入口 | `src/App.tsx` | 无需修改，`BrowserRouter` 兼容 Pages |
| Spring Boot 配置 | `server-springboot/src/main/resources/application.yml` | 保留，本地使用 |
| JWT 提供者 | `server-springboot/src/main/java/com/freereport/security/JwtTokenProvider.java` | 参考 secret 处理方式 |
| 密码编码器 | `server-springboot/src/main/java/com/freereport/config/SecurityConfig.java` | 参考 bcrypt rounds |
| MySQL schema | `sql/001_schema.sql` | 需翻译为 Postgres 语法 |
| 种子数据 | `sql/002_seed.sql` | 需翻译为 Postgres 语法 |
| Express 后端 | `express-backend` 分支 | 移植到 Hono 的参考代码 |
| Express 入口 | `server.ts`（分支） | 路由挂载逻辑参考 |
| Express 认证 | `server/src/auth.ts`（分支） | JWT + 权限中间件参考 |
| Express 数据库 | `server/src/db.ts`（分支） | SQL 业务逻辑参考 |
| 环境变量 | `.env` | 本地开发配置 |

---

## 总结

| 方面 | 关键决策 | 工作量 |
|------|---------|--------|
| 前端 Pages | 新增 `_routes.toml`、`_headers`、`.env.production`，修改 `api.ts` | 1 天 |
| 后端 Workers | 从 `express-backend` 分支移植到 Hono，替换 `mysql2` → `pg` | 12-15 天 |
| 数据库 | 7 个 SQL 文件翻译为 Postgres 语法，Supabase 初始化 | 3-5 天 |
| 认证 | `jose` 替换 `jsonwebtoken`，`bcryptjs` 复用 | 1 天 |
| Secrets | Wrangler secrets + `.dev.vars` 配置 | 0.5 天 |
| CI/CD | GitHub Actions + wrangler-action | 1 天 |
| 本地保留 | 环境变量动态切换，Spring Boot 目录保留 | 0.5 天 |
| **总计** | | **约 20-25 天（单人全职）** |

**建议实施顺序：**

1. **Week 1**：数据库迁移（MySQL → Postgres），验证 schema 和种子数据
2. **Week 2-3**：后端移植（Express → Hono），逐模块迁移并测试
3. **Week 4**：前端适配（环境变量、Pages 部署配置）、CI/CD 搭建、端到端测试
