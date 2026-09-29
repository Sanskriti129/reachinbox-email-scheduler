import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** Applies schema.sql. Every statement is idempotent, so this runs on every boot. */
export async function migrate() {
  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  // Serialise concurrent boots (API + worker starting together) with an advisory lock.
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(424242)');
    await client.query(sql);
  } finally {
    await client.query('SELECT pg_advisory_unlock(424242)').catch(() => {});
    client.release();
  }
}
