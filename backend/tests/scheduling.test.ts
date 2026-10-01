import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db/index.js';
import { emailQueue, jobIdFor } from '../src/lib/queue.js';
import { pauseCampaign, resumeCampaign } from '../src/services/campaigns.js';
import { cleanRecipients, reconcileQueue, scheduleCampaign, scheduleSchema } from '../src/services/emails.js';
import { closeAll, resetState, seedUserAndSender } from './helpers.js';

let ids: { userId: number; senderId: number };
beforeEach(async () => {
  await resetState();
  ids = await seedUserAndSender();
});
afterAll(closeAll);

const input = (recipients: string[], extra: Record<string, unknown> = {}) =>
  scheduleSchema.parse({
    senderId: ids.senderId,
    subject: 'Hello',
    body: '<p>Hi there</p>',
    recipients,
    startAt: new Date(Date.now() + 3_600_000).toISOString(),
    delayMs: 5000,
    hourlyLimit: 100,
    ...extra,
  });

describe('recipient cleaning', () => {
  it('drops invalid addresses and case-insensitive duplicates, keeping order', () => {
    const r = cleanRecipients(['B@x.com', 'not-an-email', 'a@x.com', 'b@X.com', '  c@x.com ']);
    expect(r.valid).toEqual(['b@x.com', 'a@x.com', 'c@x.com']);
    expect(r.invalid).toBe(1);
    expect(r.duplicates).toBe(1);
  });
});

describe('scheduling', () => {
  it('stores one row and one delayed job per recipient, spaced by the delay', async () => {
    const res = await scheduleCampaign(ids.userId, input(['a@x.com', 'b@x.com', 'c@x.com']));
    expect(res.scheduled).toBe(3);

    const { rows } = await query<{ id: number; scheduled_at: Date }>('SELECT id, scheduled_at FROM emails ORDER BY id');
    expect(rows[1]!.scheduled_at.getTime() - rows[0]!.scheduled_at.getTime()).toBe(5000);
    expect(rows[2]!.scheduled_at.getTime() - rows[1]!.scheduled_at.getTime()).toBe(5000);

    for (const r of rows) expect(await (await emailQueue.getJob(jobIdFor(r.id)))?.getState()).toBe('delayed');
  });

  it('strips dangerous HTML from the body before storing it', () => {
    const parsed = input(['a@x.com'], {
      body: '<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a>',
    });
    expect(parsed.body).toBe('<p>Hi</p><a>l</a>');
  });
});

describe('restart recovery (reconcile)', () => {
  it('re-creates jobs missing from Redis, and is a no-op when run again', async () => {
    await scheduleCampaign(ids.userId, input(['a@x.com', 'b@x.com']));
    const { rows } = await query<{ id: number }>('SELECT id FROM emails ORDER BY id');
    await (await emailQueue.getJob(jobIdFor(rows[0]!.id)))!.remove(); // simulate a lost job

    expect(await reconcileQueue()).toEqual({ pending: 2, restored: 1 });
    expect(await reconcileQueue()).toEqual({ pending: 2, restored: 0 });
    expect(await emailQueue.getDelayedCount()).toBe(2);
  });

  it('does not resurrect jobs of a paused campaign, and resume brings them back', async () => {
    const { campaignId } = await scheduleCampaign(ids.userId, input(['a@x.com', 'b@x.com']));
    await pauseCampaign(ids.userId, campaignId);
    expect(await emailQueue.getDelayedCount()).toBe(0);

    await reconcileQueue();
    expect(await emailQueue.getDelayedCount()).toBe(0);

    await resumeCampaign(ids.userId, campaignId);
    expect(await emailQueue.getDelayedCount()).toBe(2);
  });
});
