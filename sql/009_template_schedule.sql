-- ============================================================================
-- 009: 模板周期下发计划
-- 模板可配置月/季/年周期的自动下发时间与目标分公司；
-- 模板审批发布（published）后由调度器按规则自动生成后续周期下发任务。
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_template_schedules (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  issue_month TINYINT NULL,              -- 仅年报：每年第几月下发（1-12）
  issue_day TINYINT NOT NULL DEFAULT 5,  -- 月报=每月N日；季报=每季首月N日；年报=issue_month月N日（1-28）
  deadline_offset_days INT NOT NULL DEFAULT 10,  -- 下发后 N 天为填报截止日
  target_company_ids JSON NOT NULL,      -- 自动下发目标机构 ID 数组
  last_period_label VARCHAR(80) NULL,    -- 最近已生成分期标签（防重复生成）
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_schedule_template (template_id),
  CONSTRAINT fk_schedule_template FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (filename) VALUES ('009_template_schedule.sql')
ON DUPLICATE KEY UPDATE applied_at = CURRENT_TIMESTAMP;
