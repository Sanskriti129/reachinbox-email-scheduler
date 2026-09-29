import { Redis } from 'ioredis';
import { config } from '../config.js';

/**
 * BullMQ requires maxRetriesPerRequest=null on connections used by workers.
 * Each caller gets its own connection (blocking commands can't share one).
 */
export function createRedis() {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

/** Shared connection for plain commands (rate-limit counters, OAuth state, etc). */
export const redis = createRedis();
