UPDATE users
SET company_id = (SELECT id FROM companies WHERE code='HQ-BUSINESS'),
    role = 'department_report_admin',
    display_name = '业务综合管理部报表管理员'
WHERE username = 'hq_admin' AND role = 'headquarter_admin';
