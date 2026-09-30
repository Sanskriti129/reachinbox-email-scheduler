import dotenv from 'dotenv';

dotenv.config({ quiet: true });
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),

  // Public URLs — used to build OAuth redirect URIs and post-login redirects.
  BACKEND_URL: z.string().default('http://localhost:4000'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/reachinbox'),
  DATABASE_SSL: bool,
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_API_KEY: z.string().optional(),
  ELASTICSEARCH_INDEX: z.string().default('emails'),

  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),

  // Scheduler / throughput knobs (all configurable, nothing hardcoded)
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_BETWEEN_SENDS_MS: z.coerce.number().int().nonnegative().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().positive().default(1000),
  JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),

  // Comma-separated Ethereal accounts "user:pass,user2:pass2". If empty, the
  // backend creates Ethereal test accounts on first boot and stores them in the DB.
  ETHEREAL_SENDERS: z.string().default(''),
  ETHEREAL_SENDER_COUNT: z.coerce.number().int().positive().default(3),

  // Fake network latency for load demos without hammering Ethereal.
  DRY_RUN_SMTP: bool,
});

export const config = schema.parse(process.env);
export type Config = typeof config;

export const isProd = config.NODE_ENV === 'production';
/** Secure cookies only when served over HTTPS (a local Docker run on http://localhost must still log in). */
export const secureCookies = config.BACKEND_URL.startsWith('https://');
