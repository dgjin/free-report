-- 007: 报表下发强制收回 + 一次性下发
-- 1. report_assignments.status 新增 'recalled' 枚举值
ALTER TABLE report_assignments
  MODIFY COLUMN status ENUM(
    'pending','filling','submitted',
    'pending_receipt','received','returned',
    'approved','aggregated','rejected','recalled'
  ) NOT NULL DEFAULT 'pending';

-- 2. 新增 is_one_time 列：标记一次性下发（不受唯一周期约束）
ALTER TABLE report_assignments
  ADD COLUMN is_one_time TINYINT(1) NOT NULL DEFAULT 0 AFTER period_label;

-- 3. 收回审计表
CREATE TABLE IF NOT EXISTS assignment_recalls (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  recalled_by BIGINT UNSIGNED NOT NULL,
  issuer_department_id BIGINT UNSIGNED NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_recall_assignment FOREIGN KEY (assignment_id) REFERENCES report_assignments(id) ON DELETE CASCADE,
  INDEX idx_recalls_assignment (assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
