-- 012: 智能问数安全加固
-- 方案 1：模板级 AI 查询开关
-- 方案 2：字段级敏感度标记

-- 模板级 AI 查询开关：管理员可将含敏感数据的模板排除在 AI 问数之外
ALTER TABLE report_templates
    ADD COLUMN ai_query_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '是否在智能问数中可用：1=可用 0=排除';

-- 字段级敏感度标记：标记为敏感的字段不会出现在 LLM 上下文中
ALTER TABLE report_template_fields
    ADD COLUMN `sensitive` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '是否敏感字段：1=敏感(排除在AI问数外) 0=非敏感';
