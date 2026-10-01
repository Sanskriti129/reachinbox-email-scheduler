import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { query } from '../db/index.js';
import type { EmailRow, SenderRow } from '../types.js';

const SENDER_NAMES = ['Outreach Team', 'Sales Desk', 'Growth Team', 'Partnerships', 'Founders Office'];

/**
 * nodemailer.createTestAccount() caches one account per process, so calling it
 * N times yields the same inbox. Call Ethereal's API directly to get N distinct senders.
 */
async function createEtherealAccount() {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestor: 'reachinbox-scheduler', version: '1.0.0' }),
  });
  const data = (await res.json()) as {
    status: string;
    error?: string;
    user: string;
    pass: string;
    smtp: { host: string; port: number };
  };
  if (data.status !== 'success') throw new Error(`Ethereal account creation failed: ${data.error ?? res.status}`);
  return data;
}

/**
 * Make sure we have SMTP senders to send from.
 * - ETHEREAL_SENDERS="user:pass,user2:pass2" → use those accounts.
 * - otherwise, if the table is empty, create fresh Ethereal test accounts.
 */
export async function ensureSenders() {
  const fromEnv = config.ETHEREAL_SENDERS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(':');
      return { user: pair.slice(0, i), pass: pair.slice(i + 1) };
    });

  for (const [i, acc] of fromEnv.entries()) {
    await query(
      `INSERT INTO senders (email, name, smtp_user, smtp_pass) VALUES ($1,$2,$1,$3)
       ON CONFLICT (email) DO UPDATE SET smtp_pass = EXCLUDED.smtp_pass`,
      [acc.user, SENDER_NAMES[i % SENDER_NAMES.length], acc.pass],
    );
  }

  const { rows } = await query<{ count: string }>('SELECT count(*) FROM senders');
  const missing = config.ETHEREAL_SENDER_COUNT - Number(rows[0].count);
  for (let i = 0; i < missing; i++) {
    const acc = await createEtherealAccount();
    await query(
      `INSERT INTO senders (email, name, smtp_host, smtp_port, smtp_user, smtp_pass)
       VALUES ($1,$2,$3,$4,$1,$5) ON CONFLICT (email) DO NOTHING`,
      [acc.user, SENDER_NAMES[i % SENDER_NAMES.length], acc.smtp.host, acc.smtp.port, acc.pass],
    );
    console.log(`[mailer] created Ethereal sender ${acc.user}`);
  }
}

export async function listSenders() {
  const { rows } = await query<Pick<SenderRow, 'id' | 'email' | 'name'>>(
    'SELECT id, email, name FROM senders ORDER BY id',
  );
  return rows;
}

const transporters = new Map<number, Transporter>();

async function transporterFor(senderId: number) {
  let t = transporters.get(senderId);
  if (t) return t;
  const { rows } = await query<SenderRow>('SELECT * FROM senders WHERE id = $1', [senderId]);
  const s = rows[0];
  if (!s) throw new Error(`Sender ${senderId} not found`);
  t = nodemailer.createTransport({
    host: s.smtp_host,
    port: s.smtp_port,
    secure: false,
    auth: { user: s.smtp_user, pass: s.smtp_pass },
    pool: true,
    maxConnections: 2,
    // Fail fast (and retry) instead of hanging if the SMTP server is unreachable.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  (t as any).__sender = s;
  transporters.set(senderId, t);
  return t;
}

export interface SendResult {
  messageId: string;
  previewUrl: string | null;
}

export async function sendEmail(email: EmailRow): Promise<SendResult> {
  // Deterministic Message-ID: even in the (guarded-against) event of a double send,
  // the receiving side can de-duplicate on it.
  const messageId = `<email-${email.id}.campaign-${email.campaign_id}@reachinbox-scheduler>`;

  if (config.DRY_RUN_SMTP) {
    await new Promise((r) => setTimeout(r, 150));
    return { messageId, previewUrl: null };
  }

  const t = await transporterFor(email.sender_id);
  const sender: SenderRow = (t as any).__sender;
  const info = await t.sendMail({
    from: `"${sender.name}" <${sender.email}>`,
    to: email.recipient,
    subject: email.subject,
    html: email.body,
    text: email.body.replace(/<[^>]+>/g, ''),
    messageId,
  });
  return { messageId: info.messageId, previewUrl: nodemailer.getTestMessageUrl(info) || null };
}
