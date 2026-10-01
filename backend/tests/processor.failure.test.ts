import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../src/db/index.js';
import { scheduleCampaign, scheduleSchema } from '../src/services/emails.js';
import { processSendJob } from '../src/services/processor.js';
import { usageThisHour } from '../src/services/rateLimiter.js';
import { closeAll, fakeJob, resetState, seedUserAndSender } from './helpers.js';

// SMTP is unreachable for this whole file (e.g. a host that blocks port 587).
vi.mock('../src/services/mailer.js', async (orig) => ({
  ...(await orig<typeof import('../src/services/mailer.js')>()),
  sendEmail: vi.fn().mockRejectedValue(new Error('Connection timeout')),
}));

let ids: { userId: number; senderId: number };
beforeEach(async () => {
  await resetState();
  ids = await seedUserAndSender();
});
afterAll(closeAll);

async function oneEmail() {
  const res = await scheduleCampaign(
    ids.userId,
    scheduleSchema.parse({
      senderId: ids.senderId,
      subject: 'S',
      body: '<p>B</p>',
      recipients: ['a@x.com'],
      startAt: new Date().toISOString(),
      delayMs: 0,
      hourlyLimit: 10,
    }),
  );
  const { rows } = await query<{ id: number }>('SELECT id FROM emails WHERE campaign_id = $1', [res.campaignId]);
  return rows[0]!.id;
}

const rowOf = async (id: number) =>
  (
    await query<{ status: string; error: string | null; sent_at: Date | null }>(
      'SELECT status, error, sent_at FROM emails WHERE id = $1',
      [id],
    )
  ).rows[0]!;

describe('when SMTP fails', () => {
  it('puts the email back for a retry and refunds the hourly slot', async () => {
    const id = await oneEmail();
    const { job } = fakeJob({ emailId: id, senderId: ids.senderId, hourlyLimit: 10 }, 0);
    await expect(processSendJob(job)).rejects.toThrow('Connection timeout');
    expect(await rowOf(id)).toMatchObject({ status: 'scheduled', error: 'Connection timeout', sent_at: null });
    expect((await usageThisHour(ids.senderId)).sender).toBe(0);
  });

  it('marks the email failed after the last attempt (never stuck in "sending")', async () => {
    const id = await oneEmail();
    const { job } = fakeJob({ emailId: id, senderId: ids.senderId, hourlyLimit: 10 }, 2);
    await expect(processSendJob(job)).rejects.toThrow('Connection timeout');
    const r = await rowOf(id);
    expect(r.status).toBe('failed');
    expect(r.sent_at).not.toBeNull();
  });
});
