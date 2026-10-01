import { defineConfig } from 'vitest/config';

// Integration tests run against real Postgres + Redis (docker compose, or CI services),
// isolated in their own database and Redis DB index so they never touch dev data.
const pg = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/reachinbox_test';
const redis = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

export default defineConfig({
  test: {
    globalSetup: ['tests/globalSetup.ts'],
    fileParallelism: false, // tests share one DB and one queue
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: pg,
      REDIS_URL: redis,
      ELASTICSEARCH_URL: process.env.TEST_ELASTICSEARCH_URL ?? 'http://127.0.0.1:1', // unreachable: indexing is best-effort
      ELASTICSEARCH_INDEX: 'emails_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      ENCRYPTION_KEY: 'test-encryption-key',
      DRY_RUN_SMTP: 'true',
      MIN_DELAY_BETWEEN_SENDS_MS: '0',
      MAX_EMAILS_PER_HOUR_PER_SENDER: '200',
      MAX_EMAILS_PER_HOUR: '1000',
    },
  },
});
