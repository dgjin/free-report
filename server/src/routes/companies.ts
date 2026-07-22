import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authMiddleware } from '../auth';

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

export default router;
