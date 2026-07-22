# MySQL Private Deployment Design

## Goal

Replace the local JSON persistence layer with an existing, initially empty MySQL database while preserving the React UI, Express API paths, authorization rules, and report workflow.

## Architecture

The Express application uses a `mysql2/promise` connection pool configured exclusively through environment variables. Database methods become asynchronous and map SQL rows to the existing domain types. Multi-table report saves and approval transitions run inside transactions and lock their assignment, submission, and approval rows before validating state.

Schema and seed data are versioned as SQL files. `db:migrate` applies idempotent schema migrations; `db:seed` inserts development/demo data only when explicitly invoked. Application startup checks connectivity and fails before listening when MySQL is unavailable.

## Configuration

Required variables are `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `JWT_SECRET`. `MYSQL_SSL` defaults to `false` for a private network and can be set to `true` when the instance requires TLS. Secrets stay in ignored `.env` files.

## Data integrity

Foreign keys enforce relationships. Unique indexes protect company codes, usernames, template field names, assignment periods, submission versions, and approval steps. JSON field configuration and aggregation payloads use MySQL JSON columns. Transactions guarantee atomic replacement of submission data and single-use approval actions.

## Error handling

Connection/configuration failures stop startup with a clear message. Domain errors retain their existing HTTP status mapping. SQL errors are logged server-side and returned as generic 500 responses without leaking credentials or statements.

## Testing

Pure configuration and query-mapping tests run without credentials. Integration tests run when `MYSQL_TEST_DATABASE` is configured and use a dedicated empty test database. Completion requires unit tests, TypeScript checking, a production build, and an optional live connectivity/migration check when the user supplies local credentials.

## Non-goals

- No Cloudflare deployment.
- No Docker-managed MySQL instance.
- No compatibility with pre-existing business tables.
- No change to frontend routes or business terminology.
