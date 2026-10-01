import { Queue } from 'bullmq';
import { config } from '../config.js';
import type { SendEmailJob } from '../types.js';
import { createRedis } from './redis.js';

export const EMAIL_QUEUE = 'email-send';

export const emailQueue = new Queue<SendEmailJob>(EMAIL_QUEUE, {
  connection: createRedis(),
  defaultJobOptions: {
    attempts: config.JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5_000 },
    // Keep history bounded but long enough to inspect in the dashboard.
    removeOnComplete: { age: 24 * 3600, count: 5_000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/** Deterministic job id — BullMQ ignores `add` for an id that already exists. */
export const jobIdFor = (emailId: number) => `email-${emailId}`;

export interface PendingEmail {
  id: number;
  sender_id: number;
  scheduled_at: Date;
}

/**
 * Enqueue (or no-op if already enqueued) one delayed send per email, in chunks.
 * Safe to call repeatedly — deterministic job ids make it idempotent — which is
 * what scheduling, resume and boot-time reconciliation all rely on.
 */
export async function enqueueEmails(emails: PendingEmail[], hourlyLimit: number) {
  for (let i = 0; i < emails.length; i += 500) {
    await emailQueue.addBulk(
      emails.slice(i, i + 500).map((e) => ({
        name: 'send',
        data: { emailId: e.id, senderId: e.sender_id, hourlyLimit } satisfies SendEmailJob,
        opts: { jobId: jobIdFor(e.id), delay: Math.max(0, e.scheduled_at.getTime() - Date.now()) },
      })),
    );
  }
}

/**
 * Remove these emails' jobs. A job a worker currently holds can't be removed, but
 * the processor re-checks the row and campaign before sending, so it no-ops.
 */
export async function removeEmailJobs(emailIds: number[]) {
  await Promise.all(
    emailIds.map(async (id) => (await emailQueue.getJob(jobIdFor(id)))?.remove().catch(() => {})),
  );
}
