import type { Job } from 'bullmq';
import { migrate, pool, query } from '../src/db/index.js';
import { emailQueue } from '../src/lib/queue.js';
import { redis } from '../src/lib/redis.js';
import type { SendEmailJob } from '../src/types.js';

/** Fresh schema + empty tables + empty Redis test DB. */
export async function resetState() {
  await migrate();
  await query('TRUNCATE emails, campaigns, slack_connections, senders, users RESTART IDENTITY CASCADE');
  await redis.flushdb();
}

export async function seedUserAndSender() {
  const u = await query<{ id: number }>(
    `INSERT INTO users (google_id, email, name) VALUES ('g-test', 'tester@example.com', 'Tester') RETURNING id`,
  );
  const s = await query<{ id: number }>(
    `INSERT INTO senders (email, name, smtp_user, smtp_pass) VALUES ('sender@ethereal.email', 'Test Sender', 'sender@ethereal.email', 'x') RETURNING id`,
  );
  return { userId: u.rows[0]!.id, senderId: s.rows[0]!.id };
}

/** A stand-in for the BullMQ Job the worker receives; records moveToDelayed calls. */
export function fakeJob(data: SendEmailJob, attemptsMade = 0) {
  const delays: number[] = [];
  const job = {
    id: `email-${data.emailId}`,
    data,
    attemptsMade,
    opts: { attempts: 3 },
    moveToDelayed: async (ts: number) => {
      delays.push(ts);
    },
  } as unknown as Job<SendEmailJob>;
  return { job, delays };
}

export async function closeAll() {
  await emailQueue.close();
  redis.disconnect();
  await pool.end();
}
