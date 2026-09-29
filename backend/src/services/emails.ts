import { z } from 'zod';
import { config } from '../config.js';
import { pool, query } from '../db/index.js';
import { emailQueue, enqueueEmail, jobIdFor } from '../lib/queue.js';
import type { EmailRow, SendEmailJob } from '../types.js';
import { indexEmails } from './search.js';

const emailAddress = z.string().trim().toLowerCase().pipe(z.email());

export const scheduleSchema = z.object({
  senderId: z.coerce.number().int().positive(),
  subject: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(100_000),
  recipients: z.array(z.string()).min(1).max(10_000),
  startAt: z.coerce.date(),
  delayMs: z.coerce.number().int().min(0).max(24 * 3600 * 1000),
  hourlyLimit: z.coerce.number().int().positive().max(100_000),
});
export type ScheduleInput = z.infer<typeof scheduleSchema>;

/** Keep only valid, unique addresses (case-insensitive) preserving input order. */
export function cleanRecipients(raw: string[]) {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalid = 0;
  for (const r of raw) {
    const parsed = emailAddress.safeParse(r);
    if (!parsed.success) {
      invalid++;
      continue;
    }
    if (seen.has(parsed.data)) continue;
    seen.add(parsed.data);
    valid.push(parsed.data);
  }
  return { valid, invalid, duplicates: raw.length - invalid - valid.length };
}

/**
 * Persist a campaign and fan it out into one row + one delayed BullMQ job per recipient.
 * Recipient i is scheduled at startAt + i * delayMs. Rows are written in one transaction
 * before any job is enqueued, so the DB is always the source of truth.
 */
