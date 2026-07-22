import assert from 'node:assert/strict';
import test from 'node:test';

test('mysql config requires every connection field', async () => {
  const mysql = await import('../server/src/mysql.ts').catch(() => ({} as any));
  assert.throws(
    () => mysql.readMysqlConfig?.({ MYSQL_HOST: '127.0.0.1' }),
    /MYSQL_DATABASE/,
  );
});

test('mysql config parses port and SSL without exposing the password', async () => {
  const mysql = await import('../server/src/mysql.ts').catch(() => ({} as any));
  const config = mysql.readMysqlConfig?.({
    MYSQL_HOST: 'db.internal',
    MYSQL_PORT: '3307',
    MYSQL_DATABASE: 'free_report',
    MYSQL_USER: 'free_report_app',
    MYSQL_PASSWORD: 'secret',
    MYSQL_SSL: 'true',
  });

  assert.equal(config.port, 3307);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(mysql.describeMysqlConfig?.(config), 'free_report_app@db.internal:3307/free_report (TLS)');
});
