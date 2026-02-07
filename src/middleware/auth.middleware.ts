import type { Request, Response, NextFunction } from 'express';
import { AuthError } from './error.middleware.js';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'] as string | undefined;
  const email = req.headers['x-user-email'] as string | undefined;
  const role = req.headers['x-user-role'] as string | undefined;

  if (!userId || !email || !role) {
    throw new AuthError('Missing authentication headers');
  }

  req.user = { userId, email, role };
  next();
}
