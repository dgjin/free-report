import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from './mysql';
import { DomainError } from './errors';
import { assertTemplateWritable, setTemplateEnabledStatus } from './template-lifecycle';
import {
  ApprovalRecord,
  Company,
  ReportAggregation,
  ReportAssignment,
  ReportSubmission,
  ReportSubmissionData,
  ReportTemplate,
  ReportTemplateField,
  User,
} from './types';

export { DomainError } from './errors';

type Executor = Pool | PoolConnection;

async function all<T>(executor: Executor, sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await executor.execute<RowDataPacket[]>(sql, params);
  return rows as T[];
}

async function first<T>(executor: Executor, sql: string, params: any[] = []): Promise<T | undefined> {
  return (await all<T>(executor, sql, params))[0];
}

type PoolProvider = () => Pool;
type TemplateMetadataUpdates = Partial<Pick<ReportTemplate, 'name' | 'description' | 'period_type'>>;

export class Database {
  constructor(private readonly poolProvider: PoolProvider = getPool) {}

  private pool(): Pool {
    return this.poolProvider();
  }

  private async transaction<T>(callback: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool().getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async lockWritableTemplate(connection: PoolConnection, templateId: number): Promise<ReportTemplate> {
    const template = await first<ReportTemplate>(
      connection,
      'SELECT * FROM report_templates WHERE id = ? FOR UPDATE',
      [templateId],
    );
    if (!template) throw new DomainError('模板不存在', 404);
    assertTemplateWritable(template.status);
    return template;
  }

  async getCompanies(): Promise<Company[]> {
    return all<Company>(this.pool(), 'SELECT * FROM companies ORDER BY id');
  }

  async getCompanyById(id: number): Promise<Company | undefined> {
    return first<Company>(this.pool(), 'SELECT * FROM companies WHERE id = ?', [id]);
  }

  async getUsers(): Promise<User[]> {
    return all<User>(this.pool(), 'SELECT * FROM users ORDER BY id');
  }

  async getUserById(id: number): Promise<User | undefined> {
    return first<User>(this.pool(), 'SELECT * FROM users WHERE id = ?', [id]);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return first<User>(this.pool(), 'SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
  }

  async getTemplates(): Promise<ReportTemplate[]> {
    return all<ReportTemplate>(this.pool(), 'SELECT * FROM report_templates ORDER BY id DESC');
  }

  async getTemplateById(id: number): Promise<ReportTemplate | undefined> {
    return first<ReportTemplate>(this.pool(), 'SELECT * FROM report_templates WHERE id = ?', [id]);
  }

  async getTemplateFields(templateId: number): Promise<ReportTemplateField[]> {
    return all<ReportTemplateField>(
      this.pool(),
      'SELECT * FROM report_template_fields WHERE template_id = ? ORDER BY sort_order, id',
      [templateId],
    );
  }

  async createTemplate(
    templateData: Omit<ReportTemplate, 'id' | 'created_at' | 'updated_at'>,
    fieldsData: Omit<ReportTemplateField, 'id' | 'template_id'>[],
  ): Promise<{ template: ReportTemplate; fields: ReportTemplateField[] }> {
    return this.transaction(async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO report_templates (name,description,period_type,status,created_by)
         VALUES (?,?,?,?,?)`,
        [templateData.name, templateData.description, templateData.period_type, templateData.status, templateData.created_by],
      );
      const templateId = result.insertId;
      for (const [index, field] of fieldsData.entries()) {
        await connection.execute(
          `INSERT INTO report_template_fields
           (template_id,field_name,field_label,field_type,data_type,field_config,sort_order,status)
           VALUES (?,?,?,?,?,?,?,?)`,
          [templateId, field.field_name, field.field_label, field.field_type, field.data_type,
            JSON.stringify(field.field_config || {}), field.sort_order ?? index + 1, field.status || 'active'],
        );
      }
      return {
        template: (await first<ReportTemplate>(connection, 'SELECT * FROM report_templates WHERE id = ?', [templateId]))!,
        fields: await all<ReportTemplateField>(connection,
          'SELECT * FROM report_template_fields WHERE template_id = ? ORDER BY sort_order,id', [templateId]),
      };
    });
  }

  async updateTemplate(id: number, updates: TemplateMetadataUpdates): Promise<ReportTemplate | null> {
    return this.transaction(async (connection) => {
      await this.lockWritableTemplate(connection, id);
      const allowed = ['name', 'description', 'period_type'] as const;
      const entries = allowed.filter((key) => updates[key] !== undefined).map((key) => [key, updates[key]] as const);
      if (entries.length) {
        await connection.execute(
          `UPDATE report_templates SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...entries.map(([, value]) => value), id],
        );
      }
      return (await first<ReportTemplate>(connection, 'SELECT * FROM report_templates WHERE id = ?', [id])) || null;
    });
  }

  async setTemplateEnabled(id: number, enabled: boolean): Promise<ReportTemplate | null> {
    return this.transaction(async (connection) => {
      const template = await first<ReportTemplate>(
        connection,
        'SELECT * FROM report_templates WHERE id = ? FOR UPDATE',
        [id],
      );
      if (!template) return null;
      const status = setTemplateEnabledStatus(template.status, enabled);
      if (status !== template.status) {
        await connection.execute('UPDATE report_templates SET status = ? WHERE id = ?', [status, id]);
      }
      return (await first<ReportTemplate>(connection, 'SELECT * FROM report_templates WHERE id = ?', [id])) || null;
    });
  }

  async addTemplateField(field: Omit<ReportTemplateField, 'id'>): Promise<ReportTemplateField> {
    return this.transaction(async (connection) => {
      await this.lockWritableTemplate(connection, field.template_id);
      const existing = await first<ReportTemplateField>(
        connection,
        'SELECT * FROM report_template_fields WHERE template_id = ? AND field_name = ?',
        [field.template_id, field.field_name],
      );
      if (existing) throw new DomainError(`字段标识 "${field.field_name}" 在该模板中已存在`, 400);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO report_template_fields
         (template_id,field_name,field_label,field_type,data_type,field_config,sort_order,status)
         VALUES (?,?,?,?,?,?,?,?)`,
        [field.template_id, field.field_name, field.field_label, field.field_type, field.data_type,
          JSON.stringify(field.field_config || {}), field.sort_order, field.status],
      );
      return (await first<ReportTemplateField>(
        connection,
        'SELECT * FROM report_template_fields WHERE id = ?',
        [result.insertId],
      ))!;
    });
  }

  async disableTemplateField(templateId: number, fieldId: number): Promise<ReportTemplateField> {
    return this.transaction(async (connection) => {
      await this.lockWritableTemplate(connection, templateId);
      const field = await first<ReportTemplateField>(
        connection,
        'SELECT * FROM report_template_fields WHERE id = ? AND template_id = ? FOR UPDATE',
        [fieldId, templateId],
      );
      if (!field) throw new DomainError('字段不存在', 404);
      await connection.execute(
        "UPDATE report_template_fields SET status = 'inactive' WHERE id = ? AND template_id = ?",
        [fieldId, templateId],
      );
      return (await first<ReportTemplateField>(
        connection,
        'SELECT * FROM report_template_fields WHERE id = ?',
        [fieldId],
      ))!;
    });
  }

  async getAssignments(): Promise<ReportAssignment[]> {
    return all<ReportAssignment>(this.pool(), 'SELECT * FROM report_assignments ORDER BY id DESC');
  }

  async getAssignmentById(id: number): Promise<ReportAssignment | undefined> {
    return first<ReportAssignment>(this.pool(), 'SELECT * FROM report_assignments WHERE id = ?', [id]);
  }

  async createAssignments(
    templateId: number, companyIds: number[], title: string, periodLabel: string,
    deadline: string, assignedBy: number,
  ): Promise<ReportAssignment[]> {
    return this.transaction(async (connection) => {
      await this.lockWritableTemplate(connection, templateId);
      const created: ReportAssignment[] = [];
      for (const companyId of companyIds) {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT IGNORE INTO report_assignments
           (template_id,assigned_to_company_id,title,period_label,deadline,status,assigned_by)
           VALUES (?,?,?,?,?,'pending',?)`,
          [templateId, companyId, title, periodLabel, deadline, assignedBy],
        );
        if (result.insertId) {
          created.push((await first<ReportAssignment>(connection,
            'SELECT * FROM report_assignments WHERE id = ?', [result.insertId]))!);
        }
      }
      return created;
    });
  }

  async updateAssignmentStatus(id: number, status: ReportAssignment['status']): Promise<void> {
    await this.pool().execute('UPDATE report_assignments SET status = ? WHERE id = ?', [status, id]);
  }

  async getSubmissions(): Promise<ReportSubmission[]> {
    return all<ReportSubmission>(this.pool(), 'SELECT * FROM report_submissions ORDER BY assignment_id, version DESC');
  }

  async getSubmissionById(id: number): Promise<ReportSubmission | undefined> {
    return first<ReportSubmission>(this.pool(), 'SELECT * FROM report_submissions WHERE id = ?', [id]);
  }

  async getLatestSubmissionByAssignment(assignmentId: number): Promise<ReportSubmission | undefined> {
    return first<ReportSubmission>(this.pool(),
      'SELECT * FROM report_submissions WHERE assignment_id = ? ORDER BY version DESC LIMIT 1', [assignmentId]);
  }

  async getLatestApprovedSubmissionByAssignment(assignmentId: number): Promise<ReportSubmission | undefined> {
    return first<ReportSubmission>(this.pool(),
      "SELECT * FROM report_submissions WHERE assignment_id = ? AND status = 'approved' ORDER BY version DESC LIMIT 1",
      [assignmentId]);
  }

  async createOrUpdateSubmission(
    assignmentId: number, userId: number, companyId: number,
    summaryData: Record<number, string>, detailData: Array<Record<number, string>>,
    comment = '', isSubmit = false,
  ): Promise<{ submission: ReportSubmission; approvals: ApprovalRecord[] }> {
    return this.transaction(async (connection) => {
      const assignment = await first<ReportAssignment>(connection,
        'SELECT * FROM report_assignments WHERE id = ? FOR UPDATE', [assignmentId]);
      if (!assignment) throw new DomainError('下发任务不存在', 404);
      const user = await first<User>(connection, 'SELECT * FROM users WHERE id = ?', [userId]);
      const isSuperAdmin = user?.role === 'super_admin';
      if (!user || user.status !== 'active' || user.company_id !== companyId ||
        (!isSuperAdmin && assignment.assigned_to_company_id !== companyId) ||
        (!isSuperAdmin && user.role !== 'handler' && user.role !== 'branch_admin')) {
        throw new DomainError('你无权填写该任务', 403);
      }

      const existing = await first<ReportSubmission>(connection,
        'SELECT * FROM report_submissions WHERE assignment_id = ? ORDER BY version DESC LIMIT 1 FOR UPDATE',
        [assignmentId]);
      let submissionId: number;
      if (existing?.status === 'draft') {
        submissionId = existing.id;
        await connection.execute(
          `UPDATE report_submissions SET submitted_by=?, submitted_by_company_id=?, status=?, comment=?, submitted_at=?
           WHERE id=?`,
          [userId, companyId, isSubmit ? 'pending_review' : 'draft', comment, isSubmit ? new Date() : null, submissionId],
        );
        await connection.execute('DELETE FROM report_submission_data WHERE submission_id = ?', [submissionId]);
      } else {
        const version = existing ? existing.version + 1 : 1;
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO report_submissions
           (assignment_id,version,submitted_by_company_id,submitted_by,status,comment,submitted_at)
           VALUES (?,?,?,?,?,?,?)`,
          [assignmentId, version, companyId, userId, isSubmit ? 'pending_review' : 'draft', comment,
            isSubmit ? new Date() : null],
        );
        submissionId = result.insertId;
      }

      const values: Array<[number, number, number, string]> = [];
      for (const [fieldId, value] of Object.entries(summaryData)) values.push([submissionId, Number(fieldId), 0, value ?? '']);
      detailData.forEach((row, index) => {
        for (const [fieldId, value] of Object.entries(row)) values.push([submissionId, Number(fieldId), index + 1, value ?? '']);
      });
      for (const value of values) {
        await connection.execute(
          'INSERT INTO report_submission_data (submission_id,field_id,row_index,value) VALUES (?,?,?,?)', value,
        );
      }
      await connection.execute('UPDATE report_assignments SET status = ? WHERE id = ?',
        [isSubmit ? 'submitted' : 'filling', assignmentId]);

      const approvals: ApprovalRecord[] = [];
      if (isSubmit) {
        const reviewer = await first<User>(connection,
          "SELECT * FROM users WHERE company_id=? AND role='reviewer' AND status='active' ORDER BY id LIMIT 1", [companyId]);
        if (!reviewer) throw new DomainError('该公司未配置有效复核人', 409);
        await connection.execute(
          `INSERT INTO approval_records (submission_id,approval_level,approver_id,status,comment)
           VALUES (?,'handler',?,'approved',?),(?,'reviewer',?,'pending','等候复核')`,
          [submissionId, userId, comment || '经办人已提交填报', submissionId, reviewer.id],
        );
        approvals.push(...await all<ApprovalRecord>(connection,
          'SELECT * FROM approval_records WHERE submission_id=? ORDER BY id', [submissionId]));
      }
      return {
        submission: (await first<ReportSubmission>(connection, 'SELECT * FROM report_submissions WHERE id=?', [submissionId]))!,
        approvals,
      };
    });
  }

  async getSubmissionData(submissionId: number): Promise<ReportSubmissionData[]> {
    return all<ReportSubmissionData>(this.pool(),
      'SELECT * FROM report_submission_data WHERE submission_id=? ORDER BY row_index,id', [submissionId]);
  }

  async getApprovalRecords(submissionId: number): Promise<ApprovalRecord[]> {
    return all<ApprovalRecord>(this.pool(),
      'SELECT * FROM approval_records WHERE submission_id=? ORDER BY id', [submissionId]);
  }

  async processApprovalAction(
    submissionId: number, approverUser: User, action: 'approved' | 'rejected', comment = '',
  ): Promise<{ submission: ReportSubmission; approval: ApprovalRecord }> {
    return this.transaction(async (connection) => {
      const submission = await first<ReportSubmission>(connection,
        'SELECT * FROM report_submissions WHERE id=? FOR UPDATE', [submissionId]);
      if (!submission) throw new DomainError('填报记录不存在', 404);
      const assignment = await first<ReportAssignment>(connection,
        'SELECT * FROM report_assignments WHERE id=? FOR UPDATE', [submission.assignment_id]);
      const pending = await first<ApprovalRecord>(connection,
        "SELECT * FROM approval_records WHERE submission_id=? AND status='pending' ORDER BY id LIMIT 1 FOR UPDATE", [submissionId]);
      if (!pending) throw new DomainError('该填报当前没有待处理的审批步骤', 409);
      const expectedStatus = pending.approval_level === 'reviewer' ? 'pending_review' : 'pending_approval';
      if (submission.status !== expectedStatus) throw new DomainError('审批状态已变化，请刷新后重试', 409);
      if (pending.approver_id !== approverUser.id || submission.submitted_by_company_id !== approverUser.company_id ||
        pending.approval_level !== approverUser.role) throw new DomainError('你不是该审批步骤的指定处理人', 403);

      await connection.execute('UPDATE approval_records SET status=?, comment=? WHERE id=?',
        [action, comment || (action === 'approved' ? '同意' : '驳回'), pending.id]);
      if (action === 'rejected') {
        await connection.execute("UPDATE report_submissions SET status='rejected' WHERE id=?", [submissionId]);
        await connection.execute("UPDATE report_assignments SET status='rejected' WHERE id=?", [assignment!.id]);
      } else if (pending.approval_level === 'reviewer') {
        const approver = await first<User>(connection,
          "SELECT * FROM users WHERE company_id=? AND role='approver' AND status='active' ORDER BY id LIMIT 1",
          [approverUser.company_id]);
        if (!approver) throw new DomainError('该公司未配置有效审批人', 409);
        await connection.execute("UPDATE report_submissions SET status='pending_approval' WHERE id=?", [submissionId]);
        await connection.execute(
          `INSERT INTO approval_records (submission_id,approval_level,approver_id,status,comment)
           VALUES (?,'approver',?,'pending','等候终审')`, [submissionId, approver.id]);
      } else {
        await connection.execute("UPDATE report_submissions SET status='approved' WHERE id=?", [submissionId]);
        await connection.execute("UPDATE report_assignments SET status='approved' WHERE id=?", [assignment!.id]);
      }
      return {
        submission: (await first<ReportSubmission>(connection, 'SELECT * FROM report_submissions WHERE id=?', [submissionId]))!,
        approval: (await first<ApprovalRecord>(connection, 'SELECT * FROM approval_records WHERE id=?', [pending.id]))!,
      };
    });
  }

  async getPendingApprovalsForUser(user: User) {
    return all<any>(this.pool(),
      `SELECT ar.id approval_id, s.id submission_id, ar.approval_level, a.title assignment_title,
              a.period_label, t.name template_name, c.name company_name, u.display_name submitted_by_name,
              COALESCE(s.submitted_at,s.created_at) submitted_at, s.version, s.comment
       FROM approval_records ar
       JOIN report_submissions s ON s.id=ar.submission_id
       JOIN report_assignments a ON a.id=s.assignment_id
       JOIN report_templates t ON t.id=a.template_id
       JOIN companies c ON c.id=s.submitted_by_company_id
       JOIN users u ON u.id=s.submitted_by
       WHERE ar.status='pending' AND s.submitted_by_company_id=? AND
         ((?='reviewer' AND ar.approval_level='reviewer') OR
          (?='approver' AND ar.approval_level='approver') OR ? IN ('branch_admin','super_admin'))
       ORDER BY s.submitted_at DESC`,
      [user.company_id, user.role, user.role, user.role]);
  }

  async aggregateAssignment(assignmentId: number): Promise<ReportAggregation> {
    return this.transaction(async (connection) => {
      const assignment = await first<ReportAssignment>(connection,
        'SELECT * FROM report_assignments WHERE id=? FOR UPDATE', [assignmentId]);
      if (!assignment) throw new DomainError('下发任务不存在', 404);
      const template = await first<ReportTemplate>(connection,
        'SELECT * FROM report_templates WHERE id=?', [assignment.template_id]);
      if (!template) throw new DomainError('模板不存在', 404);
      const sums = await all<{ field_name: string; total: string }>(connection,
        `SELECT f.field_name, SUM(CAST(d.value AS DECIMAL(30,6))) total
         FROM report_submissions s
         JOIN report_submission_data d ON d.submission_id=s.id
         JOIN report_template_fields f ON f.id=d.field_id
         WHERE s.assignment_id=? AND s.status='approved' AND f.field_type='number'
         GROUP BY f.field_name`, [assignmentId]);
      const data = Object.fromEntries(sums.map((item) => [item.field_name, Number(item.total)]));
      const count = await first<{ count: number }>(connection,
        "SELECT COUNT(*) count FROM report_submissions WHERE assignment_id=? AND status='approved'", [assignmentId]);
      await connection.execute(
        `INSERT INTO report_aggregations
         (template_id,assignment_id,aggregated_data,branch_count,submitted_count)
         VALUES (?,?,?,1,?) ON DUPLICATE KEY UPDATE aggregated_data=VALUES(aggregated_data),
         submitted_count=VALUES(submitted_count), updated_at=CURRENT_TIMESTAMP(3)`,
        [template.id, assignmentId, JSON.stringify(data), count?.count || 0]);
      await connection.execute("UPDATE report_assignments SET status='aggregated' WHERE id=?", [assignmentId]);
      return (await first<ReportAggregation>(connection,
        'SELECT * FROM report_aggregations WHERE assignment_id=?', [assignmentId]))!;
    });
  }
}

export const db = new Database();
