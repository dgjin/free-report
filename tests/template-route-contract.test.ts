import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../server/src/routes/templates.ts', import.meta.url), 'utf8');

test('template routes expose protected enable and disable operations', () => {
  assert.match(source, /router\.put\('\/:id\/disable', authMiddleware, requireHeadquarter/);
  assert.match(source, /router\.put\('\/:id\/enable', authMiddleware, requireHeadquarter/);
});

test('archived templates are guarded at both write entry points', () => {
  assert.equal((source.match(/assertTemplateWritable\(template\.status\)/g) || []).length, 2);
});

test('generic template update cannot change status', () => {
  assert.doesNotMatch(source, /status\s*&&\s*\{\s*status\s*\}/);
});
