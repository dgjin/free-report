import type { ReportAssignment, ReportTemplate, ReportTemplateField, TemplateStatus } from '../../server/src/types';

type TemplateSeed = Pick<ReportTemplate, 'id' | 'status'> & Partial<ReportTemplate>;
type FieldSeed = Pick<ReportTemplateField, 'id' | 'template_id'> & Partial<ReportTemplateField>;

type LockPause = {
  entered: Promise<void>;
  release(): void;
  signalEntered(): void;
  released: Promise<void>;
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

export class TransactionalTemplatePool {
  readonly templates = new Map<number, ReportTemplate>();
  readonly fields = new Map<number, ReportTemplateField>();
  readonly assignments = new Map<number, ReportAssignment>();
  readonly queryLog: Array<{ connectionId: number; sql: string; params: any[] }> = [];

  private nextConnectionId = 1;
  private nextFieldId = 100;
  private nextAssignmentId = 200;
  private locks = new Map<number, { owner: number; waiters: Array<() => void> }>();
  private pauses: LockPause[] = [];

  seedTemplate(seed: TemplateSeed): ReportTemplate {
    const template: ReportTemplate = {
      id: seed.id,
      name: seed.name || `模板 ${seed.id}`,
      description: seed.description || '',
      period_type: seed.period_type || 'monthly',
      status: seed.status,
      created_by: seed.created_by || 1,
      created_at: seed.created_at || '2026-07-22 00:00:00.000',
      updated_at: seed.updated_at || '2026-07-22 00:00:00.000',
    };
    this.templates.set(template.id, template);
    return template;
  }

  seedField(seed: FieldSeed): ReportTemplateField {
    const field: ReportTemplateField = {
      id: seed.id,
      template_id: seed.template_id,
      field_name: seed.field_name || `field_${seed.id}`,
      field_label: seed.field_label || `字段 ${seed.id}`,
      field_type: seed.field_type || 'text',
      data_type: seed.data_type || 'detail',
      field_config: seed.field_config || {},
      sort_order: seed.sort_order || 1,
      status: seed.status || 'active',
    };
    this.fields.set(field.id, field);
    return field;
  }

  pauseNextTemplateLock(): { entered: Promise<void>; release(): void } {
    const entered = deferred();
    const released = deferred();
    this.pauses.push({
      entered: entered.promise,
      signalEntered: entered.resolve,
      released: released.promise,
      release: released.resolve,
    });
    return { entered: entered.promise, release: released.resolve };
  }

  async getConnection() {
    return new TransactionalTemplateConnection(this, this.nextConnectionId++);
  }

  async execute(sql: string, params: any[] = []) {
    return this.executeQuery(0, undefined, sql, params);
  }

  async acquireTemplateLock(templateId: number, connectionId: number): Promise<void> {
    while (true) {
      const current = this.locks.get(templateId);
      if (!current) {
        this.locks.set(templateId, { owner: connectionId, waiters: [] });
        const pause = this.pauses.shift();
        if (pause) {
          pause.signalEntered();
          await pause.released;
        }
        return;
      }
      if (current.owner === connectionId) return;
      await new Promise<void>((resolve) => current.waiters.push(resolve));
    }
  }

  releaseTemplateLock(templateId: number, connectionId: number): void {
    const current = this.locks.get(templateId);
    if (!current || current.owner !== connectionId) return;
    this.locks.delete(templateId);
    current.waiters.shift()?.();
  }

  holdsTemplateLock(templateId: number, connectionId: number): boolean {
    return this.locks.get(templateId)?.owner === connectionId;
  }

  async executeQuery(
    connectionId: number,
    connection: TransactionalTemplateConnection | undefined,
    rawSql: string,
    params: any[] = [],
  ): Promise<any> {
    const sql = normalizeSql(rawSql);
    this.queryLog.push({ connectionId, sql, params: [...params] });

    if (/^SELECT \* FROM report_templates WHERE id = \? FOR UPDATE$/i.test(sql)) {
      const templateId = Number(params[0]);
      this.assertTransactionActive(connection);
      await connection.lockTemplate(templateId);
      return [[this.templates.get(templateId)].filter(Boolean), []];
    }

    if (/^SELECT \* FROM report_templates WHERE id = \?$/i.test(sql)) {
      return [[this.templates.get(Number(params[0]))].filter(Boolean), []];
    }

    if (/^UPDATE report_templates SET status = \? WHERE id = \?$/i.test(sql)) {
      const [status, templateIdValue] = params as [TemplateStatus, number];
      const templateId = Number(templateIdValue);
      this.assertTransactionActive(connection);
      this.assertLocked(connectionId, templateId);
      const template = this.templates.get(templateId);
      if (!template) return [{ affectedRows: 0 }, []];
      connection?.recordUndo(() => this.templates.set(templateId, template));
      this.templates.set(templateId, { ...template, status });
      return [{ affectedRows: 1 }, []];
    }

    if (/^UPDATE report_templates SET .+ WHERE id = \?$/i.test(sql)) {
      const templateId = Number(params.at(-1));
      this.assertTransactionActive(connection);
      this.assertLocked(connectionId, templateId);
      const template = this.templates.get(templateId);
      if (!template) return [{ affectedRows: 0 }, []];
      const assignments = sql.slice('UPDATE report_templates SET '.length, sql.lastIndexOf(' WHERE')).split(', ');
      const next = { ...template } as Record<string, any>;
      assignments.forEach((assignment, index) => {
        const key = assignment.split(' = ')[0];
        next[key] = params[index];
      });
      connection?.recordUndo(() => this.templates.set(templateId, template));
      this.templates.set(templateId, next as ReportTemplate);
      return [{ affectedRows: 1 }, []];
    }

    if (/^SELECT \* FROM report_template_fields WHERE template_id = \? AND field_name = \?/i.test(sql)) {
      const [templateId, fieldName] = params;
      const field = [...this.fields.values()].find(
        (candidate) => candidate.template_id === Number(templateId) && candidate.field_name === fieldName,
      );
      return [[field].filter(Boolean), []];
    }

    if (/^INSERT INTO report_template_fields /i.test(sql)) {
      const templateId = Number(params[0]);
      this.assertTransactionActive(connection);
      this.assertLocked(connectionId, templateId);
      const duplicate = [...this.fields.values()].some(
        (candidate) => candidate.template_id === templateId && candidate.field_name === params[1],
      );
      if (duplicate) throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
      const id = this.nextFieldId++;
      const field: ReportTemplateField = {
        id,
        template_id: templateId,
        field_name: params[1],
        field_label: params[2],
        field_type: params[3],
        data_type: params[4],
        field_config: params[5],
        sort_order: params[6],
        status: params[7],
      };
      this.fields.set(id, field);
      connection?.recordUndo(() => this.fields.delete(id));
      return [{ insertId: id, affectedRows: 1 }, []];
    }

    if (/^SELECT \* FROM report_template_fields WHERE id = \? AND template_id = \? FOR UPDATE$/i.test(sql)) {
      this.assertTransactionActive(connection);
      const [fieldId, templateId] = params.map(Number);
      const field = this.fields.get(fieldId);
      return [[field?.template_id === templateId ? field : undefined].filter(Boolean), []];
    }

    if (/^UPDATE report_template_fields SET status = 'inactive' WHERE id = \? AND template_id = \?$/i.test(sql)) {
      const [fieldId, templateId] = params.map(Number);
      this.assertTransactionActive(connection);
      this.assertLocked(connectionId, templateId);
      const field = this.fields.get(fieldId);
      if (!field || field.template_id !== templateId) return [{ affectedRows: 0 }, []];
      connection?.recordUndo(() => this.fields.set(fieldId, field));
      this.fields.set(fieldId, { ...field, status: 'inactive' });
      return [{ affectedRows: 1 }, []];
    }

    if (/^SELECT \* FROM report_template_fields WHERE id = \?$/i.test(sql)) {
      return [[this.fields.get(Number(params[0]))].filter(Boolean), []];
    }

    if (/^INSERT IGNORE INTO report_assignments /i.test(sql)) {
      const templateId = Number(params[0]);
      this.assertTransactionActive(connection);
      this.assertLocked(connectionId, templateId);
      const [template_id, assigned_to_company_id, title, period_label, deadline, assigned_by] = params;
      const duplicate = [...this.assignments.values()].find(
        (candidate) => candidate.template_id === Number(template_id)
          && candidate.assigned_to_company_id === Number(assigned_to_company_id)
          && candidate.period_label === period_label,
      );
      if (duplicate) return [{ insertId: 0, affectedRows: 0 }, []];
      const id = this.nextAssignmentId++;
      const assignment: ReportAssignment = {
        id,
        template_id: Number(template_id),
        assigned_to_company_id: Number(assigned_to_company_id),
        title,
        period_label,
        deadline,
        status: 'pending',
        assigned_by: Number(assigned_by),
        created_at: '2026-07-22 00:00:00.000',
      };
      this.assignments.set(id, assignment);
      connection?.recordUndo(() => this.assignments.delete(id));
      return [{ insertId: id, affectedRows: 1 }, []];
    }

    if (/^SELECT \* FROM report_assignments WHERE id = \?$/i.test(sql)) {
      return [[this.assignments.get(Number(params[0]))].filter(Boolean), []];
    }

    throw new Error(`Unsupported SQL in transactional test pool: ${sql}`);
  }

  private assertLocked(connectionId: number, templateId: number): void {
    if (!this.holdsTemplateLock(templateId, connectionId)) {
      throw new Error(`template ${templateId} mutated without SELECT FOR UPDATE lock`);
    }
  }

  private assertTransactionActive(connection: TransactionalTemplateConnection | undefined): asserts connection {
    if (!connection) throw new Error('operation requires an active transaction connection');
    connection.assertActiveTransaction();
  }
}

class TransactionalTemplateConnection {
  private transactionActive = false;
  private lockedTemplateIds = new Set<number>();
  private undo: Array<() => void> = [];

  constructor(private readonly pool: TransactionalTemplatePool, readonly id: number) {}

  async beginTransaction(): Promise<void> {
    if (this.transactionActive) throw new Error('transaction is already active');
    this.transactionActive = true;
  }

  async execute(sql: string, params: any[] = []): Promise<any> {
    return this.pool.executeQuery(this.id, this, sql, params);
  }

  async lockTemplate(templateId: number): Promise<void> {
    this.assertActiveTransaction();
    await this.pool.acquireTemplateLock(templateId, this.id);
    this.lockedTemplateIds.add(templateId);
  }

  recordUndo(action: () => void): void {
    this.assertActiveTransaction();
    this.undo.push(action);
  }

  async commit(): Promise<void> {
    this.assertActiveTransaction();
    this.undo = [];
    this.releaseLocks();
    this.transactionActive = false;
  }

  async rollback(): Promise<void> {
    this.assertActiveTransaction();
    for (const action of this.undo.reverse()) action();
    this.undo = [];
    this.releaseLocks();
    this.transactionActive = false;
  }

  assertActiveTransaction(): void {
    if (!this.transactionActive) throw new Error('operation requires an active transaction');
  }

  release(): void {
    this.releaseLocks();
  }

  private releaseLocks(): void {
    for (const templateId of this.lockedTemplateIds) {
      this.pool.releaseTemplateLock(templateId, this.id);
    }
    this.lockedTemplateIds.clear();
  }
}
