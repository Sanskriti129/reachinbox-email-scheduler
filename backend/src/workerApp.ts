import { Worker } from 'bullmq';
import { config } from './config.js';
import { migrate } from './db/index.js';
import { EMAIL_QUEUE } from './lib/queue.js';
import { createRedis } from './lib/redis.js';
import { reconcileQueue } from './services/emails.js';
import { processSendJob } from './services/processor.js';
import type { SendEmailJob } from './types.js';

export async function startWorker() {
  await migrate();
  await reconcileQueue();

  const worker = new Worker<SendEmailJob>(EMAIL_QUEUE, processSendJob, {
    connection: createRedis(),
    // Several jobs can be in flight (SMTP I/O overlaps) ...
    concurrency: config.WORKER_CONCURRENCY,
    // ... but job *starts* are throttled globally in Redis: at most 1 per
    // MIN_DELAY_BETWEEN_SENDS_MS across ALL worker processes. This is the
    // "delay between each email" that mimics provider throttling.
    limiter:
      config.MIN_DELAY_BETWEEN_SENDS_MS > 0 ? { max: 1, duration: config.MIN_DELAY_BETWEEN_SENDS_MS } : undefined,
    // If a worker dies mid-job, the lock expires and another worker picks the job up.
    lockDuration: 60_000,
    stalledInterval: 30_000,
    maxStalledCount: 2,
  });

  worker.on('failed', (job, err) => console.warn(`[worker] job ${job?.id} failed: ${err.message}`));
  worker.on('error', (err) => console.error('[worker] error', err.message));

  console.log(
    `[worker] up — concurrency=${config.WORKER_CONCURRENCY}, minDelay=${config.MIN_DELAY_BETWEEN_SENDS_MS}ms, ` +
      `perSender/h=${config.MAX_EMAILS_PER_HOUR_PER_SENDER}, global/h=${config.MAX_EMAILS_PER_HOUR}`,
  );

  // Graceful shutdown: finish in-flight sends, don't pick up new ones.
  const stop = async () => {
    console.log('[worker] shutting down…');
    await worker.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return worker;
}
