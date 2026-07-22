# Report Template Disable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reversible template disabling that blocks template mutation and new assignment while preserving all existing workflow data.

**Architecture:** Reuse the existing `published` and `archived` template states. Put state-transition and write-permission rules in a small server domain module, call it from dedicated protected routes, and expose matching API/UI actions. Existing assignment, submission, approval, and aggregation flows remain unchanged.

**Tech Stack:** TypeScript, Express 4, React 19, MySQL 8, Node test runner, Vite

## Global Constraints

- Disabling changes only the template status; it must not modify fields, assignments, submissions, approvals, or aggregations.
- Existing assigned work remains fillable, reviewable, approvable, and aggregatable.
- An archived template cannot add fields or create assignments.
- Only headquarter-authorized users can disable or enable templates.
- No database migration or new dependency is required.

---

### Task 1: Server-side template lifecycle rules

**Files:**
- Create: `server/src/template-lifecycle.ts`
- Create: `tests/template-lifecycle.test.ts`

**Interfaces:**
- Produces: `setTemplateEnabledStatus(status: TemplateStatus, enabled: boolean): TemplateStatus`
- Produces: `assertTemplateWritable(status: TemplateStatus): void`, throwing `DomainError` with status `409` for non-published templates.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTemplateWritable, setTemplateEnabledStatus } from '../server/src/template-lifecycle';

test('disables and re-enables a published template', () => {
  assert.equal(setTemplateEnabledStatus('published', false), 'archived');
  assert.equal(setTemplateEnabledStatus('archived', true), 'published');
});

test('archived templates reject new writes with conflict', () => {
  assert.throws(() => assertTemplateWritable('archived'), (error: any) => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /已停用/);
    return true;
  });
});

