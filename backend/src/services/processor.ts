import { DelayedError, type Job } from 'bullmq';
import { config } from '../config.js';
import { query } from '../db/index.js';
import type { EmailRow, SendEmailJob } from '../types.js';
import { sendEmail } from './mailer.js';
import { nextSlotAfterLimit, releaseSlot, reserveSlot, shouldNotifyLimit } from './rateLimiter.js';
import { updateEmailDoc } from './search.js';
import { notifySlack, rateLimitMessage } from './slack.js';

const log = (...a: unknown[]) => console.log('[worker]', ...a);

/**
 * Processes one "send" job. Order of operations matters for correctness:
 *
 *  1. Load row; if already sent/failed → no-op        (idempotency on replays)
 *  2. Reserve an hourly slot atomically in Redis       (limit safe across instances)
 *     └ limit hit → move job to next window, notify Slack once, stop
 *  3. Claim the row: scheduled → sending in one UPDATE (only one worker can win)
 *  4. SMTP send, then mark sent
 */
export async function processSendJob(job: Job<SendEmailJob>, token?: string) {
  const { emailId, senderId, hourlyLimit } = job.data;

  const { rows } = await query<EmailRow>('SELECT * FROM emails WHERE id = $1', [emailId]);
  const email = rows[0];
  if (!email) return { skipped: 'deleted' };
  if (email.status === 'sent' || email.status === 'failed') return { skipped: `already ${email.status}` };

  const slot = await reserveSlot(senderId, hourlyLimit);
  if (!slot.ok) {
    const nextAt = await nextSlotAfterLimit(senderId);
    await query(
      `UPDATE emails SET scheduled_at = $2, reschedule_count = reschedule_count + 1 WHERE id = $1`,
      [emailId, new Date(nextAt)],
    );
    void updateEmailDoc(emailId, { scheduled_at: new Date(nextAt) });

    if (await shouldNotifyLimit(senderId, slot.scope)) void alertLimitHit(email, slot.scope, hourlyLimit, nextAt);

    log(`email ${emailId}: ${slot.scope} hourly limit reached → deferred to ${new Date(nextAt).toISOString()}`);
    // Not a failure: the job goes back to "delayed" and does not consume an attempt.
    await job.moveToDelayed(nextAt, token);
    throw new DelayedError();
  }

  // A row stuck in 'sending' (worker crashed mid-send) can be re-claimed after the lock ages out.
  const claim = await query<EmailRow>(
    `UPDATE emails SET status = 'sending', locked_at = now(), attempts = attempts + 1
     WHERE id = $1 AND (status = 'scheduled' OR (status = 'sending' AND locked_at < now() - interval '2 minutes'))
     RETURNING *`,
    [emailId],
  );
  if (!claim.rowCount) {
    await releaseSlot(senderId);
    const { rows: now } = await query<{ status: string }>('SELECT status FROM emails WHERE id = $1', [emailId]);
    if (now[0]?.status === 'sending') {
      // Someone holds a fresh lock. If that worker is alive it will finish; if it died,
      // the lock ages out — so check again after the lock window instead of dropping the job.
      await job.moveToDelayed(Date.now() + 150_000, token);
      throw new DelayedError();
    }
    return { skipped: `already ${now[0]?.status ?? 'deleted'}` };
  }

  try {
    const res = await sendEmail(claim.rows[0]);
    const sentAt = new Date();
    await query(
      `UPDATE emails SET status = 'sent', sent_at = $2, message_id = $3, preview_url = $4, error = NULL, locked_at = NULL
       WHERE id = $1`,
      [emailId, sentAt, res.messageId, res.previewUrl],
    );
    void updateEmailDoc(emailId, { status: 'sent', sent_at: sentAt });
    log(`email ${emailId} → ${email.recipient} sent ${res.previewUrl ?? ''}`);
    return res;
  } catch (err) {
    await releaseSlot(senderId);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? config.JOB_ATTEMPTS);
    const status = finalAttempt ? 'failed' : 'scheduled';
    await query(
      `UPDATE emails SET status = $2::email_status, error = $3, locked_at = NULL,
         sent_at = CASE WHEN $4::boolean THEN now() END
       WHERE id = $1`,
      [emailId, status, (err as Error).message, finalAttempt],
    );
    if (finalAttempt) void updateEmailDoc(emailId, { status: 'failed', sent_at: new Date() });
    log(`email ${emailId} failed (attempt ${job.attemptsMade + 1}): ${(err as Error).message}`);
    throw err; // let BullMQ apply backoff / retries
  }
}

async function alertLimitHit(email: EmailRow, scope: 'sender' | 'global', hourlyLimit: number, nextAt: number) {
  const { rows } = await query<{ email: string; pending: string }>(
    `SELECT s.email, (SELECT count(*) FROM emails WHERE sender_id = s.id AND status = 'scheduled'
       AND scheduled_at <= now() + interval '1 hour') AS pending
     FROM senders s WHERE s.id = $1`,
    [email.sender_id],
  );
  const limit = scope === 'sender' ? Math.min(hourlyLimit, config.MAX_EMAILS_PER_HOUR_PER_SENDER) : config.MAX_EMAILS_PER_HOUR;
  const msg = rateLimitMessage({
    senderEmail: rows[0]?.email ?? `sender #${email.sender_id}`,
    scope,
    limit,
    resumesAt: new Date(nextAt),
    pending: Number(rows[0]?.pending ?? 0),
  });
  const delivered = await notifySlack(email.user_id, msg.text, msg.blocks);
  log(`rate-limit alert for user ${email.user_id}: ${delivered ? 'sent to Slack' : 'Slack not connected, skipped'}`);
}
