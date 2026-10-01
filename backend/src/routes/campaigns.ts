import { Router, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { scheduleLimiter } from '../middleware/security.js';
import {
  cancelCampaign,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  sendTestEmail,
} from '../services/campaigns.js';
import { scheduleSchema } from '../services/emails.js';

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

const uid = (req: Request) => req.user!.id;

const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    if (e instanceof ZodError) return res.status(400).json({ error: 'Invalid request', issues: e.issues });
    const status = (e as { status?: number }).status ?? 500;
    if (status === 500) console.error('[campaigns]', e);
    res.status(status).json({ error: status === 500 ? 'Something went wrong' : (e as Error).message });
  }
};

campaignsRouter.get('/campaigns', handle((req) => listCampaigns(uid(req)).then((items) => ({ items }))));
campaignsRouter.post('/campaigns/:id/pause', handle((req) => pauseCampaign(uid(req), Number(req.params.id))));
campaignsRouter.post('/campaigns/:id/resume', handle((req) => resumeCampaign(uid(req), Number(req.params.id))));
campaignsRouter.post('/campaigns/:id/cancel', handle((req) => cancelCampaign(uid(req), Number(req.params.id))));

/** "Send test to myself": same validation as scheduling, delivered right away to the signed-in user. */
const testSchema = scheduleSchema.pick({ senderId: true, subject: true, body: true });
campaignsRouter.post(
  '/emails/test',
  scheduleLimiter,
  handle(async (req) => {
    const input = testSchema.parse(req.body);
    return sendTestEmail({ ...input, to: req.user!.email });
  }),
);
