ALTER TABLE companies MODIFY level ENUM('headquarter','department','branch') NOT NULL;
ALTER TABLE users MODIFY role ENUM('super_admin','headquarter_admin','department_report_admin','branch_admin','handler','reviewer','approver') NOT NULL;

INSERT INTO companies (name,code,parent_id,level,status)
SELECT '办公室','HQ-OFFICE',id,'department','active' FROM companies WHERE code='HQ'
ON DUPLICATE KEY UPDATE name=VALUES(name), level='department';
INSERT INTO companies (name,code,parent_id,level,status)
SELECT '业务综合管理部','HQ-BUSINESS',id,'department','active' FROM companies WHERE code='HQ'
ON DUPLICATE KEY UPDATE name=VALUES(name), level='department';
INSERT INTO companies (name,code,parent_id,level,status)
SELECT '计划财务部','HQ-FINANCE',id,'department','active' FROM companies WHERE code='HQ'
ON DUPLICATE KEY UPDATE name=VALUES(name), level='department';
INSERT INTO companies (name,code,parent_id,level,status)
SELECT '风险管理部','HQ-RISK',id,'department','active' FROM companies WHERE code='HQ'
ON DUPLICATE KEY UPDATE name=VALUES(name), level='department';

ALTER TABLE report_templates ADD COLUMN owner_department_id BIGINT UNSIGNED NULL AFTER created_by;
UPDATE report_templates SET owner_department_id=(SELECT id FROM companies WHERE code='HQ-BUSINESS') WHERE owner_department_id IS NULL;
ALTER TABLE report_templates MODIFY owner_department_id BIGINT UNSIGNED NOT NULL,
  ADD INDEX idx_templates_owner_status(owner_department_id,status),
  ADD CONSTRAINT fk_templates_owner_department FOREIGN KEY(owner_department_id) REFERENCES companies(id);

ALTER TABLE report_assignments ADD COLUMN issuer_department_id BIGINT UNSIGNED NULL AFTER assigned_by;
UPDATE report_assignments SET issuer_department_id=(SELECT id FROM companies WHERE code='HQ-BUSINESS') WHERE issuer_department_id IS NULL;
ALTER TABLE report_assignments
  MODIFY status ENUM('pending','filling','submitted','pending_receipt','received','returned','approved','aggregated','rejected') NOT NULL DEFAULT 'pending',
  MODIFY issuer_department_id BIGINT UNSIGNED NOT NULL,
  ADD INDEX idx_assignments_issuer_status(issuer_department_id,status),
  ADD CONSTRAINT fk_assignments_issuer_department FOREIGN KEY(issuer_department_id) REFERENCES companies(id);

ALTER TABLE report_submissions MODIFY status ENUM('draft','pending_review','pending_approval','pending_receipt','received','returned','approved','rejected') NOT NULL;

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