test('published templates remain writable', () => {
  assert.doesNotThrow(() => assertTemplateWritable('published'));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --import tsx --test tests/template-lifecycle.test.ts`

Expected: FAIL because `server/src/template-lifecycle.ts` does not exist.

- [ ] **Step 3: Implement minimal lifecycle rules**

```ts
import type { ReportTemplate } from './types';
import { DomainError } from './db';

type TemplateStatus = ReportTemplate['status'];

export function setTemplateEnabledStatus(status: TemplateStatus, enabled: boolean): TemplateStatus {
  return enabled ? 'published' : 'archived';
}

export function assertTemplateWritable(status: TemplateStatus): void {
  if (status !== 'published') throw new DomainError('报表模板已停用，不能编辑或下发', 409);
}
```

- [ ] **Step 4: Run the lifecycle test and full test suite**

Run: `node --import tsx --test tests/template-lifecycle.test.ts && npm test`

Expected: lifecycle tests PASS and all existing enabled tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/template-lifecycle.ts tests/template-lifecycle.test.ts
git commit -m "feat: define template lifecycle rules"
```

### Task 2: Protected lifecycle API and write enforcement

**Files:**
- Modify: `server/src/routes/templates.ts`
- Modify: `server/src/db.ts`
- Create: `tests/template-route-contract.test.ts`

**Interfaces:**
- Consumes: `setTemplateEnabledStatus` and `assertTemplateWritable` from Task 1.
- Produces: `db.setTemplateStatus(id, status): Promise<ReportTemplate | null>`.
- Produces: `PUT /api/templates/:id/disable` and `PUT /api/templates/:id/enable`.

- [ ] **Step 1: Write failing route-contract tests**

Read `server/src/routes/templates.ts` as text and assert that it declares both dedicated routes, invokes `requireHeadquarter`, calls `assertTemplateWritable` in field and assignment handlers, and no longer spreads request `status` into the generic update. These source-contract tests protect route wiring without adding a new HTTP test dependency.

```ts
test('template routes expose protected enable and disable operations', () => {
  assert.match(source, /router\.put\('\/:id\/disable', authMiddleware, requireHeadquarter/);
  assert.match(source, /router\.put\('\/:id\/enable', authMiddleware, requireHeadquarter/);
});

test('archived templates are guarded at both write entry points', () => {
  assert.equal((source.match(/assertTemplateWritable\(template\.status\)/g) || []).length, 2);
});

test('generic template update cannot change status', () => {
  assert.doesNotMatch(source, /status\s*&&\s*\{\s*status\s*\}/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --import tsx --test tests/template-route-contract.test.ts`

Expected: FAIL because lifecycle routes and guards are absent.

- [ ] **Step 3: Implement database status update and routes**

Add `setTemplateStatus` in `server/src/db.ts` using a parameterized update. In `templates.ts`, add a shared async handler that loads the template, returns `404` if absent, computes the target state, persists it, and returns `{ message, template }`. Register it at the two dedicated URLs with both auth middleware functions.

- [ ] **Step 4: Enforce archived-template write rules**

After loading the template in the add-field and assign handlers, call:

```ts
assertTemplateWritable(template.status);
```

Remove `status` from the generic update request destructuring and update payload.

- [ ] **Step 5: Run focused and full verification**

Run: `node --import tsx --test tests/template-route-contract.test.ts && npm test && npm run lint`

Expected: all tests PASS and TypeScript emits no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/src/routes/templates.ts tests/template-route-contract.test.ts
git commit -m "feat: enforce template disable lifecycle"
```

### Task 3: Client API and template-list controls

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/pages/TemplateList.tsx`
- Create: `src/utils/templateLifecycle.ts`
- Create: `tests/template-lifecycle-ui.test.ts`

**Interfaces:**
- Produces: `api.disableTemplate(id)` and `api.enableTemplate(id)` returning `{ message: string; template: ReportTemplate }`.
- Produces: `getTemplateLifecycleView(status)` returning labels and booleans for list/editor rendering.

- [ ] **Step 1: Write failing UI lifecycle tests**

```ts
test('archived template view disables writes and offers enable', async () => {
  const { getTemplateLifecycleView } = await import('../src/utils/templateLifecycle');
  assert.deepEqual(getTemplateLifecycleView('archived'), {
    isArchived: true,
    statusLabel: '已停用',
    actionLabel: '重新启用',
    canWrite: false,
  });
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `node --import tsx --test tests/template-lifecycle-ui.test.ts`

Expected: FAIL because the utility does not exist.

- [ ] **Step 3: Implement the view-model utility and API calls**

Return the exact object above for `archived`; for all other states return `{ isArchived: false, statusLabel: '使用中', actionLabel: '停用', canWrite: true }`. Add PUT calls for `/disable` and `/enable` in `api.ts`.

- [ ] **Step 4: Add list status and actions**

In each template card:

- Render the lifecycle status badge.
- Apply muted opacity/border styling when archived.
- Disable the assignment button when `canWrite` is false.
- Add a stop/restore button. On stop, call `confirm('停用后不能编辑或新下发，历史任务和数据不受影响。确认停用？')`; then call the matching API method and reload templates.
- Keep the card visible regardless of status.

- [ ] **Step 5: Run focused tests, lint, and build**

Run: `node --import tsx --test tests/template-lifecycle-ui.test.ts && npm test && npm run lint && npm run build`

Expected: tests PASS, TypeScript passes, and Vite/server production bundles build.

- [ ] **Step 6: Commit**

```bash
git add src/services/api.ts src/pages/TemplateList.tsx src/utils/templateLifecycle.ts tests/template-lifecycle-ui.test.ts
git commit -m "feat: add template lifecycle controls"
```

### Task 4: Archived template read-only editor

**Files:**
- Modify: `src/pages/TemplateEditor.tsx`
- Modify: `tests/template-lifecycle-ui.test.ts`

**Interfaces:**
- Consumes: `getTemplateLifecycleView` from Task 3.

- [ ] **Step 1: Extend the UI contract test and verify RED**

Read `TemplateEditor.tsx` as text and assert that it derives `canWrite` from `getTemplateLifecycleView(template.status)`, displays the archived read-only message, and conditionally renders both add-field and disable-field controls.

Run: `node --import tsx --test tests/template-lifecycle-ui.test.ts`

Expected: FAIL because editor protections are absent.

- [ ] **Step 2: Implement read-only editor behavior**

For archived templates, render: `该报表模板已停用，字段配置为只读；历史任务和数据仍可正常查看与处理。` Hide the add-field button and every field-disable button. Active templates retain current behavior.

- [ ] **Step 3: Run all verification**

Run: `npm test && npm run lint && npm run build && git diff --check`

Expected: all enabled tests PASS, TypeScript passes, production build succeeds, and diff check is empty.

- [ ] **Step 4: Commit**

```bash
git add src/pages/TemplateEditor.tsx tests/template-lifecycle-ui.test.ts
git commit -m "feat: make archived templates read only"
```

### Task 5: MySQL smoke test and local runtime verification

**Files:**
- No source files expected.

**Interfaces:**
- Verifies all interfaces from Tasks 1–4 against the configured local MySQL instance.

- [ ] **Step 1: Run the final automated suite**

Run: `npm test && npm run lint && npm run build`

Expected: all enabled tests PASS, no type errors, and build succeeds.

- [ ] **Step 2: Verify lifecycle against local MySQL**

Use a development template or create a temporary template through the authenticated API. Verify disable returns `archived`, assignment attempts return `409`, an existing assignment remains readable, and enable returns `published`. Restore the template to its original state after the smoke test.

- [ ] **Step 3: Restart and health-check the local application**

Run the application on port `3000`, then request `GET http://127.0.0.1:3000/api/health`.

Expected: HTTP 200 with `{ "status": "ok", ... }`.

- [ ] **Step 4: Review repository state**

Run: `git status --short && git log -5 --oneline`

Expected: only the pre-existing untracked `server/data/` remains; implementation commits are present.

