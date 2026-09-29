import { Router, type Request } from 'express';
import { ZodError } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  counts,
  getEmail,
  limits,
  listEmails,
  scheduleCampaign,
  scheduleSchema,
} from '../services/emails.js';
import { listSenders } from '../services/mailer.js';
import { usageThisHour } from '../services/rateLimiter.js';
import { searchEmails } from '../services/search.js';

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const uid = (req: Request) => req.user!.id;

emailsRouter.get('/senders', async (_req, res) => {
  const senders = await listSenders();
  const withUsage = await Promise.all(senders.map(async (s) => ({ ...s, usage: await usageThisHour(s.id) })));
  res.json({ senders: withUsage, limits: limits() });
});

/** Schedule a campaign: one email per recipient, spaced by delayMs, starting at startAt. */
emailsRouter.post('/emails/schedule', async (req, res) => {
  try {
    const input = scheduleSchema.parse(req.body);
    const result = await scheduleCampaign(uid(req), input);
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof ZodError) return res.status(400).json({ error: 'Invalid request', issues: e.issues });
    const status = (e as { status?: number }).status ?? 500;
    if (status === 500) console.error('[schedule]', e);
    res.status(status).json({ error: (e as Error).message });
  }
});

emailsRouter.get('/emails/counts', async (req, res) => {
  res.json(await counts(uid(req)));
});

emailsRouter.get('/emails', async (req, res) => {
  const kind = req.query.status === 'sent' ? 'sent' : 'scheduled';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const q = String(req.query.q ?? '').trim();

  if (q) {
    try {
      const ids = await searchEmails(uid(req), q, kind);
      const result = await listEmails(uid(req), kind, { ids, limit, offset });
      // keep Elasticsearch relevance order
      result.items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      return res.json({ ...result, search: 'elasticsearch' });
    } catch (e) {
      console.warn('[search] falling back to empty result:', (e as Error).message);
      return res.status(503).json({ error: 'Search is temporarily unavailable' });
    }
  }
  res.json(await listEmails(uid(req), kind, { limit, offset }));
});

emailsRouter.get('/emails/:id', async (req, res) => {
  const email = await getEmail(uid(req), Number(req.params.id));
  if (!email) return res.status(404).json({ error: 'Not found' });
  res.json(email);
});
