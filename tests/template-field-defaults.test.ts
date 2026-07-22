import assert from 'node:assert/strict';
import test from 'node:test';

test('new templates start without placeholder fields', async () => {
  const module = await import('../src/utils/templateFields.ts').catch(() => ({} as any));
  assert.deepEqual(module.getInitialTemplateFields?.(), []);
});

test('new fields default to detail rows', async () => {
  const module = await import('../src/utils/templateFields.ts').catch(() => ({} as any));
  assert.equal(module.DEFAULT_FIELD_DATA_TYPE, 'detail');
});
