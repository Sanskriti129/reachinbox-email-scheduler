import { DelayedError } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db/index.js';
import { pauseCampaign } from '../src/services/campaigns.js';
import { scheduleCampaign, scheduleSchema } from '../src/services/emails.js';
import { processSendJob } from '../src/services/processor.js';
import { nextWindowStart } from '../src/services/rateLimiter.js';
import { closeAll, fakeJob, resetState, seedUserAndSender } from './helpers.js';

let ids: { userId: number; senderId: number };
beforeEach(async () => {
  await resetState();
  ids = await seedUserAndSender();
});
afterAll(closeAll);

async function schedule(recipients: string[], hourlyLimit = 100) {
  const res = await scheduleCampaign(
    ids.userId,
    scheduleSchema.parse({
      senderId: ids.senderId,
      subject: 'S',
      body: '<p>B</p>',
      recipients,
      startAt: new Date().toISOString(),
      delayMs: 0,
      hourlyLimit,
    }),
  );
  const { rows } = await query<{ id: number }>('SELECT id FROM emails WHERE campaign_id = $1 ORDER BY id', [res.campaignId]);
  return { campaignId: res.campaignId, emailIds: rows.map((r) => r.id), hourlyLimit };
}

const rowOf = async (id: number) =>
  (
    await query<{ status: string; reschedule_count: number; scheduled_at: Date }>(
      'SELECT status, reschedule_count, scheduled_at FROM emails WHERE id = $1',
      [id],
    )
  ).rows[0]!;

describe('send job processor', () => {
  it('sends an email once; replaying the job is a no-op', async () => {
    const { emailIds, hourlyLimit } = await schedule(['a@x.com']);
    const data = { emailId: emailIds[0]!, senderId: ids.senderId, hourlyLimit };

    expect(await processSendJob(fakeJob(data).job)).toHaveProperty('messageId');
    expect((await rowOf(data.emailId)).status).toBe('sent');
    expect(await processSendJob(fakeJob(data).job)).toEqual({ skipped: 'already sent' });
  });

  it('two workers racing on the same email send it exactly once', async () => {
    const { emailIds, hourlyLimit } = await schedule(['a@x.com']);
    const data = { emailId: emailIds[0]!, senderId: ids.senderId, hourlyLimit };

    const results = await Promise.allSettled([processSendJob(fakeJob(data).job), processSendJob(fakeJob(data).job)]);
    const sends = results.filter((r) => r.status === 'fulfilled' && 'messageId' in (r.value as object));
    expect(sends).toHaveLength(1);
    // The loser either saw it already sent, or (lock still fresh) deferred itself to re-check later.
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(DelayedError);
    expect((await rowOf(data.emailId)).status).toBe('sent');
  });

  it('defers to the next hour instead of failing when the hourly limit is hit', async () => {
    const { emailIds, hourlyLimit } = await schedule(['a@x.com', 'b@x.com'], 1);
    await processSendJob(fakeJob({ emailId: emailIds[0]!, senderId: ids.senderId, hourlyLimit }).job);

    const { job, delays } = fakeJob({ emailId: emailIds[1]!, senderId: ids.senderId, hourlyLimit });
    await expect(processSendJob(job)).rejects.toBeInstanceOf(DelayedError);
    expect(delays[0]).toBeGreaterThanOrEqual(nextWindowStart());

    const second = await rowOf(emailIds[1]!);
    expect(second.status).toBe('scheduled');
    expect(second.reschedule_count).toBe(1);
    expect(second.scheduled_at.getTime()).toBe(delays[0]);
  });

  it('does not send emails of a paused campaign', async () => {
    const { campaignId, emailIds, hourlyLimit } = await schedule(['a@x.com']);
    await pauseCampaign(ids.userId, campaignId);
    const res = await processSendJob(fakeJob({ emailId: emailIds[0]!, senderId: ids.senderId, hourlyLimit }).job);
    expect(res).toEqual({ skipped: 'campaign paused' });
    expect((await rowOf(emailIds[0]!)).status).toBe('scheduled');
  });
});
