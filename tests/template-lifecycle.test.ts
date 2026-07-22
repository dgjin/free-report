import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTemplateWritable, setTemplateEnabledStatus } from '../server/src/template-lifecycle';

test('disables and re-enables a published template', () => {
  assert.equal(setTemplateEnabledStatus('published', false), 'archived');
  assert.equal(setTemplateEnabledStatus('archived', true), 'published');
});

test('archived templates reject new writes with conflict', () => {
  assert.throws(() => assertTemplateWritable('archived'), (error: any) => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /已停用/);
    return true;
  });
});

test('published templates remain writable', () => {
  assert.doesNotThrow(() => assertTemplateWritable('published'));
});
