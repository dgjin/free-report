# Security and Correctness Hardening Design

## Goal

Fix the reviewed defects in priority order without redesigning the product: prevent report-data loss, enforce object-level authorization, make aggregation reflect approved data for an explicit period, and harden production configuration and JSON persistence.

## Scope and order

1. Correct draft replacement so it deletes only the current submission's previous values.
2. Require the assigned reviewer/approver and matching workflow state for approval actions.
3. Centralize assignment and submission access checks. Branch users may access only their company's objects; only handlers (plus administrative override roles) may write reports.
4. Aggregate only approved submissions and require a period selector so repeated template periods cannot be conflated.
5. Require a production JWT secret, revalidate active users on authenticated requests, restrict configurable CORS origins, document runtime variables, and make JSON writes atomic and serialized within the process.

## Architecture

Authorization helpers live beside authentication and accept the authenticated user plus the target domain object. Routes resolve their target first, then invoke the helper before reading or mutating data. Database workflow methods retain invariant checks as defense in depth so a future route cannot bypass them accidentally.

Aggregation is keyed by template and `period_label`. The server filters assignments to that period and includes only the latest approved submission for each assignment. The frontend explicitly selects a period before requesting aggregation.

The existing JSON store remains for this patch. Writes use a temporary file followed by atomic rename and a queued mutation boundary to avoid partial files and same-process overlapping saves. Migrating to SQLite or PostgreSQL is intentionally a separate project.

## Error handling

Invalid identifiers or bodies return 400, missing objects return 404, unauthenticated requests return 401, and authenticated users lacking access return 403. Workflow conflicts return 409 where the target exists but is no longer actionable.

## Testing

Add Node test-runner integration tests around real database and route behavior, with an isolated temporary database path. Each reviewed regression gets a failing test before its fix. Completion requires the full test suite, `npm run lint`, and `npm run build` to pass.

## Non-goals

- No UI redesign.
- No database-engine migration.
- No new user-management feature.
- Demo accounts remain available only outside production.
