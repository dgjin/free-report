# Headquarter Department Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add maintainable headquarter departments with department-owned templates, tenant-style isolation, department-to-organization assignment, and issuer-department receipt/return workflow while keeping super administrators business-read-only.

**Architecture:** Extend the existing `companies` tree with a department level and make department ownership explicit on templates and assignments. Centralize authorization as pure policy functions backed by transactional database operations, then expose role-aware HTTP routes and React pages. Apply a versioned MySQL migration that backfills legacy records to 业务综合管理部 before enforcing non-null ownership.

**Tech Stack:** TypeScript, Express 4, React 19, MySQL 8/InnoDB, Node test runner, Vite

## Global Constraints

- Super administrators can manage organizations/users and read all business data, but every business write returns HTTP `403`.
- Department administrators can read and mutate only templates owned by their own active department.
- Receiving an assignment grants task access only; it never grants source-template library or design access.
- Only the receiving organization can save or submit report data.
- Only an administrator of the issuer department can receive or return a submission.
- Existing assignments remain readable and all legacy ownership is backfilled to 业务综合管理部.
- Every ownership/status check and mutation that depends on it occurs in one transaction with row locking.
- No physical deletion of referenced organizations, templates, assignments, submissions, or receipts.
- All list queries filter authorized rows in SQL rather than returning all rows for client-side filtering.

---

### Task 1: Versioned migration runner and department schema

**Files:**
- Modify: `scripts/run-sql-file.ts`
- Modify: `scripts/db-migrate.ts`
- Create: `sql/004_department_reporting.sql`
- Modify: `sql/001_schema.sql`
- Modify: `sql/002_seed.sql`
- Modify: `tests/mysql-schema.test.ts`
- Create: `tests/department-migration.test.ts`

**Interfaces:**
- Produces `runMigration(relativePath): Promise<'applied' | 'skipped'>`.
- Produces department IDs by stable codes `HQ-OFFICE`, `HQ-BUSINESS`, `HQ-FINANCE`, `HQ-RISK`.
- Adds `report_templates.owner_department_id`, `report_assignments.issuer_department_id`, and `submission_receipts`.

- [ ] Write failing schema/migration tests asserting department and role enums, four stable department codes, ownership foreign keys/indexes, receipt uniqueness, extended statuses, and migration-ledger usage.
- [ ] Run `node --import tsx --test tests/mysql-schema.test.ts tests/department-migration.test.ts`; verify failure because migration 004 and `runMigration` do not exist.
- [ ] Implement `runMigration` so it creates `schema_migrations`, checks the filename on one connection, executes the SQL in a transaction, inserts the filename only after success, and rolls back on error. Do not mark `001_schema.sql` or corrective migration `003` as reapplied when already recorded.
- [ ] Implement migration 004 in this order: widen enums; insert four departments with `INSERT ... ON DUPLICATE KEY UPDATE`; add nullable ownership columns; backfill templates and assignments to `HQ-BUSINESS`; add foreign keys/indexes; make columns non-null; create `submission_receipts`; extend assignment/submission status enums. Use `information_schema` guards through stored procedures where MySQL lacks reliable `IF NOT EXISTS` support.
- [ ] Update baseline schema and seed to represent a fresh install with the same final structure. Seed at least one department administrator and one department handler without exposing production passwords.
- [ ] Run focused tests, `npm test`, and `npm run lint`; expect all enabled tests to pass.
- [ ] Commit with `feat: add department reporting schema`.

### Task 2: Domain types and authorization policies

**Files:**
- Modify: `server/src/types.ts`
- Modify: `src/types.ts`
- Create: `server/src/department-policy.ts`
- Modify: `server/src/auth.ts`
- Create: `tests/department-policy.test.ts`

**Interfaces:**
- Produces `isSuperAdminReadOnly(user)`, `isDepartmentReportAdmin(user)`, `canManageTemplate(user, template)`, `canReadTemplate(user, template)`, `canReadAssignment(user, assignment)`, `canWriteAssignment(user, assignment)`, and `canReceiveSubmission(user, assignment)`.
- `CompanyLevel` includes `department`; `Role` includes `department_report_admin`.

