import assert from 'node:assert/strict';
import test from 'node:test';
import { Database } from '../server/src/db';
import { TransactionalTemplatePool } from './support/transactional-template-pool';

function createDatabase(pool: TransactionalTemplatePool): Database {
  return new Database(() => pool as any);
}

const newField = (templateId: number, name = 'asset_value') => ({
  template_id: templateId,
  field_name: name,
  field_label: '资产价值',
  field_type: 'number' as const,
  data_type: 'detail' as const,
  field_config: {},
  sort_order: 1,
  status: 'active' as const,
});

async function expectConflict(action: Promise<unknown>, message: RegExp): Promise<void> {
  await assert.rejects(action, (error: any) => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, message);
    return true;
  });
}

test('lifecycle transition is locked, reversible, idempotent, and rejects draft', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 1, status: 'published' });
  pool.seedTemplate({ id: 2, status: 'draft' });
  const database = createDatabase(pool);

  assert.equal((await database.setTemplateEnabled(1, false))?.status, 'archived');
  assert.equal((await database.setTemplateEnabled(1, false))?.status, 'archived');
  assert.equal((await database.setTemplateEnabled(1, true))?.status, 'published');
  assert.equal((await database.setTemplateEnabled(1, true))?.status, 'published');
  await expectConflict(database.setTemplateEnabled(2, false), /草稿/);
  await expectConflict(database.setTemplateEnabled(2, true), /草稿/);
  assert.equal(pool.templates.get(2)?.status, 'draft');
});

test('metadata update validates writable status and never accepts status', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 1, status: 'published', description: '旧说明' });
  pool.seedTemplate({ id: 2, status: 'archived', description: '停用说明' });
  const database = createDatabase(pool);

  const updated = await database.updateTemplate(1, { description: '新说明', status: 'archived' } as any);
  assert.equal(updated?.description, '新说明');
  assert.equal(updated?.status, 'published');

  await expectConflict(database.updateTemplate(2, { description: '不能修改' }), /已停用/);
  assert.equal(pool.templates.get(2)?.description, '停用说明');
});

test('archived add-field, field-disable, and assignment writes reject without mutation', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 2, status: 'archived' });
  pool.seedField({ id: 20, template_id: 2, status: 'active' });
  const database = createDatabase(pool);

  await expectConflict(database.addTemplateField(newField(2)), /已停用/);
  await expectConflict(database.disableTemplateField(2, 20), /已停用/);
  await expectConflict(database.createAssignments(2, [8], '七月报表', '2026-07', '2026-07-31', 1), /已停用/);

  assert.equal(pool.fields.size, 1);
  assert.equal(pool.fields.get(20)?.status, 'active');
  assert.equal(pool.assignments.size, 0);
});

test('field disable validates that the field belongs to the route template', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 1, status: 'published' });
  pool.seedTemplate({ id: 2, status: 'published' });
  pool.seedField({ id: 20, template_id: 2, status: 'active' });
  const database = createDatabase(pool);

  await assert.rejects(database.disableTemplateField(1, 20), (error: any) => {
    assert.equal(error.statusCode, 404);
    assert.match(error.message, /字段不存在/);
    return true;
  });
  assert.equal(pool.fields.get(20)?.status, 'active');
});

test('add-field holds the template lock so a concurrent disable happens after the insert', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 1, status: 'published' });
  const database = createDatabase(pool);
  const pause = pool.pauseNextTemplateLock();

  const addPromise = database.addTemplateField(newField(1));
  await pause.entered;
  let disableSettled = false;
  const disablePromise = database.setTemplateEnabled(1, false).finally(() => {
    disableSettled = true;
  });
  await Promise.resolve();
  assert.equal(disableSettled, false);

  pause.release();
  const [field, disabled] = await Promise.all([addPromise, disablePromise]);
  assert.equal(field.template_id, 1);
  assert.equal(disabled?.status, 'archived');
  assert.equal(pool.fields.size, 1);
});

test('disable holds the template lock so a concurrent add-field observes archived and rejects', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 1, status: 'published' });
  const database = createDatabase(pool);
  const pause = pool.pauseNextTemplateLock();

  const disablePromise = database.setTemplateEnabled(1, false);
  await pause.entered;
  let addSettled = false;
  const addPromise = database.addTemplateField(newField(1)).finally(() => {
    addSettled = true;
  });
  await Promise.resolve();
  assert.equal(addSettled, false);

  pause.release();
  assert.equal((await disablePromise)?.status, 'archived');
  await expectConflict(addPromise, /已停用/);
  assert.equal(pool.fields.size, 0);
});

test('assignment creation uses the same lock ordering as template disable', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 1, status: 'published' });
  const database = createDatabase(pool);
  const pause = pool.pauseNextTemplateLock();

  const disablePromise = database.setTemplateEnabled(1, false);
  await pause.entered;
  const assignmentPromise = database.createAssignments(1, [8], '七月报表', '2026-07', '2026-07-31', 1);
  pause.release();

  await disablePromise;
  await expectConflict(assignmentPromise, /已停用/);
  assert.equal(pool.assignments.size, 0);
});
