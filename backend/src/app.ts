import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { migrate, query } from './db/index.js';
import { emailQueue } from './lib/queue.js';
import { redis } from './lib/redis.js';
import { apiLimiter, authLimiter, csrfProtection, requireAdmin, securityHeaders } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { campaignsRouter } from './routes/campaigns.js';
import { emailsRouter } from './routes/emails.js';
import { slackRouter } from './routes/slack.js';
import { ensureSenders } from './services/mailer.js';
import { ensureIndex, es } from './services/search.js';

export async function startServer() {
  await migrate();
  await ensureSenders();
  await ensureIndex().catch((e) => console.warn('[search] index setup failed:', e.message));

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    const check = async (fn: () => Promise<unknown>) => fn().then(() => 'ok', (e) => `down: ${e.message}`);
    res.json({
      db: await check(() => query('SELECT 1')),
      redis: await check(() => redis.ping()),
      elasticsearch: await check(() => es.ping()),
      queue: await emailQueue.getJobCounts('delayed', 'waiting', 'active', 'completed', 'failed'),
    });
  });

  app.use('/api', csrfProtection, apiLimiter);
  app.use(['/api/auth/google', '/api/slack/install', '/api/slack/callback'], authLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/slack', slackRouter);
  app.use('/api', campaignsRouter);
  app.use('/api', emailsRouter);

  // Live BullMQ dashboard (login required).
  const board = new ExpressAdapter();
  board.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: board });
  // Bull Board's UI uses inline scripts, so it gets its own relaxed CSP; access is admin-only.
  app.use(
    '/admin/queues',
    requireAdmin,
    (_req, res, next) => {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:");
      next();
    },
    board.getRouter(),
  );

  // In production the built frontend is served from the same origin.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const web = path.resolve(here, '../../frontend/dist');
  if (fs.existsSync(web)) {
    app.use(express.static(web));
    app.get(/^(?!\/api|\/admin).*/, (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  // JSON errors instead of Express's HTML stack traces (e.g. malformed request bodies).
  app.use((err: Error & { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error('[api]', err);
    res.status(status).json({ error: err.type === 'entity.parse.failed' ? 'Malformed JSON body' : status >= 500 ? 'Internal server error' : err.message });
  });

  app.listen(config.PORT, () => console.log(`[api] listening on :${config.PORT}  (queues: /admin/queues)`));
  return app;
}
