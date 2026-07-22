import { Router, Request, Response, type RequestHandler } from 'express';
import { db, type Database } from '../db';
import { authMiddleware, requireHeadquarter } from '../auth';

type TemplateRouterMiddleware = {
  authMiddleware: RequestHandler;
  requireHeadquarter: RequestHandler;
};

export function createTemplatesRouter(
  database: Database = db,
  middleware: TemplateRouterMiddleware = { authMiddleware, requireHeadquarter },
) {
  const router = Router();
  const authenticate = middleware.authMiddleware;
  const authorizeHeadquarter = middleware.requireHeadquarter;

  function setTemplateEnabled(enabled: boolean) {
    return async (req: Request, res: Response) => {
      const id = parseInt(req.params.id, 10);
      const updated = await database.setTemplateEnabled(id, enabled);
      if (!updated) {
        return res.status(404).json({ error: '模板不存在' });
      }

      res.json({
        message: enabled ? '模板已启用' : '模板已停用',
        template: updated,
      });
    };
  }

// GET /api/templates - Get template list
router.get('/', authenticate, async (req: Request, res: Response) => {
  const templates = await database.getTemplates();
  const allAssignments = await database.getAssignments();
  const result = await Promise.all(templates.map(async (t) => {
    const fields = (await database.getTemplateFields(t.id)).filter((f) => f.status === 'active');
    const assignments = allAssignments.filter((a) => a.template_id === t.id);
    const creator = await database.getUserById(t.created_by);

    return {
      ...t,
      field_count: fields.length,
      assignment_count: assignments.length,
      created_by_name: creator ? creator.display_name : '管理员',
    };
  }));

  res.json(result);
});

// GET /api/templates/:id - Get template details with fields
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const template = await database.getTemplateById(id);
  if (!template) {
    return res.status(404).json({ error: '模板不存在' });
  }

  const [fields, creator] = await Promise.all([
    database.getTemplateFields(id),
    database.getUserById(template.created_by),
  ]);

  res.json({
    ...template,
    created_by_name: creator ? creator.display_name : '管理员',
    fields,
  });
});

// POST /api/templates - Create template with initial fields
router.post('/', authenticate, authorizeHeadquarter, async (req: Request, res: Response) => {
  const { name, description, period_type, fields } = req.body;

  if (!name || !period_type) {
    return res.status(400).json({ error: '模板名称与填报周期为必填项' });
  }

  try {
    const created = await database.createTemplate(
      {
        name,
        description: description || '',
        period_type,
        status: 'published',
        created_by: req.user!.id,
      },
      fields || []
    );

    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message || '创建模板失败' });
  }
});

// PUT /api/templates/:id/disable - Disable template
router.put('/:id/disable', authenticate, authorizeHeadquarter, setTemplateEnabled(false));

// PUT /api/templates/:id/enable - Enable template
router.put('/:id/enable', authenticate, authorizeHeadquarter, setTemplateEnabled(true));

// PUT /api/templates/:id - Update template basic info
router.put('/:id', authenticate, authorizeHeadquarter, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { name, description, period_type } = req.body;

  const updated = await database.updateTemplate(id, {
    ...(name && { name }),
    ...(description !== undefined && { description }),
    ...(period_type && { period_type }),
  });

  if (!updated) {
    return res.status(404).json({ error: '模板不存在' });
  }

  res.json(updated);
});

// POST /api/templates/:id/fields - Add field to template
router.post('/:id/fields', authenticate, authorizeHeadquarter, async (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id, 10);
  const { field_name, field_label, field_type, data_type, field_config, sort_order } = req.body;

  if (!field_name || !field_label || !field_type || !data_type) {
    return res.status(400).json({ error: '字段标识、名称、字段类型和数据分类为必填项' });
  }

  const field = await database.addTemplateField({
    template_id: templateId,
    field_name,
    field_label,
    field_type,
    data_type,
    field_config: field_config || {},
    sort_order: sort_order || 0,
    status: 'active',
  });

  res.status(201).json(field);
});

// PUT /api/templates/:id/fields/:fieldId/disable - Disable (soft delete) field
router.put('/:id/fields/:fieldId/disable', authenticate, authorizeHeadquarter, async (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id, 10);
  const fieldId = parseInt(req.params.fieldId, 10);
  const disabled = await database.disableTemplateField(templateId, fieldId);

  res.json({ message: '字段已停用', field: disabled });
});

// POST /api/templates/:id/assign - Assign template to branches
router.post('/:id/assign', authenticate, authorizeHeadquarter, async (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id, 10);
  const { company_ids, title, period_label, deadline } = req.body;

  if (!company_ids || !Array.isArray(company_ids) || company_ids.length === 0) {
    return res.status(400).json({ error: '请至少选择一个下发目标分公司' });
  }

  if (!title || !deadline) {
    return res.status(400).json({ error: '下发标题和截止日期为必填项' });
  }

  const newAssignments = await database.createAssignments(
    templateId,
    company_ids,
    title,
    period_label || '本期',
    deadline,
    req.user!.id
  );

  res.status(201).json({
    message: `成功下发给 ${newAssignments.length} 个分公司`,
    assignments: newAssignments,
  });
});

  return router;
}

export default createTemplatesRouter();
