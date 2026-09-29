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

/**
 * Enqueue (or no-op if already enqueued) a delayed send for one email.
 * Safe to call repeatedly: this is what makes boot-time reconciliation idempotent.
 */
export async function enqueueEmail(job: SendEmailJob, scheduledAt: Date) {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());
  return emailQueue.add('send', job, { jobId: jobIdFor(job.emailId), delay });
}
