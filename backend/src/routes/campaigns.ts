import { Router, type Request } from 'express';
import { asyncRoute } from '../lib/http.js';
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

campaignsRouter.get('/campaigns', asyncRoute((req) => listCampaigns(uid(req)).then((items) => ({ items }))));
campaignsRouter.post('/campaigns/:id/pause', asyncRoute((req) => pauseCampaign(uid(req), Number(req.params.id))));
campaignsRouter.post('/campaigns/:id/resume', asyncRoute((req) => resumeCampaign(uid(req), Number(req.params.id))));
campaignsRouter.post('/campaigns/:id/cancel', asyncRoute((req) => cancelCampaign(uid(req), Number(req.params.id))));

/** "Send test to myself": same validation as scheduling, delivered right away to the signed-in user. */
const testSchema = scheduleSchema.pick({ senderId: true, subject: true, body: true });
campaignsRouter.post(
  '/emails/test',
  scheduleLimiter,
  asyncRoute(async (req) => {
    const input = testSchema.parse(req.body);
    return sendTestEmail({ ...input, to: req.user!.email });
  }),
);
