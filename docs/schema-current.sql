-- ============================================================================
-- Free Report 当前数据库完整结构参考（schema-current.sql）
--
-- 本文件合并 sql/001 ~ sql/008 全部迁移后的最终结构，与线上库 mysqldump
-- 导出结果一致。每处变更以注释标注来源迁移文件：
--   [001] 001_schema.sql                  基础表结构
--   [003] 003_fix_vehicle_detail_fields.sql 数据修正（无 DDL）
--   [004] 004_department_reporting.sql    部门化报送（部门/签收）
--   [005] 005_department_admin_backfill.sql 数据回填（无 DDL）
--   [006] 006_performance_indexes.sql     性能索引
--   [007] 007_recall_and_onetime.sql      强制收回 + 一次性下发
--   [008] 008_template_approval.sql       模板审批流 + numeric_value 冗余列
--
-- 注意：
--   1. report_template_fields.data_type 的 'matrix' 枚举在迁移文件之外
--      直接应用于库中（支撑交叉表/矩阵填报），本文件按实际结构记录。
--   2. 本文件仅作结构参考，不作为迁移脚本执行；环境初始化请按序执行
--      sql/001 ~ sql/008。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 组织机构表（总部 / 部门 / 支行）
-- ----------------------------------------------------------------------------
CREATE TABLE companies (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL UNIQUE,
  parent_id BIGINT UNSIGNED NULL,                          -- [001] 自引用，总部下挂部门/支行
  level ENUM('headquarter','department','branch') NOT NULL,-- [004] 新增 'department' 层级
  address VARCHAR(255) NULL,
  contact VARCHAR(80) NULL,
  phone VARCHAR(40) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_companies_parent FOREIGN KEY (parent_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- 用户表
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  -- [004] 新增 'department_report_admin'；[008] 新增 'digital_admin'（数智化转型办公室）
  role ENUM('super_admin','headquarter_admin','department_report_admin',
            'branch_admin','handler','reviewer','approver','digital_admin') NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_users_company_role (company_id, role, status),
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- 报表模板表
-- ----------------------------------------------------------------------------
CREATE TABLE report_templates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  period_type ENUM('daily','weekly','monthly','quarterly','yearly','custom') NOT NULL,
  -- [008] 新增 'pending_approval'：模板需经数智化转型办公室审批后方可下发
  status ENUM('draft','pending_approval','published','archived') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  owner_department_id BIGINT UNSIGNED NOT NULL,            -- [004] 模板归属部门
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_templates_owner_status (owner_department_id, status),           -- [004]
  CONSTRAINT fk_templates_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_templates_owner_department FOREIGN KEY (owner_department_id) REFERENCES companies(id) -- [004]
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- 模板字段表
-- ----------------------------------------------------------------------------
CREATE TABLE report_template_fields (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(160) NOT NULL,
  field_type ENUM('text','number','date','select','textarea') NOT NULL,
  -- 'matrix' 为迁移文件之外直接应用的枚举（交叉表/矩阵填报），按实际库结构记录
  data_type ENUM('summary','detail','matrix') NOT NULL DEFAULT 'detail',
  field_config JSON NOT NULL,                              -- 选项/校验/矩阵行列等配置
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_template_field_name (template_id, field_name),
  INDEX idx_template_fields_order (template_id, data_type, sort_order),
  CONSTRAINT fk_fields_template FOREIGN KEY (template_id) REFERENCES report_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- 报表下发任务表
-- ----------------------------------------------------------------------------
CREATE TABLE report_assignments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  assigned_to_company_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  period_label VARCHAR(80) NOT NULL,
  is_one_time TINYINT(1) NOT NULL DEFAULT 0,               -- [007] 一次性下发（不受唯一周期约束）
  deadline DATE NOT NULL,
  -- [004] 新增 pending_receipt/received/returned；[007] 新增 'recalled'（强制收回）
  status ENUM('pending','filling','submitted',
              'pending_receipt','received','returned',
              'approved','aggregated','rejected','recalled') NOT NULL DEFAULT 'pending',
  assigned_by BIGINT UNSIGNED NOT NULL,
  issuer_department_id BIGINT UNSIGNED NOT NULL,           -- [004] 下发部门
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_assignment_period (template_id, assigned_to_company_id, period_label),
  INDEX idx_assignments_company_status (assigned_to_company_id, status),
  INDEX idx_assignments_issuer_status (issuer_department_id, status),       -- [004]
  CONSTRAINT fk_assignments_template FOREIGN KEY (template_id) REFERENCES report_templates(id),
  CONSTRAINT fk_assignments_company FOREIGN KEY (assigned_to_company_id) REFERENCES companies(id),
  CONSTRAINT fk_assignments_assigner FOREIGN KEY (assigned_by) REFERENCES users(id),
  CONSTRAINT fk_assignments_issuer_department FOREIGN KEY (issuer_department_id) REFERENCES companies(id) -- [004]
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- 下发收回审计表 [007]
-- ----------------------------------------------------------------------------
CREATE TABLE assignment_recalls (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  recalled_by BIGINT UNSIGNED NOT NULL,
  issuer_department_id BIGINT UNSIGNED NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_recalls_assignment (assignment_id),
  CONSTRAINT fk_recall_assignment FOREIGN KEY (assignment_id) REFERENCES report_assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 报表提交表（按 version 支持多版重报）
-- ----------------------------------------------------------------------------
CREATE TABLE report_submissions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  submitted_by_company_id BIGINT UNSIGNED NOT NULL,
  submitted_by BIGINT UNSIGNED NOT NULL,
  -- [004] 新增 pending_receipt/received/returned（部门签收环节）
  status ENUM('draft','pending_review','pending_approval',
              'pending_receipt','received','returned',
              'approved','rejected') NOT NULL,
  comment TEXT NULL,
  submitted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_submission_version (assignment_id, version),
  INDEX idx_submissions_assignment_status (assignment_id, status, version),
  INDEX idx_submissions_company_status (submitted_by_company_id, status),   -- [006]
  INDEX idx_submissions_submitted_by (submitted_by),                        -- [006]
  CONSTRAINT fk_submissions_assignment FOREIGN KEY (assignment_id) REFERENCES report_assignments(id),
  CONSTRAINT fk_submissions_company FOREIGN KEY (submitted_by_company_id) REFERENCES companies(id),
  CONSTRAINT fk_submissions_user FOREIGN KEY (submitted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- 提交明细数据表（EAV 结构，row_index 支撑明细行/矩阵单元格）
-- ----------------------------------------------------------------------------
CREATE TABLE report_submission_data (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  submission_id BIGINT UNSIGNED NOT NULL,
  field_id BIGINT UNSIGNED NOT NULL,
  row_index INT UNSIGNED NOT NULL,
  value TEXT NOT NULL,
  numeric_value DECIMAL(18,4) NULL,                        -- [008] 数值冗余列，SQL 聚合免 CAST
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_submission_field_row (submission_id, field_id, row_index),
  INDEX idx_submission_data_submission (submission_id, row_index),
  INDEX idx_sd_numeric (field_id, numeric_value),                           -- [008]
  CONSTRAINT fk_submission_data_submission FOREIGN KEY (submission_id) REFERENCES report_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_submission_data_field FOREIGN KEY (field_id) REFERENCES report_template_fields(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- 支行内部三级审批记录表
-- ----------------------------------------------------------------------------
CREATE TABLE approval_records (
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
  INDEX idx_approvals_submission_status (submission_id, status),            -- [006]
  CONSTRAINT fk_approvals_submission FOREIGN KEY (submission_id) REFERENCES report_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_approvals_user FOREIGN KEY (approver_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- 部门签收记录表 [004]
-- ----------------------------------------------------------------------------
CREATE TABLE submission_receipts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  submission_id BIGINT UNSIGNED NOT NULL,
  issuer_department_id BIGINT UNSIGNED NOT NULL,
  received_by BIGINT UNSIGNED NOT NULL,
  action ENUM('received','returned') NOT NULL,
  comment TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_submission_receipt (submission_id),
  INDEX idx_receipts_department_action (issuer_department_id, action, created_at),
  CONSTRAINT fk_receipts_submission FOREIGN KEY (submission_id) REFERENCES report_submissions(id),
  CONSTRAINT fk_receipts_department FOREIGN KEY (issuer_department_id) REFERENCES companies(id),
  CONSTRAINT fk_receipts_user FOREIGN KEY (received_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- 汇总结果快照表
-- ----------------------------------------------------------------------------
CREATE TABLE report_aggregations (
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

-- ----------------------------------------------------------------------------
-- 模板审批记录表 [008]
-- 总部部门创建模板（draft）→ 提交审批（pending_approval）→
-- 数智化转型办公室审批通过（published）/ 驳回（draft）
-- ----------------------------------------------------------------------------
CREATE TABLE template_approvals (
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

-- ----------------------------------------------------------------------------
-- 迁移记录表
-- ----------------------------------------------------------------------------
CREATE TABLE schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
