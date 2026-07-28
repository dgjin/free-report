export type CompanyLevel = 'headquarter' | 'department' | 'branch';
export type Role =
  | 'super_admin'
  | 'department_report_admin'
  | 'digital_admin'
  | 'branch_admin'
  | 'handler'
  | 'reviewer'
  | 'approver';

export interface UserInfo {
  id: number;
  username: string;
  display_name: string;
  company_id: number;
  company_name: string;
  company_code: string;
  company_level: CompanyLevel;
  role: Role;
}

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type TemplateStatus = 'draft' | 'pending_approval' | 'published' | 'archived';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea';
export type DataType = 'summary' | 'detail' | 'matrix';
export type FieldStatus = 'active' | 'inactive';

export interface MatrixConfig {
  row_label: string;
  row_options: string[];
  column_label: string;
}

export interface FieldConfig {
  required?: boolean;
  options?: string[];
  placeholder?: string;
  min?: number;
  max?: number;
  matrix?: MatrixConfig;
}

export interface ReportTemplateField {
  id: number;
  template_id: number;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  data_type: DataType;
  field_config: FieldConfig | string;
  sort_order: number;
  status: FieldStatus;
}

export interface ReportTemplate {
  id: number;
  name: string;
  description: string;
  period_type: PeriodType;
  status: TemplateStatus;
  created_by: number;
  owner_department_id?: number;
  created_by_name?: string;
  field_count?: number;
  assignment_count?: number;
  created_at: string;
  updated_at: string;
  fields?: ReportTemplateField[];
}

export interface Company {
  id: number;
  name: string;
  code: string;
  parent_id: number | null;
  level: CompanyLevel;
  address?: string;
  contact?: string;
  phone?: string;
  status: string;
  children?: Company[];
}

export type AssignmentStatus =
  | 'pending'
  | 'filling'
  | 'submitted'
  | 'pending_receipt'
  | 'received'
  | 'returned'
  | 'aggregated'
  | 'rejected'
  | 'recalled';

export interface ReportAssignment {
  id: number;
  template_id: number;
  template_name?: string;
  period_type?: string;
  assigned_to_company_id: number;
  company_name?: string;
  company_code?: string;
  title: string;
  period_label: string;
  is_one_time?: number | boolean;
  deadline: string;
  status: AssignmentStatus;
  assigned_by: number;
  issuer_department_id?: number;
  issuer_department_name?: string;
  assigned_by_name?: string;
  submission_status?: string;
  submission_version?: number;
  submission_id?: number | null;
  created_at: string;
  fields?: ReportTemplateField[];
}

export type SubmissionStatus =
  | 'draft'
  | 'pending_review'
  | 'pending_approval'
  | 'pending_receipt'
  | 'received'
  | 'returned'
  | 'rejected';

export interface ApprovalRecord {
  id: number;
  submission_id: number;
  approval_level: 'handler' | 'reviewer' | 'approver';
  approver_id: number;
  approver_name?: string;
  approver_role?: string;
  status: 'pending' | 'approved' | 'rejected';
  comment?: string;
  created_at: string;
  updated_at: string;
}

export interface SubmissionSummaryItem {
  field_id: number;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  value: string;
  row_index: number;
}

export interface SubmissionDetailItem {
  field_id: number;
  field_name: string;
  field_label: string;
  data_type?: DataType;
  value: string;
  row_index: number;
}

export interface SubmissionMatrixGroup {
  row_label: string;
  row_options: string[];
  columns: Array<{ field_id: number; field_label: string; field_type: FieldType }>;
}

export interface ReportSubmissionDetail {
  id: number;
  assignment_id: number;
  assignment_title?: string;
  template_name?: string;
  version: number;
  submitted_by_company_id: number;
  company_name?: string;
  submitted_by: number;
  submitted_by_name?: string;
  status: SubmissionStatus;
  comment?: string;
  submitted_at?: string;
  created_at: string;
  summary: SubmissionSummaryItem[];
  details: SubmissionDetailItem[][];
  approvals: ApprovalRecord[];
  matrix_groups?: SubmissionMatrixGroup[];
}

export interface PendingReceipt {
  id: number;
  submission_id: number;
  assignment_id: number;
  assignment_title: string;
  template_name: string;
  period_label: string;
  company_name: string;
  version: number;
  submitted_by_name: string;
  submitted_at: string;
  comment?: string;
}

export interface PendingApprovalTask {
  approval_id: number;
  submission_id: number;
  approval_level: 'handler' | 'reviewer' | 'approver';
  assignment_title: string;
  period_label: string;
  template_name: string;
  company_name: string;
  submitted_by_name: string;
  submitted_at: string;
  version: number;
  comment?: string;
}

export interface AggregationResponse {
  template: ReportTemplate;
  summary_fields: ReportTemplateField[];
  detail_fields: ReportTemplateField[];
  company_data: Array<{
    company_id: number;
    company_name: string;
    company_code: string;
    has_assignment: boolean;
    assignment_status: string;
    has_submitted: boolean;
    submission_status: string;
    submission_version: number;
    values: Record<string, string>;
  }>;
  summary: Record<string, { total: number; count: number; average: number }>;
  detail_rows: Array<Record<string, any>>;
  detail_summary: Record<string, { total: number; count: number; average: number }>;
}

export interface TemplateApproval {
  id: number;
  template_id: number;
  template_name?: string;
  department_name?: string;
  submitted_by: number;
  submitted_by_name?: string;
  reviewed_by?: number;
  status: 'pending' | 'approved' | 'rejected';
  comment?: string;
  created_at: string;
  updated_at: string;
}

/** Statuses that count as "approved" for aggregation statistics */
export const APPROVED_SUBMISSION_STATUSES = ['pending_receipt', 'received'];

/** Human-readable label for a submission status */
export function getSubmissionStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: '草稿',
    pending_review: '待复核',
    pending_approval: '待审批',
    pending_receipt: '待签收',
    received: '已签收',
    returned: '已退回',
    rejected: '已驳回',
  };
  return map[status] || status || '未提交';
}
