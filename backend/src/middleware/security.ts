import type { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { RedisStore } from 'rate-limit-redis';
import { config } from '../config.js';
import { redis } from '../lib/redis.js';
import { readSession } from './auth.js';

/**
 * Security headers. The CSP allows only what the app actually loads:
 * our own JS/CSS, Google Fonts and Google profile pictures.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'", 'https://accounts.google.com', 'https://slack.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// Counters live in Redis so limits hold across every API instance (same idea as
// the email rate limiter).
const store = (prefix: string) =>
  new RedisStore({
    prefix: `rl:http:${prefix}:`,
    sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as never,
  });

/** Per user when logged in, per IP otherwise. */
const byUserOrIp = (req: Request) => {
  const user = readSession(req);
  return user ? `u:${user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
};

const tooMany = (_req: Request, res: Response) =>
  res.status(429).json({ error: 'Too many requests — please slow down and try again shortly.' });

/** General API budget: plenty for a dashboard that polls every few seconds. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: byUserOrIp,
  store: store('api'),
  handler: tooMany,
});

/** Scheduling is expensive (thousands of rows/jobs): a much tighter budget. */
export const scheduleLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: byUserOrIp,
  store: store('schedule'),
  handler: tooMany,
});

/** Login / OAuth endpoints: blunt brute-force and redirect-loop abuse. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? '')}`,
  store: store('auth'),
  handler: tooMany,
});

const allowedOrigins = new Set([new URL(config.FRONTEND_URL).origin, new URL(config.BACKEND_URL).origin]);

/**
 * CSRF defence on top of SameSite=Lax cookies: state-changing requests must come
 * from our own origin and be JSON (a cross-site <form> can't send application/json
 * without a CORS preflight, which we don't allow).
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin') ?? (req.get('referer') ? new URL(req.get('referer')!).origin : null);
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'Cross-site request blocked' });
  const hasBody = Number(req.get('content-length') ?? 0) > 0;
  if (hasBody && !req.is('application/json')) return res.status(415).json({ error: 'Expected application/json' });
  next();
}

/** Admin-only pages (the queue dashboard shows every user's jobs). */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = readSession(req);
  if (!user) return res.redirect(`${config.FRONTEND_URL}/login`);
  const admins = config.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  // No admins configured (local dev) → any signed-in user may look.
  if (admins.length && !admins.includes(user.email.toLowerCase())) {
    return res.status(403).send('The queue dashboard is restricted to administrators.');
  }
  next();
}
