-- 008: 模板审批工作流 + numeric_value 冗余列
-- 总部部门创建模板后，需经数智化转型办公室审批才能下发

-- 1. report_templates.status 新增 'pending_approval'
ALTER TABLE report_templates
  MODIFY COLUMN status ENUM('draft','pending_approval','published','archived')
  NOT NULL DEFAULT 'draft';

-- 2. users.role 新增 'digital_admin'
ALTER TABLE users
  MODIFY COLUMN role ENUM('super_admin','headquarter_admin','department_report_admin',
    'branch_admin','handler','reviewer','approver','digital_admin') NOT NULL;

-- 3. 新增数智化转型办公室部门
INSERT IGNORE INTO companies (name,code,parent_id,level,status)
SELECT '数智化转型办公室','HQ-DIGITAL',id,'department','active'
FROM companies WHERE code='HQ';

-- 4. 数智化转型办公室管理员账号（密码 123456）
INSERT IGNORE INTO users (username,password_hash,display_name,company_id,role,status)
SELECT 'digital_admin','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu',
  '数智化转型办公室管理员',id,'digital_admin','active'
FROM companies WHERE code='HQ-DIGITAL';

-- 5. 模板审批记录表
CREATE TABLE IF NOT EXISTS template_approvals (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  submitted_by BIGINT UNSIGNED NOT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  comment TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_ta_template (template_id, status),
  INDEX idx_ta_status (status),
  CONSTRAINT fk_ta_template FOREIGN KEY (template_id) REFERENCES report_templates(id),
  CONSTRAINT fk_ta_submitter FOREIGN KEY (submitted_by) REFERENCES users(id),
  CONSTRAINT fk_ta_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. submission_data 增加 numeric_value 冗余列，支持 SQL 聚合
ALTER TABLE report_submission_data
  ADD COLUMN numeric_value DECIMAL(18,4) NULL AFTER value,
  ADD INDEX idx_sd_numeric (field_id, numeric_value);

-- 回填已有数值数据
UPDATE report_submission_data d
JOIN report_template_fields f ON d.field_id = f.id
SET d.numeric_value = CAST(d.value AS DECIMAL(18,4))
WHERE f.field_type = 'number' AND d.value REGEXP '^-?[0-9]+\.?[0-9]*$';
