import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { User, Role, CompanyLevel, ReportAssignment, ReportSubmission } from './types';
import { canReadAssignment as scopedCanReadAssignment, canWriteAssignment as scopedCanWriteAssignment } from './department-policy';

export function getJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configuredSecret = env.JWT_SECRET?.trim();
  if (configuredSecret) return configuredSecret;
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  return 'free-report-development-secret';
}

const JWT_SECRET = getJwtSecret();

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

type AccessUser = Pick<User, 'id' | 'company_id' | 'role'> & {
  company_level?: CompanyLevel;
};

function isHeadquarterUser(user: AccessUser): boolean {
  return user.company_level === 'headquarter' ||
    user.role === 'super_admin' ||
    user.role === 'headquarter_admin';
}

export function canReadAssignment(user: AccessUser, assignment: ReportAssignment): boolean {
  return scopedCanReadAssignment(user, assignment);
}

export function canWriteAssignment(user: AccessUser, assignment: ReportAssignment): boolean {
  return scopedCanWriteAssignment(user, assignment);
}

export function canReadSubmission(user: AccessUser, submission: ReportSubmission): boolean {
  return isHeadquarterUser(user) || submission.submitted_by_company_id === user.company_id;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function generateToken(user: User): Promise<string> {
  const company = await db.getCompanyById(user.company_id);
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

async function toAuthenticatedUser(user: User): Promise<AuthenticatedUser> {
  const company = await db.getCompanyById(user.company_id);
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    company_id: user.company_id,
    company_name: company?.name || '',
    company_code: company?.code || '',
    company_level: company?.level || 'branch',
    role: user.role,
  };
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证 Token 或格式错误' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    const currentUser = await db.getUserById(decoded.id);
    if (!currentUser || currentUser.status !== 'active') {
      return res.status(401).json({ error: '账号不存在或已停用，请重新登录' });
    }
    req.user = await toAuthenticatedUser(currentUser);
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
