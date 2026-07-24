import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

test('server getPendingReceipts query must JOIN users table', () => {
  const content = readFileSync(join(root, 'server/src/db.ts'), 'utf-8');
  // Must include users join to get submitted_by_name
  assert.match(content, /JOIN\s+users/i, 'must JOIN users table');
  assert.match(content, /u\.display_name.*submitted_by_name|submitted_by_name.*u\.display_name/i, 
    'must select u.display_name as submitted_by_name');
  assert.match(content, /a\.period_label/, 'must include period_label from assignment');
});

test('client api.getPendingReceipts must return typed array not any[]', () => {
  const content = readFileSync(join(root, 'src/services/api.ts'), 'utf-8');
  // Should NOT use any[] for pending receipts
  assert.doesNotMatch(content, /getPendingReceipts.*:.*Promise<any\[\]>/, 
    'must not return any[]');
});

test('client src/types must have PendingReceipt interface', () => {
  const content = readFileSync(join(root, 'src/types.ts'), 'utf-8');
  assert.match(content, /interface\s+PendingReceipt/, 'must define PendingReceipt interface');
});

test('server src/types must have PendingReceipt interface', () => {
  const content = readFileSync(join(root, 'server/src/types.ts'), 'utf-8');
  assert.match(content, /interface\s+PendingReceipt/, 'must define PendingReceipt interface');
});
