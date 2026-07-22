# Template Disable Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the lifecycle authorization, atomicity, draft-state, executable-test, and accessibility gaps identified by final review.

**Architecture:** Put every template-status validation in the same `Database` transaction as its mutation and lock the template row with `SELECT ... FOR UPDATE`. Export a router factory so executable HTTP tests can inject the real `Database` implementation backed by a deterministic transactional MySQL contract test double, while production keeps the existing singleton wiring.

**Tech Stack:** TypeScript, Express 4, React 19, MySQL 8 semantics, Node test runner, Vite

## Global Constraints

- No database migration and no new dependency.
- `published` templates are writable; `archived` and `draft` templates are read-only.
- Only `published -> archived` and `archived -> published` lifecycle transitions exist; repeat requests are idempotent and all draft lifecycle requests return `409`.
- Existing assignments and downstream submission, approval, and aggregation behavior remain unchanged.
- Every production behavior change follows a recorded RED, GREEN, and regression verification cycle.

---

### Task 1: Lifecycle domain and client draft model

**Files:**
- Modify: `server/src/template-lifecycle.ts`
- Modify: `src/utils/templateLifecycle.ts`
- Modify: `tests/template-lifecycle.test.ts`
- Modify: `tests/template-lifecycle-ui.test.ts`

**Interfaces:**
- `setTemplateEnabledStatus(status, enabled)` returns the idempotent published/archived target or throws `DomainError(409)` for draft.
- `getTemplateLifecycleView('draft')` returns `statusLabel: '草稿'`, `actionLabel: null`, `canWrite: false`, and `canTransition: false`.

- [x] Add focused draft lifecycle and UI-view tests, run them, and record the expected failures caused by the current published fallback.
- [x] Implement the minimal draft conflict and read-only view model.
- [x] Re-run the focused tests and record the passing output.

### Task 2: Transactional database invariants

**Files:**
- Modify: `server/src/db.ts`
- Create: `tests/support/transactional-template-pool.ts`
- Create: `tests/template-database-transaction.test.ts`

**Interfaces:**
- `new Database(poolProvider?)` supports production `getPool` and injected test pools.
- `updateTemplate(id, metadata)` locks and validates a published template before metadata mutation.
- `setTemplateEnabled(id, enabled)` locks and applies idempotent lifecycle transitions.
- `addTemplateField(field)` locks and validates the template before duplicate lookup and insert.
- `disableTemplateField(templateId, fieldId)` locks the template, validates ownership, and mutates the field in one transaction.
- `createAssignments(...)` locks and validates the template before inserts.

- [x] Add executable transaction tests for archived/draft write conflicts, wrong-template field IDs, rollback/no-mutation behavior, required `FOR UPDATE` locking, and both add-field/disable race orderings; run and record RED.
- [x] Inject the pool provider and move each validation into its mutation transaction, removing `status` from the metadata allowlist.
- [x] Re-run the transaction suite and record GREEN.

### Task 3: Executable HTTP route behavior

**Files:**
- Modify: `server/src/routes/templates.ts`
- Replace: `tests/template-route-contract.test.ts`

**Interfaces:**
- `createTemplatesRouter(database?, middleware?)` returns the production-compatible router and permits dependency injection in tests.

- [x] Replace source-regex assertions with executable Express router requests covering HQ `403`, generic status immutability, lifecycle idempotency/draft rejection, and archived metadata/add/field-disable/assignment rejection; run and record RED.
- [x] Route lifecycle and write operations through the atomic database methods and preserve the default production export.
- [x] Re-run route and database suites and record GREEN.

### Task 4: UI lifecycle safety and accessibility

**Files:**
- Modify: `src/pages/TemplateList.tsx`
- Modify: `src/pages/TemplateEditor.tsx`
- Modify: `src/services/api.ts`
- Modify: `tests/template-lifecycle-ui.test.ts`

**Interfaces:**
- Lifecycle actions use an in-flight template ID guard, `disabled`, and `aria-busy`.
- Draft cards expose no lifecycle action and no write action.
- Archived card content is muted without reducing opacity on its recovery control.
- `api.updateTemplate` accepts only `name`, `description`, and `period_type`.

- [x] Add executable utility/API behavior tests and targeted render-contract checks for draft state, payload narrowing, action guard attributes, recovery-control opacity, and focus-visible styles; run and record RED.
- [x] Implement the minimal UI and client typing changes.
- [x] Re-run focused tests and record GREEN.

### Task 5: Verification, report, and commits

**Files:**
- Create: `.superpowers/sdd/final-review-fixes-report.md`

- [x] Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`, recording exact summaries.
- [x] Review the final diff against every final-review finding and document test files, RED/GREEN outputs, MySQL availability, commits, and remaining concerns.
- [x] Commit implementation and report changes with intentional commit messages, then re-run verification against committed HEAD.
