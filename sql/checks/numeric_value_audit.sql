-- ============================================================================
-- 数据质量巡检脚本（可重复执行，非迁移脚本）
--
-- 用途：定期检测聚合计算的静默漏算风险——value 列看似数字但 numeric_value
--       冗余列为 NULL 的脏数据。此类数据在 SQL 聚合（SUM/GROUP BY）时被静默
--       跳过，导致汇总结果偏小且不报任何错误。
--
-- 建议执行频率：每周一次，或在每次批量数据导入后执行。
-- 执行方式：mysql -u <user> -p <database> < sql/checks/numeric_value_audit.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 脏数据总量：字段类型为 number，但 numeric_value 为 NULL 且 value 含数字
--    结果为 0 表示健康；> 0 表示存在聚合漏算风险
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS suspect_rows
FROM report_submission_data d
JOIN report_template_fields f ON f.id = d.field_id
WHERE f.field_type = 'number'
  AND d.numeric_value IS NULL
  AND d.value REGEXP '[0-9]';

-- ----------------------------------------------------------------------------
-- 2. 脏数据明细：按模板分组，定位问题来源（哪张报表、哪些字段）
-- ----------------------------------------------------------------------------
SELECT t.id            AS template_id,
       t.name          AS template_name,
       f.field_name    AS field_name,
       f.field_label   AS field_label,
       COUNT(*)        AS suspect_rows,
       GROUP_CONCAT(DISTINCT LEFT(d.value, 40) SEPARATOR ' | ') AS sample_values
FROM report_submission_data d
JOIN report_template_fields f ON f.id = d.field_id
JOIN report_templates t ON t.id = f.template_id
WHERE f.field_type = 'number'
  AND d.numeric_value IS NULL
  AND d.value REGEXP '[0-9]'
GROUP BY t.id, t.name, f.field_name, f.field_label
ORDER BY suspect_rows DESC;

-- ----------------------------------------------------------------------------
-- 3. 脏数据样例：最近 50 条，供人工排查写入路径
-- ----------------------------------------------------------------------------
SELECT d.id,
       d.submission_id,
       f.field_name,
       d.value,
       d.created_at
FROM report_submission_data d
JOIN report_template_fields f ON f.id = d.field_id
WHERE f.field_type = 'number'
  AND d.numeric_value IS NULL
  AND d.value REGEXP '[0-9]'
ORDER BY d.created_at DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 4. 修复参考：确认脏数据均为可解析数字后，可执行回填（请先备份再执行）
--    注意：以下 UPDATE 默认注释掉，确认第 3 节样例中的 value 均为合法数字
--    （含千分位/空格的需先清洗）后再取消注释执行。
-- ----------------------------------------------------------------------------
-- UPDATE report_submission_data d
-- JOIN report_template_fields f ON f.id = d.field_id
-- SET d.numeric_value = CAST(REPLACE(REPLACE(d.value, ',', ''), ' ', '') AS DECIMAL(18,4))
-- WHERE f.field_type = 'number'
--   AND d.numeric_value IS NULL
--   AND REPLACE(REPLACE(d.value, ',', ''), ' ', '') REGEXP '^-?[0-9]+\\.?[0-9]*$';
