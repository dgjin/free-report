import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('archived template view disables writes and offers enable', async () => {
  const { getTemplateLifecycleView } = await import('../src/utils/templateLifecycle');
  assert.deepEqual(getTemplateLifecycleView('archived'), {
    isArchived: true,
    statusLabel: '已停用',
    actionLabel: '重新启用',
    canWrite: false,
  });
});

test('non-archived template view enables writes and offers disable', async () => {
  const { getTemplateLifecycleView } = await import('../src/utils/templateLifecycle');
  const expected = {
    isArchived: false,
    statusLabel: '使用中',
    actionLabel: '停用',
    canWrite: true,
  };

  assert.deepEqual(getTemplateLifecycleView('published'), expected);
  assert.deepEqual(getTemplateLifecycleView('draft'), expected);
});

test('template lifecycle API methods use the enable and disable PUT endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const calls: Array<{ url: string; method?: string }> = [];
  const template = { id: 7, status: 'archived' };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null },
  });
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response(JSON.stringify({ message: 'ok', template }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const { api } = await import('../src/services/api');
    assert.deepEqual(await api.disableTemplate(7), { message: 'ok', template });
    assert.deepEqual(await api.enableTemplate(7), { message: 'ok', template });
    assert.deepEqual(calls, [
      { url: '/api/templates/7/disable', method: 'PUT' },
      { url: '/api/templates/7/enable', method: 'PUT' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  }
});

test('template cards expose lifecycle status and guarded lifecycle actions', () => {
  const source = readFileSync(new URL('../src/pages/TemplateList.tsx', import.meta.url), 'utf8');

  assert.match(source, /getTemplateLifecycleView\(t\.status\)/);
  assert.match(source, /\{lifecycle\.statusLabel\}/);
  assert.match(source, /\{lifecycle\.actionLabel\}/);
  assert.match(source, /disabled=\{!lifecycle\.canWrite\}/);
  assert.match(source, /lifecycle\.isArchived \? api\.enableTemplate\(t\.id\) : api\.disableTemplate\(t\.id\)/);
  assert.match(source, /confirm\('停用后不能编辑或新下发，历史任务和数据不受影响。确认停用？'\)/);
  assert.match(source, /lifecycle\.isArchived \? '.*opacity-60.*border-slate-300.*'/s);
});

test('template editor makes archived templates read only', () => {
  const source = readFileSync(new URL('../src/pages/TemplateEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /getTemplateLifecycleView\(template\.status\)/);
  assert.match(source, /const canWrite = lifecycle\.canWrite/);
  assert.match(source, /该报表模板已停用，字段配置为只读；历史任务和数据仍可正常查看与处理。/);
  assert.match(source, /\{canWrite && \(/);
  assert.match(source, /\{isActive && canWrite \?/);
});
