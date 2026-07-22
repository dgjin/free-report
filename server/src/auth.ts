import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { User, Role, CompanyLevel } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'free-report-secret-key-2026';

export interface AuthenticatedUser {
  id: number;
  username: string;
  display_name: string;
  company_id: number;
  company_name: string;
  company_code: string;
  company_level: CompanyLevel;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function generateToken(user: User): string {
  const company = db.getCompanyById(user.company_id);
  const payload: AuthenticatedUser = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    company_id: user.company_id,
    company_name: company ? company.name : '',
    company_code: company ? company.code : '',
    company_level: company ? company.level : 'branch',
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证 Token 或格式错误' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 无效或已过期，请重新登录' });
  }
}

export function requireHeadquarter(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: '未登录' });
  }

  if (req.user.company_level !== 'headquarter') {
    return res.status(403).json({ error: '仅总部角色允许访问此接口' });
  }

  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' });
    }

    if (!roles.includes(req.user.role) && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: '权限不足，无法执行此操作' });
    }

    next();
  };
}
