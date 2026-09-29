/**
 * Load demo: schedules N emails for (roughly) the same moment, bypassing HTTP,
 * so you can watch concurrency, the min delay and the hourly limit kick in.
 *
 *   npm run load-test -- --count 1000 --limit 20 --user you@gmail.com
 *
 * Tip: run the worker with DRY_RUN_SMTP=true for large counts so Ethereal
 * isn't hammered; the scheduler behaves identically.
 */
import { pool, query } from '../src/db/index.js';
import { emailQueue } from '../src/lib/queue.js';
import { redis } from '../src/lib/redis.js';
import { scheduleCampaign } from '../src/services/emails.js';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1]! : fallback;
};

const count = Number(arg('count', '1000'));
const hourlyLimit = Number(arg('limit', '50'));
const userEmail = arg('user', '');

const { rows: users } = await query<{ id: number; email: string }>(
  userEmail ? 'SELECT id, email FROM users WHERE email = $1' : 'SELECT id, email FROM users ORDER BY id LIMIT 1',
  userEmail ? [userEmail] : [],
);
if (!users[0]) throw new Error('No user found — log in through the UI once first.');
const { rows: senders } = await query<{ id: number; email: string }>('SELECT id, email FROM senders ORDER BY id LIMIT 1');

const recipients = Array.from({ length: count }, (_, i) => `lead${i + 1}.${Date.now()}@example.com`);
const t0 = Date.now();
const res = await scheduleCampaign(users[0].id, {
  senderId: senders[0]!.id,
  subject: `Load test ${new Date().toLocaleTimeString()}`,
  body: '<p>Hi there — this is a load-test email from the ReachInbox scheduler.</p>',
  recipients,
  startAt: new Date(Date.now() + 5_000),
  delayMs: 0, // everyone at the same moment: the worker limiter spaces them out
  hourlyLimit,
});

console.log(
  `Scheduled ${res.scheduled} emails for ${users[0].email} via ${senders[0]!.email} in ${Date.now() - t0}ms.\n` +
    `Hourly limit ${hourlyLimit}: the first ${hourlyLimit} send this hour, the rest roll into the next windows.\n` +
    `Watch it live at /admin/queues`,
);
await emailQueue.close();
redis.disconnect();
await pool.end();
