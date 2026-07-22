import assert from 'node:assert/strict';
import test from 'node:test';
import { getJwtSecret } from '../server/src/auth';

test('production requires an explicit JWT secret', () => {
  assert.throws(() => getJwtSecret({ NODE_ENV: 'production' }), /JWT_SECRET/);
});

test('development uses an explicit non-production fallback', () => {
  assert.equal(getJwtSecret({ NODE_ENV: 'development' }), 'free-report-development-secret');
});
