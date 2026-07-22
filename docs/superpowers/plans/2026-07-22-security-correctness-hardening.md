# Security and Correctness Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the reviewed data-loss, authorization, aggregation, production-security, and persistence defects in priority order.

**Architecture:** Put reusable authorization policy in `server/src/auth.ts`, enforce invariants again in database workflow methods, and exercise routes against an isolated JSON database. Keep the current storage format while making file replacement atomic and configuration explicit.

**Tech Stack:** TypeScript 5.8, Express 4, React 19, Node 22 test runner, JSON persistence.

## Global Constraints

- Preserve current API response shapes unless correctness requires an added selector.
- Branch users can access only objects belonging to their company.
- Only approved submissions contribute to headquarters aggregation.
- Do not introduce a database-engine migration in this change.
- Every behavior change starts with a test that fails for the expected reason.

---

### Task 1: Test harness and safe draft replacement

**Files:**
- Modify: `package.json`
- Modify: `server/src/db.ts`
- Create: `tests/db-submission.test.ts`

**Interfaces:**
- Consumes: `Database` constructed with an isolated database file.
- Produces: draft saves that replace only the target submission's values.

- [ ] Export a configurable `Database` class and add a Node test script.
- [ ] Write a regression test that creates values for two submissions, re-saves one draft, and expects the other submission's values to remain while the draft has no duplicates.
- [ ] Run the targeted test and confirm it fails because unrelated data is deleted.
- [ ] Change the old-data filter to remove only the current submission's values.
- [ ] Run the targeted test and confirm it passes.

### Task 2: Approval authorization and workflow invariants

**Files:**
- Modify: `server/src/auth.ts`
- Modify: `server/src/db.ts`
- Modify: `server/src/routes/approvals.ts`
- Create: `tests/approval-authorization.test.ts`

**Interfaces:**
- Produces: `canActOnApproval(user, record, submission): boolean` and workflow errors with HTTP-safe classifications.

- [ ] Write failing tests for a non-assigned user, wrong role, wrong company, and stale approval action.
- [ ] Verify failures show unauthorized users can currently act.
- [ ] Require the pending record's assigned user, role, company, and matching submission state before mutation.
- [ ] Map forbidden and workflow-conflict errors to 403 and 409.
- [ ] Run approval tests and confirm they pass.

### Task 3: Assignment and submission object authorization

**Files:**
- Modify: `server/src/auth.ts`
- Modify: `server/src/routes/assignments.ts`
- Modify: `server/src/routes/submissions.ts`
- Create: `tests/report-access.test.ts`

**Interfaces:**
- Produces: `canReadAssignment`, `canWriteAssignment`, and `canReadSubmission` policy helpers.

- [ ] Write failing route tests proving branch users can read/write another company's assignment and submission.
- [ ] Verify each test fails for the missing authorization check.
- [ ] Enforce company ownership and handler/admin write roles on every object route.
- [ ] Reject malformed numeric IDs and request bodies with 400.
- [ ] Run access tests and confirm they pass.

### Task 4: Approved, period-specific aggregation

**Files:**
- Modify: `server/src/routes/aggregations.ts`
- Modify: `src/services/api.ts`
- Modify: `src/pages/AggregationView.tsx`
- Create: `tests/aggregation.test.ts`

**Interfaces:**
- `GET /api/aggregations/by-template/:templateId?period_label=<value>` requires an exact period.

- [ ] Write failing tests with two periods and draft/rejected/pending submissions.
- [ ] Confirm the old endpoint selects the first assignment and counts unapproved data.
- [ ] Require `period_label`, filter assignments by it, and select only the latest approved submission.
- [ ] Update the client API and aggregation screen to select and send a period.
- [ ] Run aggregation tests and confirm they pass.

### Task 5: Production configuration and durable JSON writes

**Files:**
- Modify: `server.ts`
- Modify: `server/src/auth.ts`
- Modify: `server/src/db.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Create: `tests/config-and-persistence.test.ts`

**Interfaces:**
- Produces: `getJwtSecret(env)`, configurable `PORT` and `CORS_ORIGINS`, active-user token revalidation, and atomic database replacement.

- [ ] Write failing tests for missing production JWT secret, disabled users with valid tokens, and interrupted/overlapping persistence.
- [ ] Confirm failures are caused by fallback configuration and direct file writes.
- [ ] Require `JWT_SECRET` in production, re-read users in middleware, configure CORS allowlists and port, and replace files atomically.
- [ ] Remove obsolete type packages and document all environment variables.
- [ ] Run configuration and persistence tests and confirm they pass.

### Task 6: Full verification

**Files:**
- Modify only files needed to resolve verification failures.

**Interfaces:**
- Produces: a clean verified build.

- [ ] Run `npm test` and require all tests to pass.
- [ ] Run `npm run lint` and require zero TypeScript errors.
- [ ] Run `npm run build` and require a successful production bundle.
- [ ] Inspect `git diff --check` and `git status --short` for accidental artifacts.
