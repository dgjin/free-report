import 'dotenv/config';
import 'express-async-errors';
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
import { describeMysqlConfig, readMysqlConfig, verifyMysqlConnection } from './server/src/mysql';

async function startServer() {
  await verifyMysqlConnection();
  console.log(`[FreeReport DB] Connected to ${describeMysqlConfig(readMysqlConfig())}`);
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({
    origin(origin, callback) {
      if (!origin || process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin is not allowed by CORS policy'));
      }
    },
  }));
  app.use(express.json());

  // Auth Routes
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请填写用户名和密码' });
    }

    const user = await db.getUserByUsername(username);
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

    const token = await generateToken(user);
    const company = await db.getCompanyById(user.company_id);

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

  app.use('/api', (error: unknown, req: Request, res: Response, next: express.NextFunction) => {
    console.error('[FreeReport API]', error);
    if (res.headersSent) return next(error);
    const statusCode = typeof error === 'object' && error && 'statusCode' in error
      ? Number((error as { statusCode: number }).statusCode)
      : 500;
    res.status(statusCode).json({
      error: statusCode === 500 ? '服务器处理请求时发生异常' : (error as Error).message,
    });
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

startServer().catch((error) => {
  console.error('[FreeReport Server] Startup failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
