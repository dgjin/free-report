import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware, canReadAssignment, requireDepartmentReportAdmin } from '../auth';

const router = Router();

// GET /api/assignments - Get assignments list
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!;
  const assignments = await db.getAssignmentsForUser(user as any);

  // Batch fetch all related data in 4 queries instead of 4N
  const templateIds = [...new Set(assignments.map((a) => a.template_id))];
  const companyIds = [...new Set([
    ...assignments.map((a) => a.assigned_to_company_id),
    ...assignments.map((a) => a.issuer_department_id).filter((id): id is number => id != null),
  ])];
  const userIds = [...new Set(assignments.map((a) => a.assigned_by))];
  const assignmentIds = assignments.map((a) => a.id);

  const [templates, companies, users, latestSubmissions] = await Promise.all([
    db.getTemplatesByIds(templateIds),
    db.getCompaniesByIds(companyIds),
    db.getUsersByIds(userIds),
    db.getLatestSubmissionsByAssignmentIds(assignmentIds),
  ]);

  const templateMap = new Map(templates.map((t) => [t.id, t]));
  const companyMap = new Map(companies.map((c) => [c.id, c]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const latestSubmissionMap = new Map(latestSubmissions.map((s) => [s.assignment_id, s]));

  const result = assignments.map((a) => {
    const template = templateMap.get(a.template_id);
    const company = companyMap.get(a.assigned_to_company_id);
    const department = a.issuer_department_id ? companyMap.get(a.issuer_department_id) : undefined;
    const assigner = userMap.get(a.assigned_by);
    const latestSubmission = latestSubmissionMap.get(a.id);
    return {
      ...a,
      template_name: template ? template.name : '',
      period_type: template ? template.period_type : '',
      company_name: company ? company.name : '',
      company_code: company ? company.code : '',
      issuer_department_name: department ? department.name : '',
      assigned_by_name: assigner ? assigner.display_name : '管理员',
      submission_status: latestSubmission ? latestSubmission.status : 'pending',
      submission_version: latestSubmission ? latestSubmission.version : 0,
      submission_id: latestSubmission ? latestSubmission.id : null,
    };
  });

  res.json(result);
});

// GET /api/assignments/:id - Get assignment detail
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const assignment = await db.getAssignmentById(id);

  if (!assignment) {
    return res.status(404).json({ error: '下发任务不存在' });
  }
  if (!canReadAssignment(req.user!, assignment)) {
    return res.status(403).json({ error: '无权查看该下发任务' });
  }

  const [template, company, latestSubmission] = await Promise.all([
    db.getTemplateById(assignment.template_id), db.getCompanyById(assignment.assigned_to_company_id),
    db.getLatestSubmissionByAssignment(assignment.id),
  ]);
  const department = assignment.issuer_department_id ? await db.getCompanyById(assignment.issuer_department_id) : null;
  const fields = template ? await db.getTemplateFields(template.id) : [];

  res.json({
    ...assignment,
    template_name: template ? template.name : '',
    period_type: template ? template.period_type : '',
    company_name: company ? company.name : '',
    issuer_department_name: department ? department.name : '',
    fields,
    latest_submission: latestSubmission || null,
  });
});

// POST /api/assignments/:id/recall - Force recall an assignment
router.post('/:id/recall', authMiddleware, requireDepartmentReportAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: '请填写收回原因' });
  }

  try {
    const result = await db.recallAssignment(id, req.user!.id, req.user!.company_id, reason);
    res.json({ message: '任务已强制收回', assignment: result.assignment });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || '收回失败' });
  }
});

export default router;
