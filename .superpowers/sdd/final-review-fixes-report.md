# Final Review Fixes Report

## Final-review fixes

### Scope and outcome

All Critical and Important final-review findings were implemented without a schema migration or new dependency. The server now serializes template lifecycle changes with every lifecycle-sensitive write by locking the `report_templates` row inside the same MySQL transaction as validation and mutation. Draft templates are explicitly read-only and have no lifecycle transition. The route contract tests were replaced with executable Express handler tests, while a deterministic transactional MySQL contract exercises the production `Database` methods and controlled race interleavings.

### Production changes

- `server/src/db.ts`
  - Exports an injectable `Database` while retaining the production singleton.
  - Centralizes transaction handling on the injected pool.
  - Locks templates using `SELECT * FROM report_templates WHERE id = ? FOR UPDATE` before metadata updates, field insertion, field disable, assignment creation, and lifecycle transition.
  - Removes `status` from the generic metadata update type and SQL allowlist.
  - Moves add-field duplicate validation into the field transaction.
  - Changes field disable to accept both `templateId` and `fieldId`, validates ownership in-transaction, and updates with both IDs.
  - Makes lifecycle transitions locked, reversible, and idempotent.
- `server/src/errors.ts` and `server/src/template-lifecycle.ts`
  - Break the domain-error import cycle cleanly.
  - Return explicit `409` errors for draft lifecycle/write requests and preserve archived `409` behavior.
- `server/src/routes/templates.ts`
  - Exports `createTemplatesRouter` for executable dependency-injected testing.
  - Delegates all lifecycle-sensitive validation to the atomic database operations rather than route prechecks.
  - Preserves the default production router export and existing authentication middleware order.
- `src/utils/templateLifecycle.ts`, `src/pages/TemplateList.tsx`, and `src/pages/TemplateEditor.tsx`
  - Model draft as `草稿`, `canWrite: false`, `canTransition: false`, and no action label.
  - Hide draft lifecycle actions and disable draft assignment/field editing.
  - Add an immediate ref-backed in-flight lifecycle guard, disabled state, and `aria-busy`.
  - Remove archived-card opacity so the recovery control remains fully visible; use background/border contrast instead.
  - Add `focus-visible` rings to lifecycle and template-editing controls.
  - Show status-correct read-only copy in the editor.
- `src/services/api.ts`
  - Narrows `updateTemplate` to `name`, `description`, and `period_type`.

### Test files

- `tests/template-lifecycle.test.ts`
  - Published/archived reversibility and idempotency.
  - Draft lifecycle and write conflicts with draft-specific messages.
- `tests/template-database-transaction.test.ts`
  - Archived metadata/add-field/field-disable/assignment rejection without mutation.
  - Generic database update cannot mutate status.
  - Field ownership validation.
  - Add-field-first vs. disable-first controlled interleavings.
  - Assignment vs. disable lock ordering.
- `tests/support/transactional-template-pool.ts`
  - Executes the real `Database` SQL contract against deterministic transaction, rollback, template-lock, and interleaving semantics.
  - Rejects any tested template mutation that occurs without the connection holding the template row lock, so the tests cannot pass from source-text matching alone.
- `tests/template-route-contract.test.ts`
  - Replaces route source regexes with executable Express router dispatch.
  - Covers headquarters authorization `403`, generic status immutability, lifecycle idempotency, draft lifecycle `409`, archived metadata/add/field-disable/assignment `409`, and cross-template field `404`.
- `tests/template-lifecycle-ui.test.ts`
  - Executes the lifecycle view-model and API endpoint behavior.
  - Verifies draft read-only semantics and targeted UI contracts for in-flight/ARIA/focus/recovery styling and narrowed metadata typing.

### TDD evidence

Baseline:

```text
$ npm test && npm run lint
tests 20; pass 19; fail 0; skipped 1
tsc --noEmit: exit 0
MYSQL_TEST_DATABASE_NOT_CONFIGURED
```

Lifecycle/draft RED:

```text
$ node --import tsx --test tests/template-lifecycle.test.ts tests/template-lifecycle-ui.test.ts
tests 11; pass 6; fail 5
Failures: missing canTransition/draft view, draft transition did not throw,
and draft write returned archived copy instead of draft-specific copy.
```

