import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('only the assigned approver can act on a pending approval', async () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(tmpdir(), 'free-report-approval-')));

  try {
    const { db } = await import('../server/src/db.ts');
    const wrongUser = db.getUserById(6)!;

    assert.throws(
      () => db.processApprovalAction(2, wrongUser, 'approved', '越权审批'),
      (error: any) => error.statusCode === 403,
    );
  } finally {
    process.chdir(originalCwd);
  }
});

test('an approval cannot be replayed after its workflow state changes', async () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(tmpdir(), 'free-report-approval-state-')));

  try {
    const moduleUrl = new URL(`../server/src/db.ts?state=${Date.now()}`, import.meta.url);
    const { db } = await import(moduleUrl.href);
    const assignedApprover = db.getUserById(8)!;

    db.processApprovalAction(2, assignedApprover, 'approved', '首次审批');
    assert.throws(
      () => db.processApprovalAction(2, assignedApprover, 'approved', '重复审批'),
      (error: any) => error.statusCode === 409,
    );
  } finally {
    process.chdir(originalCwd);
  }
});
