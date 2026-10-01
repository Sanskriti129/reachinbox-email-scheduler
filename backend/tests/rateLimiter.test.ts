import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { redis } from '../src/lib/redis.js';
import {
  nextSlotAfterLimit,
  nextWindowStart,
  releaseSlot,
  reserveSlot,
  shouldNotifyLimit,
  usageThisHour,
} from '../src/services/rateLimiter.js';

beforeEach(async () => {
  await redis.flushdb();
});
afterAll(() => redis.disconnect());

describe('hourly rate limiter (Redis + Lua)', () => {
  it('never exceeds the limit when 50 workers race for 5 slots', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => reserveSlot(1, 5)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.scope === 'sender')).toBe(true);
    expect((await usageThisHour(1)).sender).toBe(5);
  });

  it('keeps separate budgets per sender', async () => {
    expect((await reserveSlot(1, 1)).ok).toBe(true);
    expect((await reserveSlot(1, 1)).ok).toBe(false);
    expect((await reserveSlot(2, 1)).ok).toBe(true);
  });

  it('gives a slot back when a send fails', async () => {
    await reserveSlot(1, 1);
    expect((await reserveSlot(1, 1)).ok).toBe(false);
    await releaseSlot(1);
    expect((await reserveSlot(1, 1)).ok).toBe(true);
  });

  it('places overflow in the next window in arrival order, spaced out', async () => {
    const start = nextWindowStart();
    const slots = [await nextSlotAfterLimit(7), await nextSlotAfterLimit(7), await nextSlotAfterLimit(7)];
    expect(slots[0]).toBe(start);
    expect(slots[1]! - slots[0]!).toBeGreaterThan(0);
    expect(slots[2]! - slots[1]!).toBe(slots[1]! - slots[0]!);
  });

  it('alerts Slack at most once per sender per hour', async () => {
    expect(await shouldNotifyLimit(3, 'sender')).toBe(true);
    expect(await shouldNotifyLimit(3, 'sender')).toBe(false);
    expect(await shouldNotifyLimit(4, 'sender')).toBe(true);
  });
});
