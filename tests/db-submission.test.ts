import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('re-saving a draft replaces only that submission data', async () => {
  const originalCwd = process.cwd();
  const isolatedCwd = mkdtempSync(path.join(tmpdir(), 'free-report-db-'));
  process.chdir(isolatedCwd);

  try {
    const { db } = await import('../server/src/db.ts');
    const originalSubmissionData = db.getSubmissionData(1);

    const firstSave = db.createOrUpdateSubmission(3, 9, 4, { 1: 'first' }, [], '', false);
    db.createOrUpdateSubmission(3, 9, 4, { 1: 'second' }, [], '', false);

    assert.deepEqual(db.getSubmissionData(1), originalSubmissionData);
    assert.deepEqual(
      db.getSubmissionData(firstSave.submission.id).map((item) => item.value),
      ['second'],
    );
  } finally {
    process.chdir(originalCwd);
  }
});
