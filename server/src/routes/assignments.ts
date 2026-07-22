import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware } from '../auth';

const router = Router();

// GET /api/assignments - Get assignments list
router.get('/', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  let assignments = db.getAssignments();

  // If user is from branch, only return assignments assigned to their company
  if (user.company_level === 'branch') {
    assignments = assignments.filter((a) => a.assigned_to_company_id === user.company_id);
  }

  const result = assignments.map((a) => {
    const template = db.getTemplateById(a.template_id);
    const company = db.getCompanyById(a.assigned_to_company_id);
    const assigner = db.getUserById(a.assigned_by);
    const latestSubmission = db.getLatestSubmissionByAssignment(a.id);

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
  });

  res.json(result);
});

// GET /api/assignments/:id - Get assignment detail
router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const assignment = db.getAssignmentById(id);

  if (!assignment) {
    return res.status(404).json({ error: '下发任务不存在' });
  }

  const template = db.getTemplateById(assignment.template_id);
  const company = db.getCompanyById(assignment.assigned_to_company_id);
  const fields = template ? db.getTemplateFields(template.id) : [];
  const latestSubmission = db.getLatestSubmissionByAssignment(assignment.id);

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
