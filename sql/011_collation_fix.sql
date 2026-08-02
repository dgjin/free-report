-- ============================================================================
-- 011: Collation 统一修复
-- assignment_recalls (007) 和 template_approvals (008) 使用了 utf8mb4_unicode_ci，
-- 与其余表 (utf8mb4_0900_ai_ci) 不一致，跨表 JOIN 会产生隐式字符集转换。
-- ============================================================================

ALTER TABLE assignment_recalls CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE template_approvals CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (filename) VALUES ('011_collation_fix.sql')
ON DUPLICATE KEY UPDATE applied_at = CURRENT_TIMESTAMP;
