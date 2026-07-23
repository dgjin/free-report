import { Router } from 'express';
import { db } from '../db';
import { authMiddleware, requireSuperAdmin } from '../auth';

const router = Router();
router.use(authMiddleware, requireSuperAdmin);
router.get('/', async (_req, res) => res.json(await db.getUsers()));
router.put('/:id/organization-role', async (req, res) => {
  const user = await db.updateUserOrganizationRole(Number(req.params.id), Number(req.body.company_id), req.body.role);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user);
});
export default router;
