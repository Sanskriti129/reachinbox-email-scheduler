import { pool, query } from '../db/index.js';
import { httpError } from '../lib/http.js';
import { enqueueEmails, removeEmailJobs } from '../lib/queue.js';
import { sendEmail } from './mailer.js';
import { deleteEmailDoc, updateEmailDoc } from './search.js';

export type CampaignStatus = 'active' | 'paused' | 'cancelled';

export async function listCampaigns(userId: number) {
  const { rows } = await query(
    `SELECT c.id, c.subject, c.status, c.start_at, c.delay_ms, c.hourly_limit, c.created_at,
            COALESCE(s.from_email, s.email) AS sender_email, s.name AS sender_name,
            count(e.id)::int AS total,
            count(e.id) FILTER (WHERE e.status = 'sent')::int AS sent,
            count(e.id) FILTER (WHERE e.status = 'failed')::int AS failed,
            count(e.id) FILTER (WHERE e.status IN ('scheduled', 'sending'))::int AS pending,
            min(e.scheduled_at) FILTER (WHERE e.status = 'scheduled') AS next_at,
            max(e.sent_at) AS last_sent_at
     FROM campaigns c
     JOIN senders s ON s.id = c.sender_id
     LEFT JOIN emails e ON e.campaign_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id, s.email, s.name
     ORDER BY c.created_at DESC
     LIMIT 200`,
    [userId],
  );
  return rows;
}

async function ownedCampaign(userId: number, id: number) {
  const { rows } = await query<{ id: number; status: CampaignStatus; delay_ms: number; hourly_limit: number }>(
    'SELECT id, status, delay_ms, hourly_limit FROM campaigns WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  if (!rows[0]) throw httpError(404, 'Campaign not found');
  return rows[0];
}

/**
 * Pause: flip the status first (so a worker that picks a job up mid-pause sees it),
 * then pull the not-yet-sent jobs out of the queue. Rows stay 'scheduled' in Postgres.
 */
export async function pauseCampaign(userId: number, id: number) {
  const c = await ownedCampaign(userId, id);
  if (c.status !== 'active') throw httpError(409, `Campaign is already ${c.status}`);
  await query(`UPDATE campaigns SET status = 'paused' WHERE id = $1`, [id]);
  const { rows } = await query<{ id: number }>(`SELECT id FROM emails WHERE campaign_id = $1 AND status = 'scheduled'`, [id]);
  await removeEmailJobs(rows.map((r) => r.id));
  return { paused: rows.length };
}

/**
 * Resume: remaining emails keep their order and spacing, starting now
 * (or at their original time, if that is still in the future).
 */
export async function resumeCampaign(userId: number, id: number) {
  const c = await ownedCampaign(userId, id);
  if (c.status !== 'paused') throw httpError(409, `Campaign is ${c.status}, not paused`);

  const client = await pool.connect();
  let rows: { id: number; sender_id: number; scheduled_at: Date }[];
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE campaigns SET status = 'active' WHERE id = $1`, [id]);
    const res = await client.query(
      `WITH pending AS (
         SELECT id, row_number() OVER (ORDER BY scheduled_at, id) - 1 AS pos, scheduled_at
         FROM emails WHERE campaign_id = $1 AND status = 'scheduled')
       UPDATE emails e
          SET scheduled_at = GREATEST(p.scheduled_at, now() + p.pos * ($2::int * interval '1 millisecond'))
         FROM pending p WHERE e.id = p.id
       RETURNING e.id, e.sender_id, e.scheduled_at`,
      [id, c.delay_ms],
    );
    rows = res.rows;
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // Old (completed/removed) jobs with the same deterministic id would make addBulk a no-op.
  await removeEmailJobs(rows.map((r) => r.id));
  await enqueueEmails(rows, c.hourly_limit);
  for (const r of rows) void updateEmailDoc(r.id, { scheduled_at: r.scheduled_at });
  return { resumed: rows.length };
}

/** Cancel: every email that hasn't gone out is dropped; sent history is kept. */
export async function cancelCampaign(userId: number, id: number) {
  const c = await ownedCampaign(userId, id);
  if (c.status === 'cancelled') throw httpError(409, 'Campaign is already cancelled');
  await query(`UPDATE campaigns SET status = 'cancelled' WHERE id = $1`, [id]);
  const { rows } = await query<{ id: number }>(
    `DELETE FROM emails WHERE campaign_id = $1 AND status = 'scheduled' RETURNING id`,
    [id],
  );
  await removeEmailJobs(rows.map((r) => r.id));
  for (const r of rows) void deleteEmailDoc(r.id);
  return { cancelled: rows.length };
}

/** Send one email to the signed-in user right now (bypasses the queue), to preview a campaign. */
export async function sendTestEmail(opts: { senderId: number; to: string; subject: string; body: string }) {
  const res = await sendEmail({
    id: -Date.now(), // unique Message-ID per test send
    campaign_id: 0,
    user_id: 0,
    sender_id: opts.senderId,
    recipient: opts.to,
    subject: `[TEST] ${opts.subject}`,
    body: opts.body,
  } as Parameters<typeof sendEmail>[0]);
  return { previewUrl: res.previewUrl };
}
