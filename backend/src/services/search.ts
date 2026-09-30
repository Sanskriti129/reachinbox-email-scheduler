import { Client } from '@elastic/elasticsearch';
import { config } from '../config.js';
import type { EmailRow } from '../types.js';

export const es = new Client({
  node: config.ELASTICSEARCH_URL,
  ...(config.ELASTICSEARCH_API_KEY ? { auth: { apiKey: config.ELASTICSEARCH_API_KEY } } : {}),
});

const index = config.ELASTICSEARCH_INDEX;

export async function ensureIndex() {
  const exists = await es.indices.exists({ index });
  if (exists) return;
  await es.indices.create({
    index,
    mappings: {
      properties: {
        id: { type: 'integer' },
        user_id: { type: 'integer' },
        campaign_id: { type: 'integer' },
        sender_email: { type: 'keyword' },
        recipient: { type: 'text', fields: { raw: { type: 'keyword' } } },
        subject: { type: 'text' },
        body: { type: 'text' },
        status: { type: 'keyword' },
        scheduled_at: { type: 'date' },
        sent_at: { type: 'date' },
      },
    },
  });
}

/**
 * Search indexing is a secondary concern: Postgres is the source of truth, so an ES
 * outage must never break scheduling or sending. Failures are logged, not thrown.
 */
async function safe<T>(label: string, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[search] ${label} failed:`, (err as Error).message);
    return undefined;
  }
}

const toDoc = (e: EmailRow & { sender_email?: string }) => ({
  id: e.id,
  user_id: e.user_id,
  campaign_id: e.campaign_id,
  sender_email: e.sender_email,
  recipient: e.recipient,
  subject: e.subject,
  body: e.body.replace(/<[^>]+>/g, ' '),
  status: e.status,
  scheduled_at: e.scheduled_at,
  sent_at: e.sent_at,
});

export function indexEmails(rows: (EmailRow & { sender_email?: string })[]) {
  if (!rows.length) return Promise.resolve();
  return safe('bulk index', async () => {
    const operations = rows.flatMap((e) => [{ index: { _index: index, _id: String(e.id) } }, toDoc(e)]);
    await es.bulk({ operations, refresh: false });
  });
}

export function updateEmailDoc(id: number, patch: Partial<ReturnType<typeof toDoc>>) {
  return safe('update', () =>
    es.update({ index, id: String(id), doc: patch, doc_as_upsert: false, retry_on_conflict: 3 }),
  );
}

export function deleteEmailDoc(id: number) {
  return safe('delete', () => es.delete({ index, id: String(id) }));
}

export async function searchEmails(userId: number, q: string, status?: 'scheduled' | 'sent') {
  const filter: object[] = [{ term: { user_id: userId } }];
  if (status === 'sent') filter.push({ terms: { status: ['sent', 'failed'] } });
  if (status === 'scheduled') filter.push({ terms: { status: ['scheduled', 'sending'] } });

  const res = await es.search<{ id: number }>({
    index,
    size: 100,
    query: {
      bool: {
        filter,
        // Match as-you-type prefixes ("meet" → meeting) OR typos ("meting" → meeting).
        should: [
          { multi_match: { query: q, fields: ['recipient^3', 'subject^2', 'body'], type: 'bool_prefix' } },
          { multi_match: { query: q, fields: ['recipient^3', 'subject^2', 'body'], fuzziness: 'AUTO' } },
        ],
        minimum_should_match: 1,
      },
    },
  });
  return res.hits.hits.map((h) => h._source!.id);
}
