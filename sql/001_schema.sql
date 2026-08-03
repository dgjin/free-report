CREATE TABLE IF NOT EXISTS companies (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL UNIQUE,
  parent_id BIGINT UNSIGNED NULL,
  level ENUM('headquarter', 'department', 'branch') NOT NULL,
  address VARCHAR(255) NULL,
  contact VARCHAR(80) NULL,
  phone VARCHAR(40) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_companies_parent FOREIGN KEY (parent_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  role ENUM('super_admin','headquarter_admin','department_report_admin','branch_admin','handler','reviewer','approver','digital_admin') NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_users_company_role (company_id, role, status),
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS report_templates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  period_type ENUM('daily','weekly','monthly','quarterly','yearly','custom') NOT NULL,
  status ENUM('draft','pending_approval','published','archived') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  owner_department_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_templates_owner_status(owner_department_id,status),
  CONSTRAINT fk_templates_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_templates_owner_department FOREIGN KEY(owner_department_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS report_template_fields (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(160) NOT NULL,
  field_type ENUM('text','number','date','select','textarea','matrix') NOT NULL,
  data_type ENUM('summary','detail','matrix') NOT NULL,
  field_config JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_template_field_name (template_id, field_name),
  INDEX idx_template_fields_order (template_id, data_type, sort_order),
  CONSTRAINT fk_fields_template FOREIGN KEY (template_id) REFERENCES report_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS report_assignments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  assigned_to_company_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  period_label VARCHAR(80) NOT NULL,
  deadline DATE NOT NULL,
  status ENUM('pending','filling','submitted','pending_receipt','received','returned','approved','aggregated','rejected','recalled') NOT NULL DEFAULT 'pending',
  assigned_by BIGINT UNSIGNED NOT NULL,
  issuer_department_id BIGINT UNSIGNED NOT NULL,
  is_one_time TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_assignment_period (template_id, assigned_to_company_id, period_label),
  INDEX idx_assignments_company_status (assigned_to_company_id, status),
  INDEX idx_assignments_issuer_status(issuer_department_id,status),
  CONSTRAINT fk_assignments_template FOREIGN KEY (template_id) REFERENCES report_templates(id),
  CONSTRAINT fk_assignments_company FOREIGN KEY (assigned_to_company_id) REFERENCES companies(id),
  CONSTRAINT fk_assignments_assigner FOREIGN KEY (assigned_by) REFERENCES users(id),
  CONSTRAINT fk_assignments_issuer_department FOREIGN KEY(issuer_department_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS report_submissions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  submitted_by_company_id BIGINT UNSIGNED NOT NULL,
  submitted_by BIGINT UNSIGNED NOT NULL,
  status ENUM('draft','pending_review','pending_approval','pending_receipt','received','returned','approved','rejected') NOT NULL,
  comment TEXT NULL,
  submitted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_submission_version (assignment_id, version),
  INDEX idx_submissions_assignment_status (assignment_id, status, version),
  CONSTRAINT fk_submissions_assignment FOREIGN KEY (assignment_id) REFERENCES report_assignments(id),
  CONSTRAINT fk_submissions_company FOREIGN KEY (submitted_by_company_id) REFERENCES companies(id),
  CONSTRAINT fk_submissions_user FOREIGN KEY (submitted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS report_submission_data (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  submission_id BIGINT UNSIGNED NOT NULL,
  field_id BIGINT UNSIGNED NOT NULL,
  row_index INT UNSIGNED NOT NULL,
  value TEXT NOT NULL,
  numeric_value DECIMAL(18,4) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_submission_field_row (submission_id, field_id, row_index),
  INDEX idx_submission_data_submission (submission_id, row_index),
  INDEX idx_sd_numeric (field_id, numeric_value),
  INDEX idx_sd_submission_covering (submission_id, field_id, row_index, numeric_value),
  INDEX idx_sd_submission_ordered (submission_id, row_index, field_id),
  CONSTRAINT fk_submission_data_submission FOREIGN KEY (submission_id) REFERENCES report_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_submission_data_field FOREIGN KEY (field_id) REFERENCES report_template_fields(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS approval_records (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  submission_id BIGINT UNSIGNED NOT NULL,
  approval_level ENUM('handler','reviewer','approver') NOT NULL,
  approver_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL,
  comment TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_approval_step (submission_id, approval_level),
  INDEX idx_approvals_assignee (approver_id, status),
  CONSTRAINT fk_approvals_submission FOREIGN KEY (submission_id) REFERENCES report_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_approvals_user FOREIGN KEY (approver_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS report_aggregations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  assignment_id BIGINT UNSIGNED NOT NULL UNIQUE,
  aggregated_data JSON NOT NULL,
  branch_count INT UNSIGNED NOT NULL,
  submitted_count INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_aggregations_template FOREIGN KEY (template_id) REFERENCES report_templates(id),
  CONSTRAINT fk_aggregations_assignment FOREIGN KEY (assignment_id) REFERENCES report_assignments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 总部签收表
CREATE TABLE IF NOT EXISTS submission_receipts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  submission_id BIGINT UNSIGNED NOT NULL,
  issuer_department_id BIGINT UNSIGNED NOT NULL,
  received_by BIGINT UNSIGNED NOT NULL,
  action ENUM('received','returned') NOT NULL,
  comment TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_submission_receipt(submission_id),
  INDEX idx_receipts_department_action(issuer_department_id,action,created_at),
  CONSTRAINT fk_receipts_submission FOREIGN KEY(submission_id) REFERENCES report_submissions(id),
  CONSTRAINT fk_receipts_department FOREIGN KEY(issuer_department_id) REFERENCES companies(id),
  CONSTRAINT fk_receipts_user FOREIGN KEY(received_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 收回审计表
CREATE TABLE IF NOT EXISTS assignment_recalls (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  recalled_by BIGINT UNSIGNED NOT NULL,
  issuer_department_id BIGINT UNSIGNED NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_recall_assignment FOREIGN KEY (assignment_id) REFERENCES report_assignments(id) ON DELETE CASCADE,
  INDEX idx_recalls_assignment (assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 模板审批记录表
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 模板周期下发计划
CREATE TABLE IF NOT EXISTS report_template_schedules (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  issue_month TINYINT NULL,
  issue_day TINYINT NOT NULL DEFAULT 5,
  deadline_offset_days INT NOT NULL DEFAULT 10,
  target_company_ids JSON NOT NULL,
  last_period_label VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_schedule_template (template_id),
  CONSTRAINT fk_schedule_template FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
