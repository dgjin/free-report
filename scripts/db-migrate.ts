import { runSqlFile } from './run-sql-file';

await runSqlFile('sql/001_schema.sql');
await runSqlFile('sql/003_fix_vehicle_detail_fields.sql');
