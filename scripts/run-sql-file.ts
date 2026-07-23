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

export async function runMigration(relativePath: string): Promise<'applied' | 'skipped'> {
  const config = readMysqlConfig();
  const connection = await mysql.createConnection({ ...config, multipleStatements: true });
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    const [rows] = await connection.execute<any[]>('SELECT filename FROM schema_migrations WHERE filename = ?', [relativePath]);
    if (rows.length) return 'skipped';
    const sql = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
    await connection.beginTransaction();
    try {
      await connection.query(sql);
      await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [relativePath]);
      await connection.commit();
      return 'applied';
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}
