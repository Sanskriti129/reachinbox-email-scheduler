import crypto from 'node:crypto';
import { Router } from 'express';
import { config, secureCookies } from '../config.js';
import { query } from '../db/index.js';
import { clearSession, readSession, setSession } from '../middleware/auth.js';
import type { UserRow } from '../types.js';

export const authRouter = Router();

const redirectUri = () => `${config.BACKEND_URL}/api/auth/google/callback`;
const STATE_COOKIE = 'ri_oauth_state';

authRouter.get('/google', (_req, res) => {
  if (!config.GOOGLE_CLIENT_ID) return res.redirect(`${config.FRONTEND_URL}/login?error=not_configured`);
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 10 * 60_000 });

  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', config.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('prompt', 'select_account');
  res.redirect(u.toString());
});

authRouter.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const fail = (reason: string) => res.redirect(`${config.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);

  if (error) return fail(error);
  if (!code || !state || state !== req.cookies?.[STATE_COOKIE]) return fail('invalid_state');
  res.clearCookie(STATE_COOKIE);

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokens.access_token) return fail(tokens.error ?? 'token_exchange_failed');

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const p = (await profileRes.json()) as { sub: string; email: string; name?: string; picture?: string };

    const { rows } = await query<UserRow>(
      `INSERT INTO users (google_id, email, name, avatar_url) VALUES ($1,$2,$3,$4)
       ON CONFLICT (google_id) DO UPDATE SET email=$2, name=$3, avatar_url=$4
       RETURNING *`,
      [p.sub, p.email, p.name ?? p.email, p.picture ?? null],
    );
    const u = rows[0];
    setSession(res, { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatar_url });
    res.redirect(`${config.FRONTEND_URL}/`);
  } catch (e) {
    console.error('[auth] google callback', e);
    fail('login_failed');
  }
});

authRouter.get('/me', (req, res) => {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(user);
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});
