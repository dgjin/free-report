import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware, canReadAssignment } from '../auth';

const router = Router();

// GET /api/assignments - Get assignments list
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!;
  let assignments = await db.getAssignments();

  // If user is from branch, only return assignments assigned to their company
  if (user.company_level === 'branch') {
    assignments = assignments.filter((a) => a.assigned_to_company_id === user.company_id);
  }

  const result = await Promise.all(assignments.map(async (a) => {
    const [template, company, assigner, latestSubmission] = await Promise.all([
      db.getTemplateById(a.template_id), db.getCompanyById(a.assigned_to_company_id),
      db.getUserById(a.assigned_by), db.getLatestSubmissionByAssignment(a.id),
    ]);

    return {
      ...a,
      template_name: template ? template.name : '',
      period_type: template ? template.period_type : '',
      company_name: company ? company.name : '',
      company_code: company ? company.code : '',
      assigned_by_name: assigner ? assigner.display_name : '管理员',
      submission_status: latestSubmission ? latestSubmission.status : 'pending',
      submission_version: latestSubmission ? latestSubmission.version : 0,
      submission_id: latestSubmission ? latestSubmission.id : null,
    };
  }));

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
  const fields = template ? await db.getTemplateFields(template.id) : [];

  res.json({
    ...assignment,
    template_name: template ? template.name : '',
    period_type: template ? template.period_type : '',
    company_name: company ? company.name : '',
    fields,
    latest_submission: latestSubmission || null,
  });
});

export default router;
