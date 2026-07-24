-- Performance indexes: avoid full table scans in auth, approvals, and aggregation queries.
-- report_submissions: getPendingApprovalsForUser filters by submitted_by_company_id + status
CREATE INDEX idx_submissions_company_status ON report_submissions(submitted_by_company_id, status);

-- report_submissions: history and submission-detail routes join/lookup by submitted_by
CREATE INDEX idx_submissions_submitted_by ON report_submissions(submitted_by);

-- report_submission_data: aggregation batch-fetch groups by submission_id (already has partial idx, add dedicated)
-- idx_submission_data_submission(submission_id, row_index) already covers this; no action needed.

-- approval_records: pending-approvals query filters by submission_id + status
CREATE INDEX idx_approvals_submission_status ON approval_records(submission_id, status);
