export type CompanyLevel = 'headquarter' | 'department' | 'branch';
export type CompanyStatus = 'active' | 'inactive';

export interface Company {
  id: number;
  name: string;
  code: string;
  parent_id: number | null;
  level: CompanyLevel;
  address?: string;
  contact?: string;
  phone?: string;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

export type Role =
  | 'super_admin'
  | 'headquarter_admin'
  | 'department_report_admin'
  | 'branch_admin'
  | 'handler'
  | 'reviewer'
  | 'approver';

export type UserStatus = 'active' | 'inactive';

export interface User {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  company_id: number;
  role: Role;
  status: UserStatus;
  created_at: string;
}

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type TemplateStatus = 'draft' | 'published' | 'archived';

export interface ReportTemplate {
  id: number;
  name: string;
  description: string;
  period_type: PeriodType;
  status: TemplateStatus;
  created_by: number;
  owner_department_id?: number;
  created_at: string;
  updated_at: string;
}

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
  assigned_to_company_id: number;
  title: string;
  period_label: string;
  deadline: string;
  status: AssignmentStatus;
  assigned_by: number;
  issuer_department_id?: number;
  created_at: string;
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

export interface ReportSubmission {
  id: number;
  assignment_id: number;
  version: number;
  submitted_by_company_id: number;
  submitted_by: number;
  status: SubmissionStatus;
  comment?: string;
  submitted_at?: string;
  created_at: string;
}

export interface ReportSubmissionData {
  id: number;
  submission_id: number;
  field_id: number;
  row_index: number; // 0 = summary, >0 = detail row
  value: string;
  created_at: string;
}

export type ApprovalLevel = 'handler' | 'reviewer' | 'approver';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRecord {
  id: number;
  submission_id: number;
  approval_level: ApprovalLevel;
  approver_id: number;
  status: ApprovalStatus;
  comment?: string;
  created_at: string;
  updated_at: string;
}

export interface ReportAggregation {
  id: number;
  template_id: number;
  assignment_id: number;
  aggregated_data: any;
  branch_count: number;
  submitted_count: number;
  created_at: string;
}