- [ ] Write table-driven failing tests covering two departments, a branch, a handler, department admins, and a super administrator. Assert cross-department template denial, task-only receiver access, receiving-organization write, issuer-only receipt, and super-admin read-only behavior.
- [ ] Run `node --import tsx --test tests/department-policy.test.ts`; verify failure because the policy module/types are absent.
- [ ] Implement policies as pure functions over explicit resource ownership. Super admin returns true only from read policies and false from every business write policy. Remove the existing `super_admin` write bypass from `canWriteAssignment`.
- [ ] Update authentication to reload user and organization on every request and include `company_level` without treating every headquarter-level account as a business writer.
- [ ] Run focused/full tests and lint; commit with `feat: enforce department authorization policies`.

### Task 3: Organization and department-admin management API

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/src/routes/companies.ts`
- Create: `server/src/routes/users.ts`
- Modify: `server.ts`
- Create: `tests/organization-management-routes.test.ts`

**Interfaces:**
- Produces `GET /api/companies/targets` for active departments/branches.
- Produces super-admin-only organization create/disable and user role/organization update endpoints.
- Produces database methods that reject physical deletion and reject disabling an organization while it has active unfinished assignments.

- [ ] Write executable failing router tests using injected database methods: non-super users receive `403`; super admin can add/disable departments and assign/revoke `department_report_admin`; invalid parent/level combinations return `400`/`409`; targets omit root/self/inactive organizations.
- [ ] Run the focused test and observe RED for missing routes.
- [ ] Implement a reusable `requireSuperAdmin` middleware. Do not use `requireHeadquarter` for organization administration.
- [ ] Implement parameterized DB methods and routers. Validate department users belong to department-level organizations before granting `department_report_admin`.
- [ ] Register the users router, run focused/full tests and lint, then commit with `feat: add department organization management`.

### Task 4: Department-owned template isolation

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/src/routes/templates.ts`
- Modify: `server/src/template-lifecycle.ts`
- Create: `tests/department-template-isolation.test.ts`

**Interfaces:**
- Template list DB method accepts an access scope: `{ mode: 'all-readonly' }` or `{ mode: 'department'; departmentId: number }`.
- Template create derives `owner_department_id` from authenticated user; it never accepts ownership from request JSON.

- [ ] Write failing executable route/database tests: department A sees and mutates only A; department B receives `404` for A template details and `403/404` for forged writes; super admin lists/reads all but every create/update/field/lifecycle/assign operation returns `403`; receiver assignment does not expose source template detail.
- [ ] Observe RED, then change list/detail SQL to filter by owner department except super-admin readonly queries.
- [ ] Move create, update, field, lifecycle, and assignment ownership checks into the same transaction as their mutations, locking template and owner department rows. Reject inactive departments and non-published templates with `409`.
- [ ] Ensure route errors do not reveal cross-department existence. Run focused/full tests, lint, and commit with `feat: isolate templates by department`.

