-- 013: 修复交叉表 data_type ENUM 缺少 'matrix' 值
-- 根因: 001_schema.sql 中 data_type ENUM('summary','detail') 未包含 'matrix'
-- 但 TemplateService.addMatrixFields() 设置 field.setDataType("matrix")
-- 导致 MySQL 拒绝写入，创建交叉表字段时 500 错误

ALTER TABLE report_template_fields
    MODIFY COLUMN data_type ENUM('summary','detail','matrix') NOT NULL;
