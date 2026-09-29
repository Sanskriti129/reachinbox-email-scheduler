import { config } from '../config.js';
import { query } from '../db/index.js';

export const SLACK_SCOPES = ['incoming-webhook', 'chat:write'];
export const slackRedirectUri = () => `${config.BACKEND_URL}/api/slack/callback`;

export function slackAuthorizeUrl(state: string) {
  const u = new URL('https://slack.com/oauth/v2/authorize');
  u.searchParams.set('client_id', config.SLACK_CLIENT_ID);
  u.searchParams.set('scope', SLACK_SCOPES.join(','));
  u.searchParams.set('redirect_uri', slackRedirectUri());
  u.searchParams.set('state', state);
  return u.toString();
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { url: string; channel: string };
}

export async function exchangeSlackCode(code: string, userId: number) {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.SLACK_CLIENT_ID,
      client_secret: config.SLACK_CLIENT_SECRET,
      redirect_uri: slackRedirectUri(),
    }),
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook) throw new Error(`Slack OAuth failed: ${data.error ?? 'no webhook'}`);

  await query(
    `INSERT INTO slack_connections (user_id, team_id, team_name, channel, webhook_url, access_token)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE SET team_id=$2, team_name=$3, channel=$4, webhook_url=$5,
       access_token=$6, created_at=now()`,
    [userId, data.team?.id, data.team?.name, data.incoming_webhook.channel, data.incoming_webhook.url, data.access_token],
  );
}

export async function getSlackConnection(userId: number) {
  const { rows } = await query<{ team_name: string; channel: string; webhook_url: string; created_at: Date }>(
    'SELECT team_name, channel, webhook_url, created_at FROM slack_connections WHERE user_id = $1',
    [userId],
  );
  return rows[0] ?? null;
}

export async function disconnectSlack(userId: number) {
  await query('DELETE FROM slack_connections WHERE user_id = $1', [userId]);
}

/**
 * Looked up from the DB at send time (never cached), so connecting / disconnecting
 * takes effect immediately without restarting workers. No connection → silent no-op.
 */
export async function notifySlack(userId: number, text: string, blocks?: unknown[]) {
  const conn = await getSlackConnection(userId);
  if (!conn) return false;
  try {
    const res = await fetch(conn.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks }),
    });
    if (res.status === 404 || res.status === 403) {
      // Webhook revoked on Slack's side (app removed) — treat as disconnected.
      await disconnectSlack(userId);
      return false;
    }
    return res.ok;
  } catch (err) {
    console.warn('[slack] notify failed:', (err as Error).message);
    return false;
  }
}

export function rateLimitMessage(opts: {
  senderEmail: string;
  scope: 'sender' | 'global';
  limit: number;
  resumesAt: Date;
  pending: number;
}) {
  const who = opts.scope === 'sender' ? `Sender *${opts.senderEmail}*` : 'The *global* sending pool';
  const text = `:warning: ${who} hit its hourly limit of ${opts.limit} emails. ${opts.pending} queued email(s) were moved to the next window, resuming at ${opts.resumesAt.toISOString()}.`;
  return {
    text,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Hourly send limit reached' } },
      { type: 'section', text: { type: 'mrkdwn', text } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'ReachInbox Scheduler · no emails were dropped' }],
      },
    ],
  };
}