Lifecycle/draft GREEN:

```text
$ node --import tsx --test tests/template-lifecycle.test.ts tests/template-lifecycle-ui.test.ts
tests 11; pass 11; fail 0
```

Transactional RED:

```text
$ node --import tsx --test tests/template-database-transaction.test.ts
SyntaxError: ../server/src/db did not provide export named Database
tests 1; pass 0; fail 1
```

Transactional GREEN:

```text
$ node --import tsx --test tests/template-database-transaction.test.ts
tests 7; pass 7; fail 0
```

Executable route RED:

```text
$ node --import tsx --test tests/template-route-contract.test.ts
SyntaxError: ../server/src/routes/templates did not provide export named createTemplatesRouter
tests 1; pass 0; fail 1
```

The first post-factory request transport attempted `listen(127.0.0.1, 0)` and consistently failed with sandbox `EPERM`. The harness was changed to invoke the same Express router stack directly; it still executes route matching, middleware order, handlers, JSON status/body behavior, and async error propagation without opening a socket.

Executable route GREEN:

```text
$ node --import tsx --test tests/template-route-contract.test.ts
tests 5; pass 5; fail 0
```

UI/accessibility RED:

```text
$ node --import tsx --test tests/template-lifecycle-ui.test.ts
tests 7; pass 1; fail 6
Failures: missing read-only messages, lifecycle action guard/ARIA state,
recovery styling/focus contracts, and narrowed metadata update type.
```

UI/accessibility GREEN:

```text
$ node --import tsx --test tests/template-lifecycle-ui.test.ts
tests 7; pass 7; fail 0
```

Focused combined GREEN:

```text
$ node --import tsx --test tests/template-lifecycle.test.ts tests/template-database-transaction.test.ts tests/template-route-contract.test.ts tests/template-lifecycle-ui.test.ts && npm run lint
tests 24; pass 24; fail 0; skipped 0
tsc --noEmit: exit 0
```

Full verification before commit:

```text
$ npm test && npm run lint && npm run build && git diff --check
tests 33; pass 32; fail 0; skipped 1
tsc --noEmit: exit 0
vite build: 1697 modules transformed; exit 0
server esbuild: exit 0
git diff --check: exit 0, no output
```

The single skip is the pre-existing `tests/mysql-integration.test.ts` connection smoke test because `MYSQL_TEST_DATABASE` is not configured. The new transactional tests are non-skipped and run on every test invocation.

### Commits

- `da499ca553420abb866e078f263c11c46d682f2b` — `fix: make template lifecycle writes atomic`
- Documentation/report commit — `docs: record template lifecycle review fixes`

### Self-review against final findings

- [x] Archived metadata update returns `409`; validation and update share one transaction and row lock.
- [x] Archived field disable returns `409`; `(templateId, fieldId)` ownership is checked before mutation in the same transaction.
- [x] Add-field and assignment status checks occur inside their write transactions after `FOR UPDATE`; no route precheck is relied upon.
- [x] Lifecycle status changes use the same template row lock, closing the check/write race.
- [x] Draft disable/enable requests return a clear `409`; draft UI has a `草稿` label, no lifecycle action, and `canWrite: false`.
- [x] Published/archived transitions are reversible and both same-state requests are idempotent.
- [x] HQ authorization, immutability, lifecycle, archived writes, ownership, and concurrency are covered by executable behavior rather than server source regexes.
- [x] Lifecycle action has an immediate in-flight guard, disabled state, and `aria-busy`.
- [x] Recovery control is not opacity-muted and lifecycle/edit controls have focus-visible styling.
- [x] Database and client generic update payloads exclude `status`.
- [x] No schema migration, dependency, or downstream assignment/submission workflow change was introduced.

### Remaining concerns

- A live MySQL smoke/integration run was not possible because `MYSQL_TEST_DATABASE` is absent. The deterministic transactional pool validates the SQL/locking contract and both race orderings, but a configured MySQL CI job remains useful for engine-level regression coverage.
- The sandbox prohibits local TCP listeners, so route behavior tests dispatch through Express's router directly rather than a bound HTTP socket. They execute production middleware/handlers and response behavior; socket-level concerns remain covered by the existing server build rather than these tests.
