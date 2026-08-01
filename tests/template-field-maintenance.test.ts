import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('canMaintainTemplateFields allows draft and never-assigned published templates only', async () => {
  const { canMaintainTemplateFields } = await import('../src/utils/templateLifecycle');

  // 草稿且从未下发：允许维护
  assert.equal(canMaintainTemplateFields('draft', 0), true);
  // 已发布但从未下发：允许维护
  assert.equal(canMaintainTemplateFields('published', 0), true);
  // 已发布且已下发：禁止维护（字段只增不减，仅可停用）
  assert.equal(canMaintainTemplateFields('published', 2), false);
  // 待审批：只读，禁止维护
  assert.equal(canMaintainTemplateFields('pending_approval', 0), false);
  // 已停用：只读，禁止维护
  assert.equal(canMaintainTemplateFields('archived', 0), false);
});

test('field maintenance API methods use the PUT and DELETE field endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  const field = { id: 3, template_id: 7, field_name: 'amount', field_label: '金额' };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null },
  });
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method, body: init?.body as string | undefined });
    return new Response(JSON.stringify({ message: 'ok', field }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const { api } = await import('../src/services/api');
    const updates = {
      field_name: 'amount',
      field_label: '金额',
      field_type: 'number' as const,
      field_config: { required: true },
    };
    assert.deepEqual(await api.updateField(7, 3, updates), { message: 'ok', field });
    assert.deepEqual(await api.deleteField(7, 3), { message: 'ok', field });
    assert.deepEqual(calls, [
      { url: '/api/templates/7/fields/3', method: 'PUT', body: JSON.stringify(updates) },
      { url: '/api/templates/7/fields/3', method: 'DELETE', body: undefined },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  }
});

test('template editor wires guarded field edit and delete actions', () => {
  // 拆分后：字段列表与守卫在 TemplateFieldList，编辑提交在 EditFieldModal，安全提示在 TemplateEditorHeader
  const listSource = readFileSync(new URL('../src/components/TemplateFieldList.tsx', import.meta.url), 'utf8');
  const editSource = readFileSync(new URL('../src/components/EditFieldModal.tsx', import.meta.url), 'utf8');
  const headerSource = readFileSync(new URL('../src/components/TemplateEditorHeader.tsx', import.meta.url), 'utf8');

  // 未下发守卫判定
  assert.match(listSource, /canMaintainTemplateFields/);
  assert.match(listSource, /template\.assignment_count \?\? 0/);
  // 编辑/删除 handler 调用 API
  assert.match(editSource, /api\.updateField\(templateId, field\.id/);
  assert.match(listSource, /api\.deleteField\(template\.id, field\.id\)/);
  // 删除前确认对话框（物理删除不可恢复提示）
  assert.match(listSource, /物理删除字段/);
  assert.match(listSource, /confirmDialog\(/);
  // 字段行按钮：编辑 / 删除 / 停用
  assert.match(listSource, /canMaintainFields && \(/);
  // 安全提示文案：未下发可编辑删除、下发后仅可停用
  assert.match(headerSource, /可自由编辑、删除字段/);
  // 编辑弹窗
  assert.match(editSource, /编辑字段\{field\.data_type === 'matrix'/);
  assert.match(editSource, /保存修改/);
});
