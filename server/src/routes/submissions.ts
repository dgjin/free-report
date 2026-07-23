import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware, canReadAssignment, canWriteAssignment } from '../auth';

const router = Router();

// POST /api/submissions - Create or update report draft / submission
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!;
  const { assignment_id, summary, details, comment, action } = req.body;

  if (!assignment_id) {
    return res.status(400).json({ error: '请指定下发任务 ID' });
  }

  const isSubmit = action === 'submit';
  const assignmentId = Number(assignment_id);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ error: '下发任务 ID 格式错误' });
  }
  const assignment = await db.getAssignmentById(assignmentId);
  if (!assignment) {
    return res.status(404).json({ error: '下发任务不存在' });
  }
  if (!canWriteAssignment(user, assignment)) {
    return res.status(403).json({ error: '无权填写该任务' });
  }

  try {
    const result = await db.createOrUpdateSubmission(
      assignmentId,
      user.id,
      user.company_id,
      summary || {},
      details || [],
      comment || '',
      isSubmit
    );

    res.status(201).json({
      message: isSubmit ? '报表提交成功，已发送至下发部门等待签收' : '草稿保存成功',
      submission: result.submission,
      approvals: result.approvals,
    });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ error: err.message || '保存或提交报表数据失败' });
  }
});

// POST /api/submissions/:id/submit - Submit existing draft for approval
router.post('/:id/submit', authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const submission = await db.getSubmissionById(id);

  if (!submission) {
    return res.status(404).json({ error: '填报记录不存在' });
  }

  const { comment } = req.body;
  const user = req.user!;
  const assignment = await db.getAssignmentById(submission.assignment_id);
  if (!assignment || !canWriteAssignment(user, assignment)) {
    return res.status(403).json({ error: '无权提交该填报记录' });
  }

  try {
    const subDataRaw = await db.getSubmissionData(submission.id);
    const summaryData: Record<number, string> = {};
    const detailRowsMap: Record<number, Record<number, string>> = {};

    subDataRaw.forEach((item) => {
      if (item.row_index === 0) {
        summaryData[item.field_id] = item.value;
      } else {
        if (!detailRowsMap[item.row_index]) detailRowsMap[item.row_index] = {};
        detailRowsMap[item.row_index][item.field_id] = item.value;
      }
    });

    const detailData = Object.values(detailRowsMap);

    const result = await db.createOrUpdateSubmission(
      submission.assignment_id,
      user.id,
      user.company_id,
      summaryData,
      detailData,
      comment || submission.comment,
      true
    );

    res.json({
      message: '提交成功，已发送至下发部门等待签收',
      submission: result.submission,
    });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ error: err.message || '提交失败' });
  }
});

async function renderSubmissionDetail(submissionId: number, req: Request, res: Response) {
  const submission = await db.getSubmissionById(submissionId);

  if (!submission) {
    return res.status(404).json({ error: '填报记录不存在' });
  }
  const assignment = await db.getAssignmentById(submission.assignment_id);
  if (!assignment || !canReadAssignment(req.user!, assignment)) return res.status(403).json({ error: '无权查看该填报记录' });
  const template = assignment ? await db.getTemplateById(assignment.template_id) : undefined;
  const templateFields = template ? await db.getTemplateFields(template.id) : [];

  const [rawData, approvals] = await Promise.all([
    db.getSubmissionData(submissionId), db.getApprovalRecords(submissionId),
  ]);

  // Group summary fields
  const summary: Array<{
    field_id: number;
    field_name: string;
    field_label: string;
    field_type: string;
    value: string;
    row_index: number;
  }> = [];

  // Group detail rows
  const detailRowsMap: Record<
    number,
    Array<{
      field_id: number;
      field_name: string;
      field_label: string;
      value: string;
      row_index: number;
    }>
  > = {};

  rawData.forEach((item) => {
    const field = templateFields.find((f) => f.id === item.field_id);
    if (!field) return;

    if (item.row_index === 0) {
      summary.push({
        field_id: item.field_id,
        field_name: field.field_name,
        field_label: field.field_label,
        field_type: field.field_type,
        value: item.value,
        row_index: 0,
      });
    } else {
      if (!detailRowsMap[item.row_index]) detailRowsMap[item.row_index] = [];
      detailRowsMap[item.row_index].push({
        field_id: item.field_id,
        field_name: field.field_name,
        field_label: field.field_label,
        value: item.value,
        row_index: item.row_index,
      });
    }
  });

  const details = Object.values(detailRowsMap);

  const formattedApprovals = await Promise.all(approvals.map(async (app) => {
    const approverUser = await db.getUserById(app.approver_id);
    return {
      ...app,
      approver_name: approverUser ? approverUser.display_name : '未指定',
      approver_role: approverUser ? approverUser.role : '',
    };
  }));

  const [submitter, company] = await Promise.all([
    db.getUserById(submission.submitted_by), db.getCompanyById(submission.submitted_by_company_id),
  ]);

  res.json({
    ...submission,
    assignment_title: assignment ? assignment.title : '',
    template_name: template ? template.name : '',
    submitted_by_name: submitter ? submitter.display_name : '经办人',
    company_name: company ? company.name : '',
    summary,
    details,
    approvals: formattedApprovals,
  });
}

// GET /api/submissions/:id - Get submission detail with parsed summary, details & approvals
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: '填报记录 ID 格式错误' });
  await renderSubmissionDetail(id, req, res);
});

// GET /api/submissions/by-assignment/:assignmentId - Get latest submission for assignment
router.get('/by-assignment/:assignmentId', authMiddleware, async (req: Request, res: Response) => {
  const assignmentId = parseInt(req.params.assignmentId, 10);
  if (!Number.isInteger(assignmentId)) return res.status(400).json({ error: '下发任务 ID 格式错误' });
  const assignment = await db.getAssignmentById(assignmentId);
  if (!assignment) return res.status(404).json({ error: '下发任务不存在' });
  if (!canReadAssignment(req.user!, assignment)) {
    return res.status(403).json({ error: '无权查看该任务的填报记录' });
  }
  const submission = await db.getLatestSubmissionByAssignment(assignmentId);

  if (!submission) {
    return res.status(200).json(null);
  }

  await renderSubmissionDetail(submission.id, req, res);
});

export default router;
