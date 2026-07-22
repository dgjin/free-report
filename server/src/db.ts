import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import {
  Company,
  User,
  ReportTemplate,
  ReportTemplateField,
  ReportAssignment,
  ReportSubmission,
  ReportSubmissionData,
  ApprovalRecord,
  ReportAggregation,
} from './types';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DATA_DIR, 'free-report-db.json');

export function writeJsonAtomically(filePath: string, value: unknown): void {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf-8');
  fs.renameSync(temporaryPath, filePath);
}

interface DatabaseSchema {
  companies: Company[];
  users: User[];
  report_templates: ReportTemplate[];
  report_template_fields: ReportTemplateField[];
  report_assignments: ReportAssignment[];
  report_submissions: ReportSubmission[];
  report_submission_data: ReportSubmissionData[];
  approval_records: ApprovalRecord[];
  report_aggregations: ReportAggregation[];
  counters: {
    companies: number;
    users: number;
    report_templates: number;
    report_template_fields: number;
    report_assignments: number;
    report_submissions: number;
    report_submission_data: number;
    approval_records: number;
    report_aggregations: number;
  };
}

export class DomainError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'DomainError';
  }
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.ensureDirectory();
    this.data = this.loadDatabase();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadDatabase(): DatabaseSchema {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
      } catch (e) {
        console.error('Error reading DB file, creating new:', e);
      }
    }
    const initial = this.getSeedData();
    this.saveDatabase(initial);
    return initial;
  }

  private saveDatabase(dataToSave?: DatabaseSchema) {
    this.ensureDirectory();
    const data = dataToSave || this.data;
    writeJsonAtomically(DB_FILE, data);
  }

  public save() {
    this.saveDatabase();
  }

  private getSeedData(): DatabaseSchema {
    const passwordHash = bcrypt.hashSync('123456', 10);
    const now = new Date().toISOString();

    const companies: Company[] = [
      { id: 1, name: '总部', code: 'HQ', parent_id: null, level: 'headquarter', address: '北京市朝阳区总部大厦', contact: '张总', phone: '010-88888888', status: 'active', created_at: now, updated_at: now },
      { id: 2, name: '北京分公司', code: 'BJ', parent_id: 1, level: 'branch', address: '北京市海淀区科技园', contact: '李经理', phone: '010-66666666', status: 'active', created_at: now, updated_at: now },
      { id: 3, name: '上海分公司', code: 'SH', parent_id: 1, level: 'branch', address: '上海市浦东新区陆家嘴金融中心', contact: '王经理', phone: '021-88886666', status: 'active', created_at: now, updated_at: now },
      { id: 4, name: '广州分公司', code: 'GZ', parent_id: 1, level: 'branch', address: '广州市天河区珠江新城', contact: '陈经理', phone: '020-88889999', status: 'active', created_at: now, updated_at: now },
    ];

    const users: User[] = [
      { id: 1, username: 'admin', password_hash: passwordHash, display_name: '超级管理员', company_id: 1, role: 'super_admin', status: 'active', created_at: now },
      { id: 2, username: 'hq_admin', password_hash: passwordHash, display_name: '总部管理员', company_id: 1, role: 'headquarter_admin', status: 'active', created_at: now },
      
      { id: 3, username: 'bj_handler', password_hash: passwordHash, display_name: '北京经办人', company_id: 2, role: 'handler', status: 'active', created_at: now },
      { id: 4, username: 'bj_reviewer', password_hash: passwordHash, display_name: '北京复核人', company_id: 2, role: 'reviewer', status: 'active', created_at: now },
      { id: 5, username: 'bj_approver', password_hash: passwordHash, display_name: '北京审批人', company_id: 2, role: 'approver', status: 'active', created_at: now },
      
      { id: 6, username: 'sh_handler', password_hash: passwordHash, display_name: '上海经办人', company_id: 3, role: 'handler', status: 'active', created_at: now },
      { id: 7, username: 'sh_reviewer', password_hash: passwordHash, display_name: '上海复核人', company_id: 3, role: 'reviewer', status: 'active', created_at: now },
      { id: 8, username: 'sh_approver', password_hash: passwordHash, display_name: '上海审批人', company_id: 3, role: 'approver', status: 'active', created_at: now },

      { id: 9, username: 'gz_handler', password_hash: passwordHash, display_name: '广州经办人', company_id: 4, role: 'handler', status: 'active', created_at: now },
      { id: 10, username: 'gz_reviewer', password_hash: passwordHash, display_name: '广州复核人', company_id: 4, role: 'reviewer', status: 'active', created_at: now },
      { id: 11, username: 'gz_approver', password_hash: passwordHash, display_name: '广州审批人', company_id: 4, role: 'approver', status: 'active', created_at: now },
    ];

    const report_templates: ReportTemplate[] = [
      { id: 1, name: '月度销售与经营报表', description: '汇总各分公司月度销售收入、利润及核心产品销售明细', period_type: 'monthly', status: 'published', created_by: 1, created_at: now, updated_at: now },
      { id: 2, name: '季度资产与设备清查表', description: '清查各分公司季度固定资产、设备状况及盘点明细', period_type: 'quarterly', status: 'published', created_by: 2, created_at: now, updated_at: now },
    ];

    const report_template_fields: ReportTemplateField[] = [
      // Template 1 Summary
      { id: 1, template_id: 1, field_name: 'total_revenue', field_label: '总收入（万元）', field_type: 'number', data_type: 'summary', field_config: { required: true }, sort_order: 1, status: 'active' },
      { id: 2, template_id: 1, field_name: 'net_profit', field_label: '净利润（万元）', field_type: 'number', data_type: 'summary', field_config: { required: true }, sort_order: 2, status: 'active' },
      { id: 3, template_id: 1, field_name: 'total_employees', field_label: '在册员工数（人）', field_type: 'number', data_type: 'summary', field_config: { required: false }, sort_order: 3, status: 'active' },
      { id: 4, template_id: 1, field_name: 'reporting_date', field_label: '填报基准日', field_type: 'date', data_type: 'summary', field_config: { required: true }, sort_order: 4, status: 'active' },
      { id: 5, template_id: 1, field_name: 'remark', field_label: '经营情况说明', field_type: 'textarea', data_type: 'summary', field_config: { required: false }, sort_order: 5, status: 'active' },
      // Template 1 Detail
      { id: 6, template_id: 1, field_name: 'product_name', field_label: '产品/项目名称', field_type: 'text', data_type: 'detail', field_config: { required: true }, sort_order: 1, status: 'active' },
      { id: 7, template_id: 1, field_name: 'sales_amount', field_label: '销量/数量（件）', field_type: 'number', data_type: 'detail', field_config: { required: true }, sort_order: 2, status: 'active' },
      { id: 8, template_id: 1, field_name: 'sales_revenue', field_label: '产品销售额（万元）', field_type: 'number', data_type: 'detail', field_config: { required: true }, sort_order: 3, status: 'active' },
      { id: 9, template_id: 1, field_name: 'channel', field_label: '销售渠道', field_type: 'select', data_type: 'detail', field_config: { required: false, options: ['直销', '代理商', '线上平台', '大客户'] }, sort_order: 4, status: 'active' },

      // Template 2 Summary
      { id: 10, template_id: 2, field_name: 'asset_total_value', field_label: '资产总估值（万元）', field_type: 'number', data_type: 'summary', field_config: { required: true }, sort_order: 1, status: 'active' },
      { id: 11, template_id: 2, field_name: 'inspect_result', field_label: '盘点结论', field_type: 'select', data_type: 'summary', field_config: { required: true, options: ['良好', '正常', '存在轻微异常', '需要整改'] }, sort_order: 2, status: 'active' },
      // Template 2 Detail
      { id: 12, template_id: 2, field_name: 'asset_code', field_label: '资产编号', field_type: 'text', data_type: 'detail', field_config: { required: true }, sort_order: 1, status: 'active' },
      { id: 13, template_id: 2, field_name: 'asset_name', field_label: '资产名称', field_type: 'text', data_type: 'detail', field_config: { required: true }, sort_order: 2, status: 'active' },
      { id: 14, template_id: 2, field_name: 'category', field_label: '资产类别', field_type: 'select', data_type: 'detail', field_config: { required: true, options: ['办公设备', 'IT基础设施', '生产机械', '运输车辆', '其他'] }, sort_order: 3, status: 'active' },
      { id: 15, template_id: 2, field_name: 'original_value', field_label: '原值（元）', field_type: 'number', data_type: 'detail', field_config: { required: true }, sort_order: 4, status: 'active' },
      { id: 16, template_id: 2, field_name: 'current_status', field_label: '使用状态', field_type: 'select', data_type: 'detail', field_config: { required: true, options: ['正常在用', '待维修', '已提报废', '闲置中'] }, sort_order: 5, status: 'active' },
    ];

    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const report_assignments: ReportAssignment[] = [
      { id: 1, template_id: 1, assigned_to_company_id: 2, title: '2026年7月月度销售与经营报表（北京）', period_label: '2026年07月', deadline, status: 'approved', assigned_by: 1, created_at: now },
      { id: 2, template_id: 1, assigned_to_company_id: 3, title: '2026年7月月度销售与经营报表（上海）', period_label: '2026年07月', deadline, status: 'submitted', assigned_by: 1, created_at: now },
      { id: 3, template_id: 1, assigned_to_company_id: 4, title: '2026年7月月度销售与经营报表（广州）', period_label: '2026年07月', deadline, status: 'filling', assigned_by: 1, created_at: now },
      { id: 4, template_id: 2, assigned_to_company_id: 2, title: '2026年Q3资产与设备清查（北京）', period_label: '2026年Q3', deadline, status: 'pending', assigned_by: 2, created_at: now },
      { id: 5, template_id: 2, assigned_to_company_id: 3, title: '2026年Q3资产与设备清查（上海）', period_label: '2026年Q3', deadline, status: 'pending', assigned_by: 2, created_at: now },
    ];

    const report_submissions: ReportSubmission[] = [
      // Submission 1: Beijing (Approved)
      { id: 1, assignment_id: 1, version: 1, submitted_by_company_id: 2, submitted_by: 3, status: 'approved', comment: '月度经营指标良好，已完成全员审批', submitted_at: now, created_at: now },
      // Submission 2: Shanghai (Pending Approval at Approver level)
      { id: 2, assignment_id: 2, version: 1, submitted_by_company_id: 3, submitted_by: 6, status: 'pending_approval', comment: '经办人与复核人已校验完毕，请审批人终审', submitted_at: now, created_at: now },
    ];

    const report_submission_data: ReportSubmissionData[] = [
      // Beijing Submission Data
      { id: 1, submission_id: 1, field_id: 1, row_index: 0, value: '5200', created_at: now },
      { id: 2, submission_id: 1, field_id: 2, row_index: 0, value: '1380', created_at: now },
      { id: 3, submission_id: 1, field_id: 3, row_index: 0, value: '260', created_at: now },
      { id: 4, submission_id: 1, field_id: 4, row_index: 0, value: '2026-07-20', created_at: now },
      { id: 5, submission_id: 1, field_id: 5, row_index: 0, value: '本月华北市场开拓顺利，云服务订单增长显著。', created_at: now },
      // Beijing Detail Rows (Row 1 & Row 2)
      { id: 6, submission_id: 1, field_id: 6, row_index: 1, value: '企业级云平台A版', created_at: now },
      { id: 7, submission_id: 1, field_id: 7, row_index: 1, value: '150', created_at: now },
      { id: 8, submission_id: 1, field_id: 8, row_index: 1, value: '3000', created_at: now },
      { id: 9, submission_id: 1, field_id: 9, row_index: 1, value: '直销', created_at: now },

      { id: 10, submission_id: 1, field_id: 6, row_index: 2, value: '智能运维套件B版', created_at: now },
      { id: 11, submission_id: 1, field_id: 7, row_index: 2, value: '220', created_at: now },
      { id: 12, submission_id: 1, field_id: 8, row_index: 2, value: '2200', created_at: now },
      { id: 13, submission_id: 1, field_id: 9, row_index: 2, value: '代理商', created_at: now },

      // Shanghai Submission Data
      { id: 14, submission_id: 2, field_id: 1, row_index: 0, value: '6800', created_at: now },
      { id: 15, submission_id: 2, field_id: 2, row_index: 0, value: '1850', created_at: now },
      { id: 16, submission_id: 2, field_id: 3, row_index: 0, value: '310', created_at: now },
      { id: 17, submission_id: 2, field_id: 4, row_index: 0, value: '2026-07-21', created_at: now },
      { id: 18, submission_id: 2, field_id: 5, row_index: 0, value: '华东区域跨国公司大单交割完成。', created_at: now },
      // Shanghai Detail Rows (Row 1)
      { id: 19, submission_id: 2, field_id: 6, row_index: 1, value: '金融大数据解决方案', created_at: now },
      { id: 20, submission_id: 2, field_id: 7, row_index: 1, value: '80', created_at: now },
      { id: 21, submission_id: 2, field_id: 8, row_index: 1, value: '6800', created_at: now },
      { id: 22, submission_id: 2, field_id: 9, row_index: 1, value: '大客户', created_at: now },
    ];

    const approval_records: ApprovalRecord[] = [
      // Beijing 3-level approvals
      { id: 1, submission_id: 1, approval_level: 'handler', approver_id: 3, status: 'approved', comment: '经办人填报完成，申请复核', created_at: now, updated_at: now },
      { id: 2, submission_id: 1, approval_level: 'reviewer', approver_id: 4, status: 'approved', comment: '复核人核对单据无误，提交终审', created_at: now, updated_at: now },
      { id: 3, submission_id: 1, approval_level: 'approver', approver_id: 5, status: 'approved', comment: '审批通过，数据准予上报总部', created_at: now, updated_at: now },

      // Shanghai 3-level approvals (handler & reviewer approved, approver pending)
      { id: 4, submission_id: 2, approval_level: 'handler', approver_id: 6, status: 'approved', comment: '经办人完成填报', created_at: now, updated_at: now },
      { id: 5, submission_id: 2, approval_level: 'reviewer', approver_id: 7, status: 'approved', comment: '复核人校验通过', created_at: now, updated_at: now },
      { id: 6, submission_id: 2, approval_level: 'approver', approver_id: 8, status: 'pending', comment: '等待审批人终审', created_at: now, updated_at: now },
    ];

    const report_aggregations: ReportAggregation[] = [
      {
        id: 1,
        template_id: 1,
        assignment_id: 1,
        aggregated_data: {
          total_revenue: 5200,
          net_profit: 1380,
          total_employees: 260,
        },
        branch_count: 3,
        submitted_count: 1,
        created_at: now,
      },
    ];

    return {
      companies,
      users,
      report_templates,
      report_template_fields,
      report_assignments,
      report_submissions,
      report_submission_data,
      approval_records,
      report_aggregations,
      counters: {
        companies: 4,
        users: 11,
        report_templates: 2,
        report_template_fields: 16,
        report_assignments: 5,
        report_submissions: 2,
        report_submission_data: 22,
        approval_records: 6,
        report_aggregations: 1,
      },
    };
  }

  // Helper getters and mutators
  public getCompanies(): Company[] {
    return this.data.companies;
  }

  public getCompanyById(id: number): Company | undefined {
    return this.data.companies.find((c) => c.id === id);
  }

  public getUsers(): User[] {
    return this.data.users;
  }

  public getUserById(id: number): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public getUserByUsername(username: string): User | undefined {
    return this.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  public getTemplates(): ReportTemplate[] {
    return this.data.report_templates;
  }

  public getTemplateById(id: number): ReportTemplate | undefined {
    return this.data.report_templates.find((t) => t.id === id);
  }

  public getTemplateFields(templateId: number): ReportTemplateField[] {
    return this.data.report_template_fields
      .filter((f) => f.template_id === templateId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  public createTemplate(
    templateData: Omit<ReportTemplate, 'id' | 'created_at' | 'updated_at'>,
    fieldsData: Omit<ReportTemplateField, 'id' | 'template_id'>[]
  ): { template: ReportTemplate; fields: ReportTemplateField[] } {
    const now = new Date().toISOString();
    this.data.counters.report_templates += 1;
    const templateId = this.data.counters.report_templates;

    const template: ReportTemplate = {
      ...templateData,
      id: templateId,
      created_at: now,
      updated_at: now,
    };
    this.data.report_templates.push(template);

    const fields: ReportTemplateField[] = fieldsData.map((f, idx) => {
      this.data.counters.report_template_fields += 1;
      return {
        ...f,
        id: this.data.counters.report_template_fields,
        template_id: templateId,
        sort_order: f.sort_order ?? idx + 1,
        status: f.status || 'active',
      };
    });

    this.data.report_template_fields.push(...fields);
    this.save();

    return { template, fields };
  }

  public updateTemplate(id: number, updates: Partial<ReportTemplate>): ReportTemplate | null {
    const t = this.getTemplateById(id);
    if (!t) return null;
    Object.assign(t, updates, { updated_at: new Date().toISOString() });
    this.save();
    return t;
  }

  public addTemplateField(fieldData: Omit<ReportTemplateField, 'id'>): ReportTemplateField {
    this.data.counters.report_template_fields += 1;
    const field: ReportTemplateField = {
      ...fieldData,
      id: this.data.counters.report_template_fields,
    };
    this.data.report_template_fields.push(field);
    this.save();
    return field;
  }

  public disableTemplateField(fieldId: number): ReportTemplateField | null {
    const f = this.data.report_template_fields.find((field) => field.id === fieldId);
    if (!f) return null;
    f.status = 'inactive';
    this.save();
    return f;
  }

  public getAssignments(): ReportAssignment[] {
    return this.data.report_assignments;
  }

  public getAssignmentById(id: number): ReportAssignment | undefined {
    return this.data.report_assignments.find((a) => a.id === id);
  }

  public createAssignments(
    templateId: number,
    companyIds: number[],
    title: string,
    periodLabel: string,
    deadline: string,
    assignedBy: number
  ): ReportAssignment[] {
    const now = new Date().toISOString();
    const newAssignments: ReportAssignment[] = [];

    for (const companyId of companyIds) {
      // Check existing unique constraint UNIQUE(template_id, assigned_to_company_id, period_label)
      const existing = this.data.report_assignments.find(
        (a) =>
          a.template_id === templateId &&
          a.assigned_to_company_id === companyId &&
          a.period_label === periodLabel
      );

      if (existing) {
        continue;
      }

      this.data.counters.report_assignments += 1;
      const assignment: ReportAssignment = {
        id: this.data.counters.report_assignments,
        template_id: templateId,
        assigned_to_company_id: companyId,
        title,
        period_label: periodLabel,
        deadline,
        status: 'pending',
        assigned_by: assignedBy,
        created_at: now,
      };
      this.data.report_assignments.push(assignment);
      newAssignments.push(assignment);
    }

    this.save();
    return newAssignments;
  }

  public updateAssignmentStatus(assignmentId: number, status: ReportAssignment['status']) {
    const a = this.getAssignmentById(assignmentId);
    if (a) {
      a.status = status;
      this.save();
    }
  }

  public getSubmissions(): ReportSubmission[] {
    return this.data.report_submissions;
  }

  public getSubmissionById(id: number): ReportSubmission | undefined {
    return this.data.report_submissions.find((s) => s.id === id);
  }

  public getLatestSubmissionByAssignment(assignmentId: number): ReportSubmission | undefined {
    const list = this.data.report_submissions
      .filter((s) => s.assignment_id === assignmentId)
      .sort((a, b) => b.version - a.version);
    return list[0];
  }

  public getLatestApprovedSubmissionByAssignment(assignmentId: number): ReportSubmission | undefined {
    return this.data.report_submissions
      .filter((submission) => submission.assignment_id === assignmentId && submission.status === 'approved')
      .sort((a, b) => b.version - a.version)[0];
  }

  public createOrUpdateSubmission(
    assignmentId: number,
    userId: number,
    companyId: number,
    summaryData: Record<number, string>,
    detailData: Array<Record<number, string>>,
    comment?: string,
    isSubmit = false
  ): { submission: ReportSubmission; approvals: ApprovalRecord[] } {
    const now = new Date().toISOString();
    const assignment = this.getAssignmentById(assignmentId);
    if (!assignment) {
      throw new Error('Assignment not found');
    }

    const user = this.getUserById(userId);
    const isSuperAdmin = user?.role === 'super_admin';
    if (
      !user ||
      user.status !== 'active' ||
      user.company_id !== companyId ||
      (!isSuperAdmin && assignment.assigned_to_company_id !== companyId) ||
      (!isSuperAdmin && user.role !== 'handler' && user.role !== 'branch_admin')
    ) {
      throw new DomainError('你无权填写该任务', 403);
    }

    let existing = this.getLatestSubmissionByAssignment(assignmentId);
    let submission: ReportSubmission;

    if (existing && (existing.status === 'draft' || existing.status === 'rejected')) {
      // Update existing draft / rejected submission by incrementing version if rejected
      if (existing.status === 'rejected') {
        this.data.counters.report_submissions += 1;
        submission = {
          id: this.data.counters.report_submissions,
          assignment_id: assignmentId,
          version: existing.version + 1,
          submitted_by_company_id: companyId,
          submitted_by: userId,
          status: isSubmit ? 'pending_review' : 'draft',
          comment,
          submitted_at: isSubmit ? now : undefined,
          created_at: now,
        };
        this.data.report_submissions.push(submission);
      } else {
        existing.submitted_by = userId;
        existing.status = isSubmit ? 'pending_review' : 'draft';
        existing.comment = comment;
        if (isSubmit) existing.submitted_at = now;
        submission = existing;

        // Clear old submission data
        this.data.report_submission_data = this.data.report_submission_data.filter(
          (d) => d.submission_id !== submission.id
        );
      }
    } else {
      // New submission
      this.data.counters.report_submissions += 1;
      submission = {
        id: this.data.counters.report_submissions,
        assignment_id: assignmentId,
        version: existing ? existing.version + 1 : 1,
        submitted_by_company_id: companyId,
        submitted_by: userId,
        status: isSubmit ? 'pending_review' : 'draft',
        comment,
        submitted_at: isSubmit ? now : undefined,
        created_at: now,
      };
      this.data.report_submissions.push(submission);
    }

    // Insert Summary Data (row_index = 0)
    for (const [fieldIdStr, val] of Object.entries(summaryData)) {
      const fieldId = parseInt(fieldIdStr, 10);
      this.data.counters.report_submission_data += 1;
      this.data.report_submission_data.push({
        id: this.data.counters.report_submission_data,
        submission_id: submission.id,
        field_id: fieldId,
        row_index: 0,
        value: val ?? '',
        created_at: now,
      });
    }

    // Insert Detail Rows (row_index = 1, 2, ...)
    detailData.forEach((rowObj, index) => {
      const rowIndex = index + 1;
      for (const [fieldIdStr, val] of Object.entries(rowObj)) {
        const fieldId = parseInt(fieldIdStr, 10);
        this.data.counters.report_submission_data += 1;
        this.data.report_submission_data.push({
          id: this.data.counters.report_submission_data,
          submission_id: submission.id,
          field_id: fieldId,
          row_index: rowIndex,
          value: val ?? '',
          created_at: now,
        });
      }
    });

    // Update assignment status
    if (isSubmit) {
      assignment.status = 'submitted';
    } else {
      assignment.status = 'filling';
    }

    // Approval records creation if submitting
    const createdApprovals: ApprovalRecord[] = [];
    if (isSubmit) {
      // Add handler approval record
      this.data.counters.approval_records += 1;
      const handlerRecord: ApprovalRecord = {
        id: this.data.counters.approval_records,
        submission_id: submission.id,
        approval_level: 'handler',
        approver_id: userId,
        status: 'approved',
        comment: comment || '经办人已提交填报',
        created_at: now,
        updated_at: now,
      };
      this.data.approval_records.push(handlerRecord);
      createdApprovals.push(handlerRecord);

      // Find reviewer in same company
      const reviewer = this.data.users.find(
        (u) => u.company_id === companyId && u.role === 'reviewer'
      );

      this.data.counters.approval_records += 1;
      const reviewerRecord: ApprovalRecord = {
        id: this.data.counters.approval_records,
        submission_id: submission.id,
        approval_level: 'reviewer',
        approver_id: reviewer ? reviewer.id : userId,
        status: 'pending',
        comment: '等候复核',
        created_at: now,
        updated_at: now,
      };
      this.data.approval_records.push(reviewerRecord);
      createdApprovals.push(reviewerRecord);
    }

    this.save();
    return { submission, approvals: createdApprovals };
  }

  public getSubmissionData(submissionId: number): ReportSubmissionData[] {
    return this.data.report_submission_data.filter((d) => d.submission_id === submissionId);
  }

  public getApprovalRecords(submissionId: number): ApprovalRecord[] {
    return this.data.approval_records.filter((a) => a.submission_id === submissionId);
  }

  public processApprovalAction(
    submissionId: number,
    approverUser: User,
    action: 'approved' | 'rejected',
    comment?: string
  ): { submission: ReportSubmission; approval: ApprovalRecord } {
    const submission = this.getSubmissionById(submissionId);
    if (!submission) throw new Error('Submission not found');

    const assignment = this.getAssignmentById(submission.assignment_id);
    const now = new Date().toISOString();

    const pendingRecord = this.data.approval_records.find(
      (a) => a.submission_id === submissionId && a.status === 'pending'
    );

    if (!pendingRecord) {
      throw new DomainError('该填报当前没有待处理的审批步骤', 409);
    }

    const expectedSubmissionStatus =
      pendingRecord.approval_level === 'reviewer' ? 'pending_review' : 'pending_approval';
    if (submission.status !== expectedSubmissionStatus) {
      throw new DomainError('审批状态已变化，请刷新后重试', 409);
    }

    if (
      pendingRecord.approver_id !== approverUser.id ||
      submission.submitted_by_company_id !== approverUser.company_id ||
      pendingRecord.approval_level !== approverUser.role
    ) {
      throw new DomainError('你不是该审批步骤的指定处理人', 403);
    }

    pendingRecord.status = action;
    pendingRecord.comment = comment || (action === 'approved' ? '同意' : '驳回');
    pendingRecord.updated_at = now;

    if (action === 'rejected') {
      submission.status = 'rejected';
      if (assignment) assignment.status = 'rejected';
    } else {
      if (pendingRecord.approval_level === 'reviewer') {
        // Reviewer approved -> move to pending_approval (Approver level)
        submission.status = 'pending_approval';

        // Find approver in company
        const companyApprover = this.data.users.find(
          (u) => u.company_id === approverUser.company_id && u.role === 'approver'
        );

        this.data.counters.approval_records += 1;
        this.data.approval_records.push({
          id: this.data.counters.approval_records,
          submission_id: submissionId,
          approval_level: 'approver',
          approver_id: companyApprover ? companyApprover.id : approverUser.id,
          status: 'pending',
          comment: '等候终审',
          created_at: now,
          updated_at: now,
        });
      } else if (pendingRecord.approval_level === 'approver') {
        // Approver approved -> Final approval
        submission.status = 'approved';
        if (assignment) assignment.status = 'approved';
      }
    }

    this.save();
    return { submission, approval: pendingRecord };
  }

  public getPendingApprovalsForUser(user: User) {
    // Find all submissions with pending approval records matching the user's role and company
    const pendingRecords = this.data.approval_records.filter((r) => {
      if (r.status !== 'pending') return false;
      const sub = this.getSubmissionById(r.submission_id);
      if (!sub) return false;
      if (sub.submitted_by_company_id !== user.company_id) return false;

      if (user.role === 'reviewer' && r.approval_level === 'reviewer') return true;
      if (user.role === 'approver' && r.approval_level === 'approver') return true;
      if (user.role === 'branch_admin' || user.role === 'super_admin') return true;

      return false;
    });

    return pendingRecords.map((rec) => {
      const sub = this.getSubmissionById(rec.submission_id)!;
      const assignment = this.getAssignmentById(sub.assignment_id)!;
      const template = this.getTemplateById(assignment.template_id)!;
      const submitter = this.getUserById(sub.submitted_by);
      const company = this.getCompanyById(sub.submitted_by_company_id);

      return {
        approval_id: rec.id,
        submission_id: sub.id,
        approval_level: rec.approval_level,
        assignment_title: assignment.title,
        period_label: assignment.period_label,
        template_name: template ? template.name : '',
        company_name: company ? company.name : '',
        submitted_by_name: submitter ? submitter.display_name : '',
        submitted_at: sub.submitted_at || sub.created_at,
        version: sub.version,
        comment: sub.comment,
      };
    });
  }

  public aggregateAssignment(assignmentId: number): ReportAggregation {
    const assignment = this.getAssignmentById(assignmentId);
    if (!assignment) throw new Error('Assignment not found');

    const template = this.getTemplateById(assignment.template_id);
    if (!template) throw new Error('Template not found');

    const fields = this.getTemplateFields(template.id);
    const submissions = this.data.report_submissions.filter(
      (s) => s.assignment_id === assignmentId && s.status === 'approved'
    );

    const numericSums: Record<string, number> = {};

    submissions.forEach((sub) => {
      const subData = this.getSubmissionData(sub.id);
      subData.forEach((d) => {
        const field = fields.find((f) => f.id === d.field_id);
        if (field && field.field_type === 'number') {
          const num = parseFloat(d.value) || 0;
          numericSums[field.field_name] = (numericSums[field.field_name] || 0) + num;
        }
      });
    });

    assignment.status = 'aggregated';

    let agg = this.data.report_aggregations.find((a) => a.assignment_id === assignmentId);
    const now = new Date().toISOString();

    if (agg) {
      agg.aggregated_data = numericSums;
      agg.submitted_count = submissions.length;
    } else {
      this.data.counters.report_aggregations += 1;
      agg = {
        id: this.data.counters.report_aggregations,
        template_id: template.id,
        assignment_id: assignmentId,
        aggregated_data: numericSums,
        branch_count: 1,
        submitted_count: submissions.length,
        created_at: now,
      };
      this.data.report_aggregations.push(agg);
    }

    this.save();
    return agg;
  }
}

export const db = new Database();
