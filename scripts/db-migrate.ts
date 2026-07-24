import { runMigration } from './run-sql-file';

for (const file of ['sql/001_schema.sql', 'sql/003_fix_vehicle_detail_fields.sql', 'sql/004_department_reporting.sql', 'sql/005_department_admin_backfill.sql', 'sql/006_performance_indexes.sql']) {
  console.log(`${await runMigration(file)} ${file}`);
}
