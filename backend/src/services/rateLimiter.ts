import { config } from '../config.js';
import { redis } from '../lib/redis.js';

const HOUR_MS = 3_600_000;

export const hourWindow = (t = Date.now()) => Math.floor(t / HOUR_MS);
export const nextWindowStart = (t = Date.now()) => (hourWindow(t) + 1) * HOUR_MS;

/**
 * Atomically reserve one send slot in the current hour, for BOTH the sender's
 * window and the global window. Either both counters are incremented or neither is,
 * so concurrent workers on any number of machines can never overshoot a limit.
 *
 * KEYS[1] = per-sender counter, KEYS[2] = global counter
 * ARGV[1] = sender limit, ARGV[2] = global limit, ARGV[3] = ttl seconds
 * Returns: 0 = allowed, 1 = sender limit hit, 2 = global limit hit
 */
const RESERVE_LUA = `
local s = tonumber(redis.call('GET', KEYS[1]) or '0')
local g = tonumber(redis.call('GET', KEYS[2]) or '0')
if s >= tonumber(ARGV[1]) then return 1 end
if g >= tonumber(ARGV[2]) then return 2 end
redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], ARGV[3])
return 0
`;

const RELEASE_LUA = `
if tonumber(redis.call('GET', KEYS[1]) or '0') > 0 then redis.call('DECR', KEYS[1]) end
if tonumber(redis.call('GET', KEYS[2]) or '0') > 0 then redis.call('DECR', KEYS[2]) end
return 0
`;

const senderKey = (senderId: number, w: number) => `rl:sender:${senderId}:${w}`;
const globalKey = (w: number) => `rl:global:${w}`;

export type ReserveResult = { ok: true } | { ok: false; scope: 'sender' | 'global' };

export async function reserveSlot(senderId: number, senderLimit: number): Promise<ReserveResult> {
  const w = hourWindow();
  const res = (await redis.eval(
    RESERVE_LUA,
    2,
    senderKey(senderId, w),
    globalKey(w),
    Math.min(senderLimit, config.MAX_EMAILS_PER_HOUR_PER_SENDER),
    config.MAX_EMAILS_PER_HOUR,
    2 * 3600,
  )) as number;
  if (res === 0) return { ok: true };
  return { ok: false, scope: res === 1 ? 'sender' : 'global' };
}

/** Give a slot back when a send fails, so failures don't eat the hourly budget. */
export async function releaseSlot(senderId: number) {
  const w = hourWindow();
  await redis.eval(RELEASE_LUA, 2, senderKey(senderId, w), globalKey(w));
}

/**
 * Where to put a job that was rate-limited. Overflow jobs are laid out in the
 * next window in the order they overflowed (a Redis counter per window), spaced by
 * the min delay — so the original ordering is preserved and the next hour doesn't
 * get a thundering herd at :00.
 */
export async function nextSlotAfterLimit(senderId: number): Promise<number> {
  const start = nextWindowStart();
  const key = `rl:overflow:${senderId}:${hourWindow(start)}`;
  const position = await redis.incr(key);
  await redis.expire(key, 3 * 3600);
  const spacing = Math.max(config.MIN_DELAY_BETWEEN_SENDS_MS, 100);
  // If the overflow is bigger than an hour's worth of spacing it just rolls on;
  // the next window's limit check will push it again, still in order.
  return start + (position - 1) * spacing;
}

/** Returns true exactly once per sender per hour window (used to de-dupe Slack alerts). */
export async function shouldNotifyLimit(senderId: number, scope: 'sender' | 'global') {
  const key = `rl:notified:${scope}:${scope === 'sender' ? senderId : 'all'}:${hourWindow()}`;
  return (await redis.set(key, '1', 'EX', 2 * 3600, 'NX')) === 'OK';
}

export async function usageThisHour(senderId: number) {
  const w = hourWindow();
  const [s, g] = await redis.mget(senderKey(senderId, w), globalKey(w));
  return { sender: Number(s ?? 0), global: Number(g ?? 0), windowEndsAt: nextWindowStart() };
}
