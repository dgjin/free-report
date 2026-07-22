import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware, requireHeadquarter } from '../auth';

const router = Router();

// GET /api/templates - Get template list
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const templates = await db.getTemplates();
  const allAssignments = await db.getAssignments();
  const result = await Promise.all(templates.map(async (t) => {
    const fields = (await db.getTemplateFields(t.id)).filter((f) => f.status === 'active');
    const assignments = allAssignments.filter((a) => a.template_id === t.id);
    const creator = await db.getUserById(t.created_by);

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
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const template = await db.getTemplateById(id);
  if (!template) {
    return res.status(404).json({ error: '模板不存在' });
  }

  const [fields, creator] = await Promise.all([db.getTemplateFields(id), db.getUserById(template.created_by)]);

  res.json({
    ...template,
    created_by_name: creator ? creator.display_name : '管理员',
    fields,
  });
});

// POST /api/templates - Create template with initial fields
router.post('/', authMiddleware, requireHeadquarter, async (req: Request, res: Response) => {
  const { name, description, period_type, fields } = req.body;

  if (!name || !period_type) {
    return res.status(400).json({ error: '模板名称与填报周期为必填项' });
  }

  try {
    const created = await db.createTemplate(
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

// PUT /api/templates/:id - Update template basic info
router.put('/:id', authMiddleware, requireHeadquarter, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { name, description, period_type, status } = req.body;

  const updated = await db.updateTemplate(id, {
    ...(name && { name }),
    ...(description !== undefined && { description }),
    ...(period_type && { period_type }),
    ...(status && { status }),
  });

  if (!updated) {
    return res.status(404).json({ error: '模板不存在' });
  }

  res.json(updated);
});

// POST /api/templates/:id/fields - Add field to template
router.post('/:id/fields', authMiddleware, requireHeadquarter, async (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id, 10);
  const template = await db.getTemplateById(templateId);
  if (!template) {
    return res.status(404).json({ error: '模板不存在' });
  }

  const { field_name, field_label, field_type, data_type, field_config, sort_order } = req.body;

  if (!field_name || !field_label || !field_type || !data_type) {
    return res.status(400).json({ error: '字段标识、名称、字段类型和数据分类为必填项' });
  }

  const existing = (await db.getTemplateFields(templateId)).find((f) => f.field_name === field_name);
  if (existing) {
    return res.status(400).json({ error: `字段标识 "${field_name}" 在该模板中已存在` });
  }

  const field = await db.addTemplateField({
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
router.put('/:id/fields/:fieldId/disable', authMiddleware, requireHeadquarter, async (req: Request, res: Response) => {
  const fieldId = parseInt(req.params.fieldId, 10);
  const disabled = await db.disableTemplateField(fieldId);

  if (!disabled) {
    return res.status(404).json({ error: '字段不存在' });
  }

  res.json({ message: '字段已停用', field: disabled });
});

// POST /api/templates/:id/assign - Assign template to branches
router.post('/:id/assign', authMiddleware, requireHeadquarter, async (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id, 10);
  const template = await db.getTemplateById(templateId);
  if (!template) {
    return res.status(404).json({ error: '模板不存在' });
  }

  const { company_ids, title, period_label, deadline } = req.body;

  if (!company_ids || !Array.isArray(company_ids) || company_ids.length === 0) {
    return res.status(400).json({ error: '请至少选择一个下发目标分公司' });
  }

  if (!title || !deadline) {
    return res.status(400).json({ error: '下发标题和截止日期为必填项' });
  }

  const newAssignments = await db.createAssignments(
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

export default router;
