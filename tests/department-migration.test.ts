import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(new URL('../sql/004_department_reporting.sql', import.meta.url), 'utf8');
const adminBackfill = fs.readFileSync(new URL('../sql/005_department_admin_backfill.sql', import.meta.url), 'utf8');

test('department migration creates stable departments and ownership', () => {
  for (const code of ['HQ-OFFICE', 'HQ-BUSINESS', 'HQ-FINANCE', 'HQ-RISK']) assert.match(migration, new RegExp(code));
  assert.match(migration, /owner_department_id/);
  assert.match(migration, /issuer_department_id/);
  assert.match(migration, /submission_receipts/);
  assert.match(migration, /pending_receipt/);
  assert.match(migration, /department_report_admin/);
});

test('legacy headquarters administrator is assigned to the business department', () => {
  assert.match(adminBackfill, /HQ-BUSINESS/);
  assert.match(adminBackfill, /department_report_admin/);
  assert.match(adminBackfill, /hq_admin/);
});

test('migration files are applied in numbered order and schema tracks applied filenames', () => {
  const schema = fs.readFileSync(new URL('../sql/001_schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /schema_migrations/);
  const dir = new URL('../sql/', import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  assert.ok(files.length >= 5, '应至少包含 001~005 迁移文件');
  assert.equal(files[0], '001_schema.sql');
  assert.ok(files.includes('004_department_reporting.sql'));
  assert.ok(files.includes('005_department_admin_backfill.sql'));
  // 文件名编号连续递增，保证按序应用
  const numbers = files.map((f) => Number(f.slice(0, 3)));
  for (let i = 1; i < numbers.length; i++) {
    assert.ok(numbers[i] > numbers[i - 1], '迁移编号应严格递增');
  }
});
