import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware, requireSuperAdmin } from '../auth';

const router = Router();

// GET /api/companies - Get company hierarchy tree
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const allCompanies = await db.getCompanies();
  const headquarter = allCompanies.find((c) => c.level === 'headquarter');
  const branches = allCompanies.filter((c) => c.level === 'branch');

  const result = {
    ...headquarter,
    children: branches,
  };

  res.json(result);
});

// GET /api/companies/branches - Get branch list for template assignment
router.get('/branches', authMiddleware, async (req: Request, res: Response) => {
  const branches = (await db.getCompanies()).filter((c) => c.level === 'branch' && c.status === 'active');
  res.json(branches);
});

router.get('/targets', authMiddleware, async (req: Request, res: Response) => {
  res.json(await db.getAssignmentTargets(req.user!.company_level === 'department' ? req.user!.company_id : undefined));
});

router.post('/', authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
  const { name, code, parent_id, level } = req.body;
  if (!name || !code || !parent_id || !['department', 'branch'].includes(level)) return res.status(400).json({ error: '机构参数不完整' });
  res.status(201).json(await db.createCompany({ name, code, parent_id, level }));
});

router.put('/:id/disable', authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
  const company = await db.disableCompany(Number(req.params.id));
  if (!company) return res.status(404).json({ error: '机构不存在' });
  res.json(company);
});

export default router;
