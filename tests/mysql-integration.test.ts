import test from 'node:test';
import { closeMysqlPool, verifyMysqlConnection } from '../server/src/mysql';

test('connects to the configured MySQL test database', {
  skip: !process.env.MYSQL_TEST_DATABASE,
}, async () => {
  process.env.MYSQL_DATABASE = process.env.MYSQL_TEST_DATABASE;
  await verifyMysqlConnection();
  await closeMysqlPool();
});
