import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('production refuses to start without an explicit JWT secret', async () => {
  const auth = await import('../server/src/auth.ts');
  assert.throws(
    () => (auth as any).getJwtSecret?.({ NODE_ENV: 'production' }),
    /JWT_SECRET/,
  );
});

test('authentication rejects a token after its user is disabled', async () => {
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(path.join(tmpdir(), 'free-report-auth-')));

  try {
    const moduleUrl = new URL(`../server/src/auth.ts?disabled=${Date.now()}`, import.meta.url);
    const auth = await import(moduleUrl.href);
    const { db } = await import('../server/src/db.ts');
    const user = db.getUserById(3)!;
    const token = auth.generateToken(user);
    user.status = 'inactive';
    let nextCalled = false;
    let statusCode = 200;

    const request = { headers: { authorization: `Bearer ${token}` } } as any;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json() { return this; },
    } as any;
    auth.authMiddleware(request, response, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
  } finally {
    process.chdir(originalCwd);
  }
});

test('database JSON replacement is exposed as an atomic write operation', async () => {
  const dbModule = await import('../server/src/db.ts');
  const directory = mkdtempSync(path.join(tmpdir(), 'free-report-atomic-'));
  const file = path.join(directory, 'db.json');
  const writeJsonAtomically = (dbModule as any).writeJsonAtomically;

  assert.equal(typeof writeJsonAtomically, 'function');
  writeJsonAtomically(file, { ok: true });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { ok: true });
  assert.equal(existsSync(`${file}.tmp`), false);
});
