import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('aggregation selects assignments from exactly one requested period', async () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(tmpdir(), 'free-report-aggregation-')));

  try {
    const routeModule = await import('../server/src/routes/aggregations.ts');
    const { db } = await import('../server/src/db.ts');
    const selected = (routeModule as any).selectAssignmentsForPeriod?.(
      db.getAssignments(),
      1,
      '2026年07月',
    );

    assert.deepEqual(selected?.map((assignment: any) => assignment.id), [1, 2, 3]);
  } finally {
    process.chdir(originalCwd);
  }
});

test('aggregation uses the latest approved version instead of a newer draft', async () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(tmpdir(), 'free-report-approved-')));

  try {
    const moduleUrl = new URL(`../server/src/db.ts?aggregation=${Date.now()}`, import.meta.url);
    const { db } = await import(moduleUrl.href);
    db.createOrUpdateSubmission(1, 3, 2, { 1: '999999' }, [], '', false);

    const approved = (db as any).getLatestApprovedSubmissionByAssignment?.(1);
    assert.equal(approved?.id, 1);
  } finally {
    process.chdir(originalCwd);
  }
});
