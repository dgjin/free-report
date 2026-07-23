export type CompanyLevel = 'headquarter' | 'department' | 'branch';
export type Role =
  | 'super_admin'
  | 'headquarter_admin'
  | 'department_report_admin'
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
export type TemplateStatus = 'draft' | 'published' | 'archived';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea';
export type DataType = 'summary' | 'detail';
export type FieldStatus = 'active' | 'inactive';

export interface FieldConfig {
  required?: boolean;
  options?: string[];
  placeholder?: string;
  min?: number;
  max?: number;
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
  | 'approved'
  | 'aggregated'
  | 'rejected';

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
  deadline: string;
  status: AssignmentStatus;
  assigned_by: number;
  issuer_department_id?: number;
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
  | 'approved'
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
  value: string;
  row_index: number;
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
