import pg from 'pg';

/** Create the throwaway test database once per run. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/reachinbox_test');
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
}
