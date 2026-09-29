import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { redis } from '../lib/redis.js';
import { readSession, requireAuth } from '../middleware/auth.js';
import {
  disconnectSlack,
  exchangeSlackCode,
  getSlackConnection,
  notifySlack,
  slackAuthorizeUrl,
} from '../services/slack.js';

export const slackRouter = Router();

const back = (status: string) => `${config.FRONTEND_URL}/?slack=${status}`;

/** Browser navigates here from "Connect Slack". State ties the callback to this user. */
slackRouter.get('/install', async (req, res) => {
  const user = readSession(req);
  if (!user) return res.redirect(`${config.FRONTEND_URL}/login`);
  if (!config.SLACK_CLIENT_ID) return res.redirect(back('not_configured'));
  const state = crypto.randomBytes(16).toString('hex');
  await redis.set(`slack:state:${state}`, String(user.id), 'EX', 600);
  res.redirect(slackAuthorizeUrl(state));
});

slackRouter.get('/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) return res.redirect(back('denied'));
  if (!code || !state) return res.redirect(back('error'));

  const userId = await redis.getdel(`slack:state:${state}`);
  if (!userId) return res.redirect(back('expired'));
  try {
    await exchangeSlackCode(code, Number(userId));
    await notifySlack(
      Number(userId),
      ':white_check_mark: ReachInbox Scheduler connected. You will be notified here when a sender hits its hourly limit.',
    );
    res.redirect(back('connected'));
  } catch (e) {
    console.error('[slack]', e);
    res.redirect(back('error'));
  }
});

slackRouter.get('/status', requireAuth, async (req, res) => {
  const c = await getSlackConnection(req.user!.id);
  res.json(c ? { connected: true, team: c.team_name, channel: c.channel, since: c.created_at } : { connected: false });
});

slackRouter.post('/test', requireAuth, async (req, res) => {
  const ok = await notifySlack(req.user!.id, ':bell: Test notification from ReachInbox Scheduler');
  res.status(ok ? 200 : 400).json({ ok });
});

slackRouter.delete('/', requireAuth, async (req, res) => {
  await disconnectSlack(req.user!.id);
  res.json({ ok: true });
});
