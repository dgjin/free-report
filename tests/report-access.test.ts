import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('branch users cannot read another company assignment or submission', async () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(tmpdir(), 'free-report-access-')));

  try {
    const auth = await import('../server/src/auth.ts');
    const { db } = await import('../server/src/db.ts');
    const branchUser = db.getUserById(3)!;
    const otherAssignment = db.getAssignmentById(2)!;
    const otherSubmission = db.getSubmissionById(2)!;

    assert.equal((auth as any).canReadAssignment?.(branchUser, otherAssignment), false);
    assert.equal((auth as any).canReadSubmission?.(branchUser, otherSubmission), false);
  } finally {
    process.chdir(originalCwd);
  }
});

test('a user cannot write a report for another company or with the wrong role', async () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(tmpdir(), 'free-report-write-access-')));

  try {
    const moduleUrl = new URL(`../server/src/db.ts?access=${Date.now()}`, import.meta.url);
    const { db } = await import(moduleUrl.href);

    assert.throws(
      () => db.createOrUpdateSubmission(3, 3, 2, {}, [], '', false),
      (error: any) => error.statusCode === 403,
    );
    assert.throws(
      () => db.createOrUpdateSubmission(3, 10, 4, {}, [], '', false),
      (error: any) => error.statusCode === 403,
    );
  } finally {
    process.chdir(originalCwd);
  }
});
