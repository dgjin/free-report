import 'express-async-errors';
import assert from 'node:assert/strict';
import test from 'node:test';
import { type RequestHandler } from 'express';
import { requireHeadquarter } from '../server/src/auth';
import { Database } from '../server/src/db';
import { createTemplatesRouter } from '../server/src/routes/templates';
import { TransactionalTemplatePool } from './support/transactional-template-pool';

const testAuth: RequestHandler = (req, _res, next) => {
  const isBranch = req.headers['x-test-company-level'] === 'branch';
  req.user = {
    id: 1,
    username: 'tester',
    display_name: '测试用户',
    company_id: isBranch ? 8 : 1,
    company_name: isBranch ? '测试分公司' : '测试总部',
    company_code: isBranch ? 'BRANCH' : 'HQ',
    company_level: isBranch ? 'branch' : 'headquarter',
    role: isBranch ? 'branch_admin' : 'super_admin',
  };
  next();
};

function createApi(pool: TransactionalTemplatePool) {
  const database = new Database(() => pool as any);
  const router = createTemplatesRouter(database, {
    authMiddleware: testAuth,
    requireHeadquarter,
  });

  return {
    async request(path: string, init: RequestInit = {}) {
      return new Promise<{ response: { status: number }; body: any }>((resolve) => {
        const headers = Object.fromEntries(new Headers(init.headers).entries());
        const req = {
          method: init.method || 'GET',
          url: path,
          originalUrl: path,
          headers,
          body: init.body ? JSON.parse(String(init.body)) : {},
        } as any;
        const res = {
          statusCode: 200,
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(body: any) {
            resolve({ response: { status: this.statusCode }, body });
            return this;
          },
          setHeader() {},
          getHeader() { return undefined; },
          end() {},
        } as any;

        (router as any).handle(req, res, (error?: unknown) => {
          if (!error) {
            resolve({ response: { status: 404 }, body: { error: 'Not Found' } });
            return;
          }
          const statusCode = typeof error === 'object' && error && 'statusCode' in error
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
          resolve({ response: { status: statusCode }, body: { error: (error as Error).message } });
        });
      });
    },
  };
}

async function withApi(
  pool: TransactionalTemplatePool,
  action: (api: ReturnType<typeof createApi>) => Promise<void>,
) {
  await action(createApi(pool));
}

test('branch users receive 403 from both lifecycle endpoints', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 1, status: 'published' });

  await withApi(pool, async (api) => {
    for (const endpoint of ['/1/disable', '/1/enable']) {
      const { response, body } = await api.request(endpoint, {
        method: 'PUT',
        headers: { 'x-test-company-level': 'branch' },
      });
      assert.equal(response.status, 403);
      assert.match(body.error, /总部/);
    }
  });
  assert.equal(pool.templates.get(1)?.status, 'published');
});

test('generic update ignores status and archived metadata updates return 409', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 1, status: 'published', description: '旧说明' });
  pool.seedTemplate({ id: 2, status: 'archived', description: '停用说明' });

  await withApi(pool, async (api) => {
    const published = await api.request('/1', {
      method: 'PUT',
      body: JSON.stringify({ description: '新说明', status: 'archived' }),
    });
    assert.equal(published.response.status, 200);
    assert.equal(published.body.description, '新说明');
    assert.equal(published.body.status, 'published');

    const archived = await api.request('/2', {
      method: 'PUT',
      body: JSON.stringify({ description: '不能修改' }),
    });
    assert.equal(archived.response.status, 409);
    assert.match(archived.body.error, /已停用/);
  });
  assert.equal(pool.templates.get(2)?.description, '停用说明');
});

test('lifecycle endpoints are idempotent and reject draft transitions', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 1, status: 'published' });
  pool.seedTemplate({ id: 2, status: 'draft' });

  await withApi(pool, async (api) => {
    for (const expected of ['archived', 'archived']) {
      const result = await api.request('/1/disable', { method: 'PUT' });
      assert.equal(result.response.status, 200);
      assert.equal(result.body.template.status, expected);
    }
    for (const expected of ['published', 'published']) {
      const result = await api.request('/1/enable', { method: 'PUT' });
      assert.equal(result.response.status, 200);
      assert.equal(result.body.template.status, expected);
    }
    for (const endpoint of ['/2/disable', '/2/enable']) {
      const result = await api.request(endpoint, { method: 'PUT' });
      assert.equal(result.response.status, 409);
      assert.match(result.body.error, /草稿/);
    }
  });
});

test('archived templates reject add-field, field-disable, and assignment requests', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 2, status: 'archived' });
  pool.seedField({ id: 20, template_id: 2, status: 'active' });

  await withApi(pool, async (api) => {
    const requests: Array<[string, RequestInit]> = [
      ['/2/fields', {
        method: 'POST',
        body: JSON.stringify({
          field_name: 'asset_value',
          field_label: '资产价值',
          field_type: 'number',
          data_type: 'detail',
        }),
      }],
      ['/2/fields/20/disable', { method: 'PUT' }],
      ['/2/assign', {
        method: 'POST',
        body: JSON.stringify({ company_ids: [8], title: '七月报表', period_label: '2026-07', deadline: '2026-07-31' }),
      }],
    ];

    for (const [path, init] of requests) {
      const result = await api.request(path, init);
      assert.equal(result.response.status, 409);
      assert.match(result.body.error, /已停用/);
    }
  });
  assert.equal(pool.fields.size, 1);
  assert.equal(pool.fields.get(20)?.status, 'active');
  assert.equal(pool.assignments.size, 0);
});

test('field-disable endpoint cannot mutate a field owned by another template', async () => {
  const pool = new TransactionalTemplatePool();
  pool.seedTemplate({ id: 1, status: 'published' });
  pool.seedTemplate({ id: 2, status: 'published' });
  pool.seedField({ id: 20, template_id: 2, status: 'active' });

  await withApi(pool, async (api) => {
    const result = await api.request('/1/fields/20/disable', { method: 'PUT' });
    assert.equal(result.response.status, 404);
    assert.match(result.body.error, /字段不存在/);
  });
  assert.equal(pool.fields.get(20)?.status, 'active');
});
