import express, { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';

import companiesRouter from './server/src/routes/companies';
import templatesRouter from './server/src/routes/templates';
import assignmentsRouter from './server/src/routes/assignments';
import submissionsRouter from './server/src/routes/submissions';
import approvalsRouter from './server/src/routes/approvals';
import aggregationsRouter from './server/src/routes/aggregations';

import { db } from './server/src/db';
import { generateToken, authMiddleware } from './server/src/auth';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Auth Routes
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请填写用户名和密码' });
    }

    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: '该账号已被停用' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user);
    const company = db.getCompanyById(user.company_id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        company_id: user.company_id,
        company_name: company ? company.name : '',
        company_code: company ? company.code : '',
        company_level: company ? company.level : 'branch',
        role: user.role,
      },
    });
  });

  app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
    res.json({ user: req.user });
  });

  // Business API Routes
  app.use('/api/companies', companiesRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/approvals', approvalsRouter);
  app.use('/api/aggregations', aggregationsRouter);

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Vite Middleware for SPA development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FreeReport Server] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