export async function scheduleCampaign(userId: number, input: ScheduleInput) {
  const { valid, invalid, duplicates } = cleanRecipients(input.recipients);
  if (!valid.length) throw Object.assign(new Error('No valid email addresses'), { status: 400 });

  const start = Math.max(input.startAt.getTime(), Date.now());
  const times = valid.map((_, i) => new Date(start + i * input.delayMs));

  const client = await pool.connect();
  let rows: (EmailRow & { sender_email: string })[];
  let campaignId: number;
  try {
    await client.query('BEGIN');
    const sender = await client.query('SELECT email FROM senders WHERE id = $1', [input.senderId]);
    if (!sender.rowCount) throw Object.assign(new Error('Unknown sender'), { status: 400 });

    const c = await client.query<{ id: number }>(
      `INSERT INTO campaigns (user_id, sender_id, subject, body, start_at, delay_ms, hourly_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [userId, input.senderId, input.subject, input.body, new Date(start), input.delayMs, input.hourlyLimit],
    );
    campaignId = c.rows[0].id;

    // Single round-trip insert for thousands of rows.
    const ins = await client.query<EmailRow>(
      `INSERT INTO emails (campaign_id, user_id, sender_id, recipient, subject, body, scheduled_at, original_scheduled_at)
       SELECT $1, $2, $3, r, $4, $5, t, t FROM unnest($6::text[], $7::timestamptz[]) AS x(r, t)
       ON CONFLICT (campaign_id, recipient) DO NOTHING
       RETURNING *`,
      [campaignId, userId, input.senderId, input.subject, input.body, valid, times],
    );
    rows = ins.rows.map((r) => ({ ...r, sender_email: sender.rows[0].email }));
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // Enqueue in chunks. If the process dies half-way, reconcileQueue() picks up the rest.
  for (let i = 0; i < rows.length; i += 500) {
    await emailQueue.addBulk(
      rows.slice(i, i + 500).map((r) => ({
        name: 'send',
        data: { emailId: r.id, senderId: r.sender_id, hourlyLimit: input.hourlyLimit } satisfies SendEmailJob,
        opts: { jobId: jobIdFor(r.id), delay: Math.max(0, r.scheduled_at.getTime() - Date.now()) },
      })),
    );
  }
  void indexEmails(rows);

  return { campaignId, scheduled: rows.length, invalid, duplicates, firstAt: times[0], lastAt: times.at(-1) };
}

/**
 * Boot-time safety net. Redis (with AOF) normally keeps delayed jobs across restarts,
 * but if Redis was wiped or a crash happened between DB commit and enqueue, every
 * unsent email in Postgres gets its job re-created. jobId de-dupes, so this is a no-op
 * for jobs that already exist.
 */
export async function reconcileQueue() {
  const { rows } = await query<EmailRow & { hourly_limit: number }>(
    `SELECT e.*, c.hourly_limit FROM emails e JOIN campaigns c ON c.id = e.campaign_id
     WHERE e.status IN ('scheduled', 'sending') ORDER BY e.scheduled_at`,
  );
  let restored = 0;
  for (const e of rows) {
    const job = await emailQueue.getJob(jobIdFor(e.id));
    if (job) {
      const state = await job.getState();
      if (state !== 'completed' && state !== 'failed' && state !== 'unknown') continue;
      await job.remove().catch(() => {});
    }
    await enqueueEmail({ emailId: e.id, senderId: e.sender_id, hourlyLimit: e.hourly_limit }, e.scheduled_at);
    restored++;
  }
  console.log(`[reconcile] ${rows.length} pending email(s) in DB, ${restored} job(s) re-created`);
  return { pending: rows.length, restored };
}

const LIST_COLUMNS = `e.id, e.recipient, e.subject, left(regexp_replace(e.body, '<[^>]+>', ' ', 'g'), 200) AS snippet,
  e.status, e.scheduled_at, e.original_scheduled_at, e.sent_at, e.preview_url, e.error, e.reschedule_count,
  s.email AS sender_email, s.name AS sender_name`;

export async function listEmails(
  userId: number,
  kind: 'scheduled' | 'sent',
  opts: { limit?: number; offset?: number; ids?: number[] } = {},
) {
  const statuses = kind === 'scheduled' ? ['scheduled', 'sending'] : ['sent', 'failed'];
  const order = kind === 'scheduled' ? 'e.scheduled_at ASC' : 'e.sent_at DESC NULLS LAST, e.id DESC';
  const params: unknown[] = [userId, statuses, opts.limit ?? 50, opts.offset ?? 0];
  let idFilter = '';
  if (opts.ids) {
    params.push(opts.ids);
    idFilter = `AND e.id = ANY($5::int[])`;
  }
  const { rows } = await query(
    `SELECT ${LIST_COLUMNS} FROM emails e JOIN senders s ON s.id = e.sender_id
     WHERE e.user_id = $1 AND e.status = ANY($2::email_status[]) ${idFilter}
     ORDER BY ${order} LIMIT $3 OFFSET $4`,
    params,
  );
  const total = await query<{ count: string }>(
    `SELECT count(*) FROM emails e WHERE e.user_id = $1 AND e.status = ANY($2::email_status[]) ${idFilter.replace('$5', '$3')}`,
    opts.ids ? [userId, statuses, opts.ids] : [userId, statuses],
  );
  return { items: rows, total: Number(total.rows[0].count) };
}

export async function getEmail(userId: number, id: number) {
  const { rows } = await query(
    `SELECT e.*, s.email AS sender_email, s.name AS sender_name FROM emails e
     JOIN senders s ON s.id = e.sender_id WHERE e.user_id = $1 AND e.id = $2`,
    [userId, id],
  );
  return rows[0] ?? null;
}

export async function counts(userId: number) {
  const { rows } = await query<{ scheduled: string; sent: string }>(
    `SELECT count(*) FILTER (WHERE status IN ('scheduled','sending')) AS scheduled,
            count(*) FILTER (WHERE status IN ('sent','failed')) AS sent
     FROM emails WHERE user_id = $1`,
    [userId],
  );
  return { scheduled: Number(rows[0].scheduled), sent: Number(rows[0].sent) };
}

export const limits = () => ({
  minDelayBetweenSendsMs: config.MIN_DELAY_BETWEEN_SENDS_MS,
  maxEmailsPerHourPerSender: config.MAX_EMAILS_PER_HOUR_PER_SENDER,
  maxEmailsPerHour: config.MAX_EMAILS_PER_HOUR,
  workerConcurrency: config.WORKER_CONCURRENCY,
});
