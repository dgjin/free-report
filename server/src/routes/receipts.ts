import { Router } from 'express';
import { db } from '../db';
import { authMiddleware, requireDepartmentReportAdmin } from '../auth';

const router = Router();
router.use(authMiddleware, requireDepartmentReportAdmin);
router.get('/pending', async (req, res) => res.json(await db.getPendingReceipts(req.user!.company_id)));
router.post('/:submissionId/action', async (req, res) => {
  const { action, comment } = req.body;
  if (!['received', 'returned'].includes(action)) return res.status(400).json({ error: '签收操作无效' });
  res.json(await db.processReceipt(Number(req.params.submissionId), req.user!.id, req.user!.company_id, action as 'received' | 'returned', comment || ''));
});
export default router;
