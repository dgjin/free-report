import mysql, { Pool, PoolOptions } from 'mysql2/promise';

export interface MysqlConfig extends PoolOptions {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: { rejectUnauthorized: boolean };
}

const REQUIRED_KEYS = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'] as const;

export function readMysqlConfig(env: NodeJS.ProcessEnv = process.env): MysqlConfig {
  for (const key of REQUIRED_KEYS) {
    if (!env[key]?.trim()) throw new Error(`${key} is required`);
  }
  const port = Number(env.MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MYSQL_PORT must be a valid TCP port');
  }

  return {
    host: env.MYSQL_HOST!.trim(),
    port,
    database: env.MYSQL_DATABASE!.trim(),
    user: env.MYSQL_USER!.trim(),
    password: env.MYSQL_PASSWORD!,
    ssl: env.MYSQL_SSL?.toLowerCase() === 'true' ? { rejectUnauthorized: true } : undefined,
    waitForConnections: true,
    connectionLimit: Number(env.MYSQL_CONNECTION_LIMIT || 25),
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: true,
  };
}

export function describeMysqlConfig(config: MysqlConfig): string {
  return `${config.user}@${config.host}:${config.port}/${config.database}${config.ssl ? ' (TLS)' : ''}`;
}

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) pool = mysql.createPool(readMysqlConfig());
  return pool;
}

export async function verifyMysqlConnection(): Promise<void> {
  const connection = await getPool().getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function closeMysqlPool(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
}
