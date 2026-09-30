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
    // Resolve both IPv4 and IPv6 (hosts like Railway use IPv6-only private networking).
    family: 0,
  });
}

/** Shared connection for plain commands (rate-limit counters, OAuth state, etc). */
export const redis = createRedis();
