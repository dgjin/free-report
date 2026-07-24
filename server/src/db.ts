import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from './mysql';
import { DomainError } from './errors';
import type { PendingReceipt, FieldType, MatrixConfig } from './types';
import { assertTemplateWritable, setTemplateEnabledStatus } from './template-lifecycle';
import { canWriteSubmissionStatus } from './submission-workflow';
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

  private async lockWritableTemplate(connection: PoolConnection, templateId: number, ownerDepartmentId?: number): Promise<ReportTemplate> {
    const template = await first<ReportTemplate>(
      connection,
      'SELECT * FROM report_templates WHERE id = ? FOR UPDATE',
      [templateId],
    );
    if (!template) throw new DomainError('模板不存在', 404);
    if (ownerDepartmentId !== undefined && template.owner_department_id !== undefined && template.owner_department_id !== ownerDepartmentId) {
      throw new DomainError('无权管理该模板', 404);
    }
    if (template.owner_department_id !== undefined) {
      const owner = await first<Company>(connection, 'SELECT * FROM companies WHERE id=? FOR UPDATE', [template.owner_department_id]);
      if (!owner || owner.level !== 'department' || owner.status !== 'active') throw new DomainError('模板所属部门已停用', 409);
    }
    assertTemplateWritable(template.status);
    return template;
  }

  async getCompanies(): Promise<Company[]> {
    return all<Company>(this.pool(), 'SELECT * FROM companies ORDER BY id');
  }

  async getCompanyById(id: number): Promise<Company | undefined> {
    return first<Company>(this.pool(), 'SELECT * FROM companies WHERE id = ?', [id]);
  }

  async createCompany(data: Pick<Company, 'name' | 'code' | 'parent_id' | 'level'>): Promise<Company> {
    const parent = data.parent_id ? await this.getCompanyById(data.parent_id) : undefined;
    if (!parent || parent.level !== 'headquarter' || parent.status !== 'active') throw new DomainError('父机构必须是启用中的总部', 400);
    const [result] = await this.pool().execute<ResultSetHeader>(
      "INSERT INTO companies(name,code,parent_id,level,status) VALUES(?,?,?,?,'active')",
      [data.name, data.code, data.parent_id, data.level],
    );
    return (await this.getCompanyById(result.insertId))!;
  }

  async disableCompany(id: number): Promise<Company | null> {
    const active = await first<{ count: number }>(this.pool(),
      "SELECT COUNT(*) count FROM report_assignments WHERE assigned_to_company_id=? AND status NOT IN ('received','approved','aggregated','rejected')", [id]);
    if (Number(active?.count || 0) > 0) throw new DomainError('该机构仍有未完成任务，暂不能停用', 409);
    await this.pool().execute("UPDATE companies SET status='inactive' WHERE id=? AND level <> 'headquarter'", [id]);
    return (await this.getCompanyById(id)) || null;
  }

  async getAssignmentTargets(excludeId?: number): Promise<Company[]> {
    return all<Company>(this.pool(),
      "SELECT * FROM companies WHERE status='active' AND level IN ('department','branch') AND (? IS NULL OR id<>?) ORDER BY level,name",
      [excludeId ?? null, excludeId ?? null]);
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

  async updateUserOrganizationRole(id: number, companyId: number, role: User['role']): Promise<User | null> {
    const existing = await this.getUserById(id);
    if (!existing) return null;
    if (existing.role === 'super_admin') throw new DomainError('不能修改超级管理员的机构或角色', 403);
    const company = await this.getCompanyById(companyId);
    if (!company || company.status !== 'active') throw new DomainError('目标机构不存在或已停用', 400);
    if (role === 'department_report_admin' && company.level !== 'department') throw new DomainError('报表管理员必须属于总部部门', 400);
    await this.pool().execute('UPDATE users SET company_id=?, role=? WHERE id=?', [companyId, role, id]);
    return (await this.getUserById(id)) || null;
  }

  async getTemplates(): Promise<ReportTemplate[]> {
    return all<ReportTemplate>(this.pool(), 'SELECT * FROM report_templates ORDER BY id DESC');
  }

  async getTemplatesForUser(user: { id: number; company_id: number; role: string; company_level?: string }): Promise<ReportTemplate[]> {
    if (user.role === 'super_admin') return this.getTemplates();
    if (user.role === 'department_report_admin' && user.company_level === 'department') {
      return all<ReportTemplate>(this.pool(),
        'SELECT * FROM report_templates WHERE owner_department_id=? ORDER BY id DESC', [user.company_id]);
    }
    return [];
  }

  async getTemplatesByDepartment(departmentId: number): Promise<ReportTemplate[]> {
    return all<ReportTemplate>(this.pool(), 'SELECT * FROM report_templates WHERE owner_department_id = ? ORDER BY id DESC', [departmentId]);
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
        `INSERT INTO report_templates (name,description,period_type,status,created_by,owner_department_id)
         VALUES (?,?,?,?,?,?)`,
        [templateData.name, templateData.description, templateData.period_type, templateData.status, templateData.created_by, templateData.owner_department_id],
      );
      const templateId = result.insertId;
      if (fieldsData.length > 0) {
        const placeholders = fieldsData.map(() => '(?,?,?,?,?,?,?,?)').join(',');
        const params = fieldsData.flatMap((field, index) => [
          templateId, field.field_name, field.field_label, field.field_type, field.data_type,
          JSON.stringify(field.field_config || {}), field.sort_order ?? index + 1, field.status || 'active',
        ]);
        await connection.execute(
          `INSERT INTO report_template_fields
           (template_id,field_name,field_label,field_type,data_type,field_config,sort_order,status)
           VALUES ${placeholders}`,
          params,
        );
      }
      return {
        template: (await first<ReportTemplate>(connection, 'SELECT * FROM report_templates WHERE id = ?', [templateId]))!,
        fields: await all<ReportTemplateField>(connection,
          'SELECT * FROM report_template_fields WHERE template_id = ? ORDER BY sort_order,id', [templateId]),
      };
    });
  }

  async updateTemplate(id: number, updates: TemplateMetadataUpdates, ownerDepartmentId?: number): Promise<ReportTemplate | null> {
    return this.transaction(async (connection) => {
      await this.lockWritableTemplate(connection, id, ownerDepartmentId);
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

  async setTemplateEnabled(id: number, enabled: boolean, ownerDepartmentId?: number): Promise<ReportTemplate | null> {
    return this.transaction(async (connection) => {
      const template = await first<ReportTemplate>(
        connection,
        'SELECT * FROM report_templates WHERE id = ? FOR UPDATE',
        [id],
      );
      if (!template) return null;
      if (ownerDepartmentId !== undefined && template.owner_department_id !== undefined && template.owner_department_id !== ownerDepartmentId) throw new DomainError('无权管理该模板', 404);
      const status = setTemplateEnabledStatus(template.status, enabled);
      if (status !== template.status) {
        await connection.execute('UPDATE report_templates SET status = ? WHERE id = ?', [status, id]);
      }
      return (await first<ReportTemplate>(connection, 'SELECT * FROM report_templates WHERE id = ?', [id])) || null;
    });
  }

  async addTemplateField(field: Omit<ReportTemplateField, 'id'>, ownerDepartmentId?: number): Promise<ReportTemplateField> {
    return this.transaction(async (connection) => {
      await this.lockWritableTemplate(connection, field.template_id, ownerDepartmentId);
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

  async addMatrixFields(
    templateId: number,
    columns: Array<{ field_name: string; field_label: string; field_type: FieldType }>,
    matrixConfig: MatrixConfig,
    ownerDepartmentId?: number,
  ): Promise<ReportTemplateField[]> {
    return this.transaction(async (connection) => {
      await this.lockWritableTemplate(connection, templateId, ownerDepartmentId);

      // Check for name collisions
      const existingNames = await all<{ field_name: string }>(
        connection,
        'SELECT field_name FROM report_template_fields WHERE template_id = ?',
        [templateId],
      );
      const nameSet = new Set(existingNames.map((r) => r.field_name));
      for (const col of columns) {
        if (nameSet.has(col.field_name)) {
          throw new DomainError(`字段标识 "${col.field_name}" 在该模板中已存在`, 400);
        }
        nameSet.add(col.field_name);
      }

      // Get current max sort_order
      const maxOrder = await first<{ max_sort: number | null }>(
        connection,
        'SELECT MAX(sort_order) AS max_sort FROM report_template_fields WHERE template_id = ?',
        [templateId],
      );
      let sortOrder = (maxOrder?.max_sort || 0) + 1;

      const createdFields: ReportTemplateField[] = [];
      for (const col of columns) {
        const fieldConfig = {
          required: true,
          matrix: { ...matrixConfig, column_label: col.field_label },
        };
        await connection.execute<ResultSetHeader>(
          `INSERT INTO report_template_fields
           (template_id,field_name,field_label,field_type,data_type,field_config,sort_order,status)
           VALUES (?,?,?,?,?,?,?,?)`,
          [templateId, col.field_name, col.field_label, col.field_type, 'matrix',
            JSON.stringify(fieldConfig), sortOrder, 'active'],
        );
        const field = await first<ReportTemplateField>(
          connection,
          'SELECT * FROM report_template_fields WHERE template_id = ? AND field_name = ?',
          [templateId, col.field_name],
        );
        if (field) createdFields.push(field);
        sortOrder++;
      }

      return createdFields;
    });
  }

  async disableTemplateField(templateId: number, fieldId: number, ownerDepartmentId?: number): Promise<ReportTemplateField> {
    return this.transaction(async (connection) => {
      await this.lockWritableTemplate(connection, templateId, ownerDepartmentId);
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

  async getAssignmentsForUser(user: { id: number; company_id: number; role: string; company_level?: string }): Promise<ReportAssignment[]> {
    if (user.role === 'super_admin') return this.getAssignments();
    const isDeptAdmin = user.role === 'department_report_admin' && user.company_level === 'department';
    if (isDeptAdmin) {
      return all<ReportAssignment>(this.pool(),
        'SELECT * FROM report_assignments WHERE issuer_department_id=? ORDER BY id DESC', [user.company_id]);
    }
    return all<ReportAssignment>(this.pool(),
      'SELECT * FROM report_assignments WHERE assigned_to_company_id=? ORDER BY id DESC', [user.company_id]);
  }

  async getAssignmentById(id: number): Promise<ReportAssignment | undefined> {
    return first<ReportAssignment>(this.pool(), 'SELECT * FROM report_assignments WHERE id = ?', [id]);
  }

  async createAssignments(
    templateId: number, companyIds: number[], title: string, periodLabel: string,
    deadline: string, assignedBy: number, ownerDepartmentId?: number, isOneTime = false,
  ): Promise<ReportAssignment[]> {
    return this.transaction(async (connection) => {
      const template = await this.lockWritableTemplate(connection, templateId, ownerDepartmentId);
      const created: ReportAssignment[] = [];
      for (const companyId of companyIds) {
        if (template.owner_department_id !== undefined) {
          const target = await first<Company>(connection, 'SELECT * FROM companies WHERE id=? FOR UPDATE', [companyId]);
          if (!target || target.status !== 'active' || !['department','branch'].includes(target.level)) {
            throw new DomainError('下发目标不存在或已停用', 400);
          }
          if (target.id === template.owner_department_id) throw new DomainError('不能向本部门下发报表', 400);
        }

        if (isOneTime) {
          // 一次性下发：绕过唯一周期约束，使用 INSERT（非 IGNORE），period_label 追加唯一后缀
          const uniqueLabel = `${periodLabel} #${Date.now()}`;
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO report_assignments
             (template_id,assigned_to_company_id,title,period_label,is_one_time,deadline,status,assigned_by,issuer_department_id)
             VALUES (?,?,?,?,1,?,'pending',?,?)`,
            [templateId, companyId, title, uniqueLabel, deadline, assignedBy, template.owner_department_id],
          );
          if (result.insertId) {
            created.push((await first<ReportAssignment>(connection,
              'SELECT * FROM report_assignments WHERE id = ?', [result.insertId]))!);
          }
        } else {
          // 常规下发：依赖唯一周期约束去重
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT IGNORE INTO report_assignments
             (template_id,assigned_to_company_id,title,period_label,is_one_time,deadline,status,assigned_by,issuer_department_id)
             VALUES (?,?,?,?,0,?,'pending',?,?)`,
            [templateId, companyId, title, periodLabel, deadline, assignedBy, template.owner_department_id],
          );
          if (result.insertId) {
            created.push((await first<ReportAssignment>(connection,
              'SELECT * FROM report_assignments WHERE id = ?', [result.insertId]))!);
          }
        }
      }
      return created;
    });
  }

  async recallAssignment(assignmentId: number, userId: number, departmentId: number, reason: string): Promise<any> {
    return this.transaction(async (connection) => {
      const assignment = await first<ReportAssignment>(connection,
        'SELECT * FROM report_assignments WHERE id=? FOR UPDATE', [assignmentId]);
      if (!assignment) throw new DomainError('下发任务不存在', 404);
      if (assignment.issuer_department_id !== departmentId) {
        throw new DomainError('无权收回该下发任务', 403);
      }
      if (assignment.status === 'recalled') throw new DomainError('该任务已被收回', 409);
      if (assignment.status === 'aggregated') throw new DomainError('已汇总的任务不可收回', 409);
      if (!reason.trim()) throw new DomainError('收回原因不能为空', 400);

      // 写入审计表
      await connection.execute(
        `INSERT INTO assignment_recalls (assignment_id, recalled_by, issuer_department_id, reason)
         VALUES (?,?,?,?)`,
        [assignmentId, userId, departmentId, reason],
      );

      // 更新任务状态为 recalled
      await connection.execute('UPDATE report_assignments SET status=? WHERE id=?', ['recalled', assignmentId]);

      // 同步取消相关待审批记录（标记为 rejected，附系统说明）
      await connection.execute(
        `UPDATE approval_records SET status='rejected', comment='任务被发起部门强制收回' WHERE submission_id IN (SELECT id FROM report_submissions WHERE assignment_id=?) AND status='pending'`,
        [assignmentId],
      );

      return { assignment: await first(connection, 'SELECT * FROM report_assignments WHERE id=?', [assignmentId]) };
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
      "SELECT * FROM report_submissions WHERE assignment_id = ? AND status IN ('pending_receipt','received') ORDER BY version DESC LIMIT 1",
      [assignmentId]);
  }

  // --- Batch fetch methods (avoid N+1 queries in list endpoints) ---

  private buildInClause(ids: number[]): string {
    return ids.map(() => '?').join(',');
  }

  async getCompaniesByIds(ids: number[]): Promise<Company[]> {
    if (ids.length === 0) return [];
    return all<Company>(this.pool(),
      `SELECT * FROM companies WHERE id IN (${this.buildInClause(ids)})`, ids);
  }

  async getUsersByIds(ids: number[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return all<User>(this.pool(),
      `SELECT * FROM users WHERE id IN (${this.buildInClause(ids)})`, ids);
  }

  async getTemplatesByIds(ids: number[]): Promise<ReportTemplate[]> {
    if (ids.length === 0) return [];
    return all<ReportTemplate>(this.pool(),
      `SELECT * FROM report_templates WHERE id IN (${this.buildInClause(ids)})`, ids);
  }

  async getTemplateFieldsByTemplateIds(templateIds: number[]): Promise<ReportTemplateField[]> {
    if (templateIds.length === 0) return [];
    return all<ReportTemplateField>(this.pool(),
      `SELECT * FROM report_template_fields WHERE template_id IN (${this.buildInClause(templateIds)}) ORDER BY template_id, sort_order, id`,
      templateIds);
  }

  async getAssignmentsByTemplateAndPeriod(templateId: number, periodLabel: string): Promise<ReportAssignment[]> {
    return all<ReportAssignment>(this.pool(),
      'SELECT * FROM report_assignments WHERE template_id = ? AND period_label = ? ORDER BY id', [templateId, periodLabel]);
  }

  async getAssignmentsByTemplateId(templateId: number): Promise<ReportAssignment[]> {
    return all<ReportAssignment>(this.pool(),
      'SELECT * FROM report_assignments WHERE template_id = ? ORDER BY id DESC', [templateId]);
  }

  async getSubmissionsByAssignmentIds(assignmentIds: number[]): Promise<ReportSubmission[]> {
    if (assignmentIds.length === 0) return [];
    return all<ReportSubmission>(this.pool(),
      `SELECT * FROM report_submissions WHERE assignment_id IN (${this.buildInClause(assignmentIds)}) ORDER BY assignment_id, version DESC`,
      assignmentIds);
  }

  async getLatestSubmissionsByAssignmentIds(assignmentIds: number[]): Promise<ReportSubmission[]> {
    if (assignmentIds.length === 0) return [];
    const placeholders = this.buildInClause(assignmentIds);
    return all<ReportSubmission>(this.pool(),
      `SELECT s.* FROM report_submissions s
       INNER JOIN (
         SELECT assignment_id, MAX(version) AS max_version
         FROM report_submissions
         WHERE assignment_id IN (${placeholders})
         GROUP BY assignment_id
       ) latest ON s.assignment_id = latest.assignment_id AND s.version = latest.max_version`,
      assignmentIds);
  }

  async getLatestApprovedSubmissionsByAssignmentIds(assignmentIds: number[]): Promise<ReportSubmission[]> {
    if (assignmentIds.length === 0) return [];
    const placeholders = this.buildInClause(assignmentIds);
    return all<ReportSubmission>(this.pool(),
      `SELECT s.* FROM report_submissions s
       INNER JOIN (
         SELECT assignment_id, MAX(version) AS max_version
         FROM report_submissions
         WHERE assignment_id IN (${placeholders}) AND status NOT IN ('draft','rejected','returned')
         GROUP BY assignment_id
       ) latest ON s.assignment_id = latest.assignment_id AND s.version = latest.max_version`,
      assignmentIds);
  }

  async getSubmissionDataBySubmissionIds(submissionIds: number[]): Promise<ReportSubmissionData[]> {
    if (submissionIds.length === 0) return [];
    return all<ReportSubmissionData>(this.pool(),
      `SELECT * FROM report_submission_data WHERE submission_id IN (${this.buildInClause(submissionIds)}) ORDER BY submission_id, row_index, id`,
      submissionIds);
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
      if (!user || user.status !== 'active' || user.company_id !== companyId ||
        assignment.assigned_to_company_id !== companyId ||
        !['handler', 'branch_admin', 'department_report_admin'].includes(user.role)) {
        throw new DomainError('你无权填写该任务', 403);
      }

      const existing = await first<ReportSubmission>(connection,
        'SELECT * FROM report_submissions WHERE assignment_id = ? ORDER BY version DESC LIMIT 1 FOR UPDATE',
        [assignmentId]);
      if (!canWriteSubmissionStatus(existing?.status)) {
        throw new DomainError('该报表已提交，不能重复保存或提交，请刷新页面查看最新状态', 409);
      }

      // Three-level approval: find reviewer for internal review before department receipt
      let reviewer: User | null = null;
      let initialStatus = 'draft';
      let assignmentStatus = 'filling';
      if (isSubmit) {
        reviewer = await first<User>(connection,
          "SELECT * FROM users WHERE company_id=? AND role='reviewer' AND status='active' ORDER BY id LIMIT 1",
          [companyId]);
        if (reviewer) {
          initialStatus = 'pending_review';
          assignmentStatus = 'submitted';
        } else {
          initialStatus = 'pending_receipt';
          assignmentStatus = 'pending_receipt';
        }
      }

      let submissionId: number;
      if (existing?.status === 'draft') {
        submissionId = existing.id;
        await connection.execute(
          `UPDATE report_submissions SET submitted_by=?, submitted_by_company_id=?, status=?, comment=?, submitted_at=?
           WHERE id=?`,
          [userId, companyId, initialStatus, comment, isSubmit ? new Date() : null, submissionId],
        );
        await connection.execute('DELETE FROM report_submission_data WHERE submission_id = ?', [submissionId]);
      } else {
        // Defensive cleanup: close stale pending approval records from previous version
        if (existing && ['rejected', 'returned'].includes(existing.status)) {
          await connection.execute(
            "UPDATE approval_records SET status='rejected', comment='版本过期（重新提交）' WHERE submission_id=? AND status='pending'",
            [existing.id],
          );
        }
        const version = existing ? existing.version + 1 : 1;
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO report_submissions
           (assignment_id,version,submitted_by_company_id,submitted_by,status,comment,submitted_at)
           VALUES (?,?,?,?,?,?,?)`,
          [assignmentId, version, companyId, userId, initialStatus, comment,
            isSubmit ? new Date() : null],
        );
        submissionId = result.insertId;
      }

      const values: Array<[number, number, number, string]> = [];
      for (const [fieldId, value] of Object.entries(summaryData)) values.push([submissionId, Number(fieldId), 0, value ?? '']);
      detailData.forEach((row, index) => {
        for (const [fieldId, value] of Object.entries(row)) values.push([submissionId, Number(fieldId), index + 1, value ?? '']);
      });
      if (values.length > 0) {
        const placeholders = values.map(() => '(?,?,?,?)').join(',');
        const params = values.flat();
        await connection.execute(
          `INSERT INTO report_submission_data (submission_id,field_id,row_index,value) VALUES ${placeholders}`,
          params,
        );
      }
      await connection.execute('UPDATE report_assignments SET status = ? WHERE id = ?',
        [assignmentStatus, assignmentId]);

      const approvals: ApprovalRecord[] = [];
      if (isSubmit && reviewer) {
        await connection.execute(
          `INSERT INTO approval_records (submission_id,approval_level,approver_id,status,comment)
           VALUES (?,'reviewer',?,'pending','待复核')`,
          [submissionId, reviewer.id]);
        const approval = await first<ApprovalRecord>(connection,
          'SELECT * FROM approval_records WHERE submission_id=? AND approval_level=? ORDER BY id DESC LIMIT 1',
          [submissionId, 'reviewer']);
        if (approval) approvals.push(approval);
      }
      return {
        submission: (await first<ReportSubmission>(connection, 'SELECT * FROM report_submissions WHERE id=?', [submissionId]))!,
        approvals,
      };
    });
  }

  async getPendingReceipts(departmentId: number): Promise<PendingReceipt[]> {
    return all<PendingReceipt>(this.pool(), `SELECT s.id,s.assignment_id,s.version,a.period_label,u.display_name submitted_by_name,s.comment,
      a.title assignment_title,t.name template_name,c.name company_name,s.submitted_at
      FROM report_submissions s JOIN report_assignments a ON a.id=s.assignment_id
      JOIN report_templates t ON t.id=a.template_id JOIN companies c ON c.id=s.submitted_by_company_id
      JOIN users u ON u.id=s.submitted_by
      WHERE a.issuer_department_id=? AND s.status='pending_receipt' ORDER BY s.submitted_at`, [departmentId]);
  }

  async processReceipt(submissionId: number, userId: number, departmentId: number,
    action: 'received' | 'returned', comment = ''): Promise<any> {
    return this.transaction(async (connection) => {
      const submission = await first<ReportSubmission>(connection, 'SELECT * FROM report_submissions WHERE id=? FOR UPDATE', [submissionId]);
      if (!submission) throw new DomainError('填报记录不存在', 404);
      const assignment = await first<ReportAssignment>(connection, 'SELECT * FROM report_assignments WHERE id=? FOR UPDATE', [submission.assignment_id]);
      if (!assignment || assignment.issuer_department_id !== departmentId) throw new DomainError('无权签收该填报', 404);
      const user = await first<User>(connection, 'SELECT * FROM users WHERE id=? FOR UPDATE', [userId]);
      if (!user || user.role !== 'department_report_admin' || user.company_id !== departmentId) throw new DomainError('仅发起部门报表管理员可以签收', 403);
      if (submission.status !== 'pending_receipt') throw new DomainError('填报状态已变化，请刷新后重试', 409);
      if (action === 'returned' && !comment.trim()) throw new DomainError('退回时必须填写原因', 400);
      await connection.execute(`INSERT INTO submission_receipts(submission_id,issuer_department_id,received_by,action,comment)
        VALUES(?,?,?,?,?)`, [submissionId, departmentId, userId, action, comment]);
      await connection.execute('UPDATE report_submissions SET status=? WHERE id=?', [action, submissionId]);
      await connection.execute('UPDATE report_assignments SET status=? WHERE id=?', [action, assignment.id]);
      return { submission: await first(connection, 'SELECT * FROM report_submissions WHERE id=?', [submissionId]),
        receipt: await first(connection, 'SELECT * FROM submission_receipts WHERE submission_id=?', [submissionId]) };
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
        // Approver approved — send to department for receipt
        await connection.execute("UPDATE report_submissions SET status='pending_receipt' WHERE id=?", [submissionId]);
        await connection.execute("UPDATE report_assignments SET status='pending_receipt' WHERE id=?", [assignment!.id]);
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
          (?='approver' AND ar.approval_level='approver'))
       ORDER BY s.submitted_at DESC`,
      [user.company_id, user.role, user.role]);
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
         WHERE s.assignment_id=? AND s.status IN ('pending_receipt','received') AND f.field_type='number'
         GROUP BY f.field_name`, [assignmentId]);
      const data = Object.fromEntries(sums.map((item) => [item.field_name, Number(item.total)]));
      const count = await first<{ count: number }>(connection,
        "SELECT COUNT(*) count FROM report_submissions WHERE assignment_id=? AND status IN ('pending_receipt','received')", [assignmentId]);
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
