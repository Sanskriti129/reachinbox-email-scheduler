import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, secureCookies } from '../config.js';

export const SESSION_COOKIE = 'ri_session';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function setSession(res: Response, user: SessionUser) {
  const token = jwt.sign(user, config.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE);
}

export function readSession(req: Request): SessionUser | null {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { id, email, name, avatarUrl } = jwt.verify(token, config.JWT_SECRET) as SessionUser;
    return { id, email, name, avatarUrl };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}
