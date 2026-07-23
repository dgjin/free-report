import { runMigration } from './run-sql-file';

for (const file of ['sql/001_schema.sql', 'sql/003_fix_vehicle_detail_fields.sql', 'sql/004_department_reporting.sql']) {
  console.log(`${await runMigration(file)} ${file}`);
}
