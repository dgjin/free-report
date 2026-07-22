import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { describeMysqlConfig, readMysqlConfig } from '../server/src/mysql';

export async function runSqlFile(relativePath: string): Promise<void> {
  const config = readMysqlConfig();
  const connection = await mysql.createConnection({ ...config, multipleStatements: true });
  try {
    const sql = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
    await connection.query(sql);
    console.log(`Applied ${relativePath} to ${describeMysqlConfig(config)}`);
  } finally {
    await connection.end();
  }
}
