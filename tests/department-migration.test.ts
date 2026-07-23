import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(new URL('../sql/004_department_reporting.sql', import.meta.url), 'utf8');
const runner = fs.readFileSync(new URL('../scripts/run-sql-file.ts', import.meta.url), 'utf8');

test('department migration creates stable departments and ownership', () => {
  for (const code of ['HQ-OFFICE', 'HQ-BUSINESS', 'HQ-FINANCE', 'HQ-RISK']) assert.match(migration, new RegExp(code));
  assert.match(migration, /owner_department_id/);
  assert.match(migration, /issuer_department_id/);
  assert.match(migration, /submission_receipts/);
  assert.match(migration, /pending_receipt/);
  assert.match(migration, /department_report_admin/);
});

test('migration runner records and skips applied filenames', () => {
  assert.match(runner, /schema_migrations/);
  assert.match(runner, /SELECT filename/);
  assert.match(runner, /INSERT INTO schema_migrations/);
  assert.match(runner, /beginTransaction/);
  assert.match(runner, /rollback/);
});
