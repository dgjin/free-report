-- 009: 查询性能优化索引
-- 基于慢查询分析与 EXPLAIN 结果，补齐缺失的覆盖索引与过滤索引

-- 1. report_submission_data 覆盖索引：聚合查询 (submission_id, field_id, row_index, numeric_value)
--    影响查询：sumNumericFieldsByTemplateAndPeriod、sumNumericFieldsByAssignment
--    原 idx_submission_data_submission(submission_id, row_index) 仅覆盖两列，聚合需回表取 numeric_value
--    新索引为覆盖索引(covering index)，聚合查询无需回表
CREATE INDEX idx_sd_submission_covering
  ON report_submission_data (submission_id, field_id, row_index, numeric_value);

-- 2. report_assignments 按模板+周期查询索引
--    影响查询：findByTemplateAndPeriod（聚合服务 + 数据导入均高频调用）
--    原仅有 uq_assignment_period(template_id, assigned_to_company_id, period_label) 三列唯一键
--    但按 (template_id, period_label) 过滤时无法利用该唯一键的前缀
CREATE INDEX idx_assignments_template_period
  ON report_assignments (template_id, period_label);

-- 3. report_submissions 按状态查询索引
--    影响查询：findPendingReceipts（WHERE s.status = 'pending_receipt'）
--    原 idx_submissions_company_status 仅覆盖 submitted_by_company_id + status
--    纯 status 过滤无索引可用
CREATE INDEX idx_submissions_status
  ON report_submissions (status, submitted_by_company_id);

-- 4. report_assignments 分页查询优化索引
--    影响查询：findForUserPaged / countForUser（assigned_to_company_id + ORDER BY id DESC）
--    原 idx_assignments_company_status 仅覆盖 (assigned_to_company_id, status)
--    新增含 id 的索引避免 filesort
CREATE INDEX idx_assignments_company_id
  ON report_assignments (assigned_to_company_id, id);

-- 5. report_submissions 按 assignment_id + status 过滤索引
--    影响查询：findLatestApprovedByAssignmentIds 子查询中 WHERE status IN (...) GROUP BY assignment_id
--    原 idx_submissions_assignment_status(assignment_id, status, version) 已覆盖
--    但增加一个更紧凑的 (assignment_id, status) 用于 countApprovedSubmissions 等简单查询
--    （已有三列索引可覆盖，此处不再重复创建）

-- 6. report_submission_data 按 submission_id 查明细排序索引
--    影响查询：findDataBySubmissionId（WHERE submission_id = ? ORDER BY row_index, field_id）
--    原 idx_submission_data_submission(submission_id, row_index) 可用但缺 field_id
--    升级为三列索引避免排序
CREATE INDEX idx_sd_submission_ordered
  ON report_submission_data (submission_id, row_index, field_id);
