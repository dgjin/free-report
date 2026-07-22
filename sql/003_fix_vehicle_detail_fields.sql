UPDATE report_template_fields f
JOIN report_templates t ON t.id = f.template_id
SET f.data_type = 'detail'
WHERE t.name = '公务车管理台账'
  AND f.field_label IN ('品牌', '购买金额', '购买时间', '使用状态');

UPDATE report_template_fields f
JOIN report_templates t ON t.id = f.template_id
SET f.status = 'inactive'
WHERE t.name = '公务车管理台账'
  AND f.field_name IN ('total_value', 'item_name');
