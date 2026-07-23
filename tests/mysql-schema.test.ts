import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const schema = fs.readFileSync(new URL('../sql/001_schema.sql', import.meta.url), 'utf8');

test('schema defines every report table with transactional storage', () => {
  const tables = [
    'companies', 'users', 'report_templates', 'report_template_fields',
    'report_assignments', 'report_submissions', 'report_submission_data',
    'approval_records', 'report_aggregations', 'submission_receipts',
  ];
  for (const table of tables) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.equal((schema.match(/ENGINE=InnoDB/g) || []).length >= tables.length, true);
});

test('schema protects workflow uniqueness and relationships', () => {
  assert.match(schema, /uq_assignment_period/);
  assert.match(schema, /uq_submission_version/);
  assert.match(schema, /uq_submission_field_row/);
  assert.match(schema, /uq_approval_step/);
  assert.match(schema, /uq_submission_receipt/);
  assert.match(schema, /owner_department_id/);
  assert.match(schema, /issuer_department_id/);
  assert.match(schema, /FOREIGN KEY/);
});