### Task 5: Issuer-scoped assignment and submission workflow

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/src/routes/assignments.ts`
- Modify: `server/src/routes/submissions.ts`
- Modify: `server/src/routes/aggregations.ts`
- Create: `tests/department-assignment-workflow.test.ts`

**Interfaces:**
- Assignment creation derives `issuer_department_id` from locked template ownership.
- Submission transitions: `draft -> pending_receipt`, `returned -> pending_receipt`; receiver writes only.
- Assignment read scopes: receiver organization, issuer department administrator, or super-admin readonly.

- [ ] Write failing behavior tests for department/branch targets, self/root/inactive target rejection, receiver-only save/submit, issuer read without write, super-admin read without write, returned resubmission, and SQL-level list scoping.
- [ ] Observe RED, then implement transactional assignment creation locking template, issuer department, and targets before inserts.
- [ ] Refactor submission creation/update to omit legacy approval creation for department-owned templates and set `pending_receipt` on submit. Preserve historical approval reads.
- [ ] Update assignment and aggregation queries so issuer admins see only their department's originated tasks; receivers see only their tasks; super admin uses read-only all scope.
- [ ] Run focused/full tests and lint; commit with `feat: add issuer scoped assignment workflow`.

### Task 6: Receipt and return domain/API

**Files:**
- Modify: `server/src/types.ts`
- Modify: `src/types.ts`
- Modify: `server/src/db.ts`
- Create: `server/src/routes/receipts.ts`
- Modify: `server.ts`
- Create: `tests/submission-receipt.test.ts`

**Interfaces:**
- Produces `GET /api/receipts/pending` and `POST /api/receipts/:submissionId/action` with action `received | returned`.
- Returns receipt record plus updated submission/assignment.

- [ ] Write failing tests for issuer-admin receipt/return, other-department denial, receiver denial, super-admin denial, mandatory return comment, idempotency/conflict, and two concurrent admins producing one result.
- [ ] Observe RED, then implement one transaction that locks submission, assignment, issuer department, and existing receipt row. Validate `pending_receipt`, insert one receipt, and update submission/assignment atomically.
- [ ] For `returned`, require a trimmed comment and set assignment/submission to returned; for `received`, mark both completed states. A later resubmission creates a new submission version.
- [ ] Register router, run focused concurrency/full tests and lint, then commit with `feat: add department receipt workflow`.

### Task 7: Role-aware client API and navigation

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/components/Layout.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Create: `src/utils/access.ts`
- Create: `tests/client-access.test.ts`

**Interfaces:**
- Client access model exposes `isSuperAdmin`, `isDepartmentAdmin`, `canManageTemplates`, `canFill`, `canReceive`, and `canManageOrganizations`.

- [ ] Write failing table-driven access tests for super admin, department admin, department handler, branch handler, and legacy branch roles.
- [ ] Implement pure client access model; server remains the security boundary.
- [ ] Add navigation: 机构管理 only for super admin; 我的报表/下发管理/签收中心 for department admins; 收到的任务 for handlers/admins; 全局查看 for super admin. Remove the stale SQLite footer and display MySQL/local operation text.
- [ ] Add route guards that render a `403` page instead of redirect loops; add typed API methods for targets, organizations/users, and receipts.
- [ ] Run focused/full tests, lint/build, commit with `feat: add role aware department navigation`.

### Task 8: Organization management and business pages

**Files:**
- Create: `src/pages/OrganizationManagement.tsx`
- Create: `src/pages/ReceiptCenter.tsx`
- Create: `src/pages/GlobalReadOnlyView.tsx`
- Modify: `src/pages/TemplateList.tsx`
- Modify: `src/pages/TemplateEditor.tsx`
- Modify: `src/pages/AssignmentList.tsx`
- Modify: `src/pages/ReportFill.tsx`
- Modify: `src/pages/AggregationView.tsx`
- Modify: `src/App.tsx`
- Create: `tests/department-pages-contract.test.ts`

**Interfaces:**
- Pages consume the access model/API from Task 7; no page computes authorization from organization names or hard-coded IDs.

- [ ] Write failing UI contract tests for correct page availability, super-admin readonly controls, department template isolation copy, issuer labels, receipt busy state, and absence of template-design links for receivers.
- [ ] Implement organization management with department/company filtering, create/disable confirmation, user organization assignment, and multi-admin role configuration.
- [ ] Adapt template/assignment/fill pages to new terminology and state badges. Template assignment targets include active departments and branches but exclude self.
- [ ] Implement receipt center detail, receive/return confirmation, required return reason, disabled/`aria-busy` actions, and refresh after completion.
- [ ] Implement global readonly filters and ensure every business input/action is absent or disabled for super admin.
- [ ] Run focused/full tests, lint/build, and manual responsive checks; commit with `feat: add department reporting pages`.

### Task 9: Migration, authorization, and runtime verification

**Files:**
- Modify only if verification reveals a defect; every defect starts with a failing regression test.

- [ ] Back up row counts and ownership summaries from the configured local MySQL without printing credentials.
- [ ] Run `npm run db:migrate` twice. First run must apply 004; second must report it skipped. Verify four departments, non-null ownership, valid foreign keys, unchanged legacy record counts, and historical readability.
- [ ] Create test users/data in a transaction or with a cleanup ledger. Exercise department A/B isolation, department-to-department and department-to-branch assignment, receiver submission, issuer receipt/return, super-admin read-only, inactive targets, forged IDs, and concurrent receipt.
- [ ] Restore all smoke-test state and verify no test rows remain.
- [ ] Run `npm test && npm run lint && npm run build && git diff --check` and record exact totals.
- [ ] Start current source on port 3000, verify `/api/health`, authenticated role views, and MySQL connection; leave the requested local service running.
- [ ] Request whole-branch code review, fix all Critical/Important findings with regression tests, rerun verification, and commit any fixes.

