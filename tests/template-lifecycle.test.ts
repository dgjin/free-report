import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTemplateWritable, setTemplateEnabledStatus } from '../server/src/template-lifecycle';

test('disables and re-enables a published template', () => {
  assert.equal(setTemplateEnabledStatus('published', false), 'archived');
  assert.equal(setTemplateEnabledStatus('archived', true), 'published');
  assert.equal(setTemplateEnabledStatus('archived', false), 'archived');
  assert.equal(setTemplateEnabledStatus('published', true), 'published');
});

test('draft templates reject lifecycle requests with conflict', () => {
  for (const enabled of [false, true]) {
    assert.throws(() => setTemplateEnabledStatus('draft', enabled), (error: any) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /草稿/);
      return true;
    });
  }
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

test('draft templates reject writes with a draft-specific conflict', () => {
  assert.throws(() => assertTemplateWritable('draft'), (error: any) => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /草稿/);
    return true;
  });
});
