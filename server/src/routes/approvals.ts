import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware } from '../auth';

const router = Router();

// GET /api/approvals/pending - Get pending approvals for current user
router.get('/pending', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!;
  const pendingTasks = await db.getPendingApprovalsForUser(user as any);
  res.json(pendingTasks);
});

// POST /api/approvals/:submissionId/action - Approve or Reject
router.post('/:submissionId/action', authMiddleware, async (req: Request, res: Response) => {
  const submissionId = parseInt(req.params.submissionId, 10);
  const { action, comment } = req.body;
  const user = req.user!;

  if (!action || !['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ error: '请提供有效的操作类型 (approved / rejected)' });
  }

  try {
    const result = await db.processApprovalAction(submissionId, user as any, action, comment);
    res.json({
      message: action === 'approved' ? '审批通过操作成功' : '报表已被驳回',
      submission: result.submission,
      approval: result.approval,
    });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ error: err.message || '审批操作失败' });
  }
});

export default router;
