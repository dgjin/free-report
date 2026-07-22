# MySQL Private Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run FreeReport privately against an existing empty MySQL database instead of a JSON file.

**Architecture:** Use `mysql2/promise` through a configured pool, async repository methods, SQL migrations/seeding, and transactions for workflow mutations. Keep Express and the current API contract.

**Tech Stack:** Node.js 22, TypeScript 5.8, Express 4, MySQL 8, mysql2/promise, React 19.

## Global Constraints

- Do not deploy to Cloudflare.
- Do not commit database credentials.
- Preserve current frontend and API response contracts.
- Run report saves and approval transitions transactionally.
- Seed demo data only through an explicit command.

---

### Task 1: MySQL configuration and schema

**Files:**
- Create: `server/src/mysql.ts`
- Create: `sql/001_schema.sql`
- Create: `scripts/db-migrate.ts`
- Create: `scripts/db-seed.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Test: `tests/mysql-config.test.ts`

- [ ] Write failing tests for missing variables, port parsing, and SSL options.
- [ ] Implement validated pool configuration and connectivity checks.
- [ ] Add all relational tables, constraints, indexes, and JSON columns.
- [ ] Add explicit migrate and seed commands.

### Task 2: Async MySQL repository

**Files:**
- Replace: `server/src/db.ts`
- Test: `tests/mysql-repository.test.ts`

- [ ] Write failing tests for row mapping and transaction boundaries.
- [ ] Implement asynchronous reads matching existing domain types.
- [ ] Implement template and assignment writes.
- [ ] Implement transactional submission saves and approvals with row locks.
- [ ] Implement approved-only aggregation helpers.

### Task 3: Async authentication and routes

**Files:**
- Modify: `server/src/auth.ts`
- Modify: `server.ts`
- Modify: `server/src/routes/*.ts`
- Test: `tests/mysql-route-contract.test.ts`

- [ ] Write failing tests for rejected promises and domain status mapping.
- [ ] Convert authentication and every API handler to async repository calls.
- [ ] Await MySQL health checks before listening.
- [ ] Add centralized 500 error handling without leaking SQL details.

### Task 4: Operations and verification

**Files:**
- Create: `README.md`
- Modify: `tests/*.test.ts`

- [ ] Document database creation, `.env`, migration, seed, start, backup, and restore.
- [ ] Replace JSON-specific tests with MySQL configuration/repository tests.
- [ ] Run `npm test`, `npm run lint`, and `npm run build`.
- [ ] If credentials are available locally, run migration, seed, health, login, fill, and approval smoke checks.
